// Owns the actual audio capture + recording, then uploads to BumbleNote.
//   - tab audio  -> the STUDENT (the remote participant, played into the tab)
//   - microphone -> the TUTOR   (this machine's mic)
// For a 1-on-1 browser call this cleanly separates the two speakers without any
// AI diarization, on ANY web-based platform (Zoom web, Meet, Preply, etc.).
//
// On stop, each track is silence-trimmed (audio-trim.js — Deepgram bills the
// duration we submit, and each track is mostly the other person talking), then
// both are chunk-uploaded to {appUrl}/api/upload/* (Netlify's 6 MB request limit
// means we can't POST a whole lesson at once), then a background worker
// transcribes them and drafts the lesson. Nothing is saved to disk.
//
// Mirrors the web app's src/lib/upload-client.ts — keep the two in sync.

const CHUNK_SIZE = 4 * 1024 * 1024; // 4 MB, under Netlify's 6 MB function limit.
const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS = 15 * 60 * 1000;

function partCount(blob) {
  return Math.max(1, Math.ceil(blob.size / CHUNK_SIZE));
}

// Upload one track's slices sequentially. Keeps the extension code simple; a
// lesson is a few dozen small requests at most.
async function uploadTrack(base, token, uploadId, track, blob) {
  const parts = partCount(blob);
  for (let i = 0; i < parts; i++) {
    const slice = blob.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    const res = await fetch(
      `${base}/api/upload/chunk?uploadId=${uploadId}&track=${track}&part=${i}`,
      { method: "POST", headers: { Authorization: `Bearer ${token}` }, body: slice },
    );
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data.error || `Upload failed (${res.status}).`);
    }
  }
  return parts;
}

let started = false;
let tabStream = null;
let micStream = null;
let audioCtx = null;
let recorders = [];
let pending = 0;
const blobs = {}; // { student: Blob, tutor: Blob }

function recordStream(stream, label) {
  const chunks = [];
  const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
  rec.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  rec.onstop = () => {
    blobs[label] = new Blob(chunks, { type: "audio/webm" });
    pending -= 1;
    if (pending <= 0) upload();
  };
  return rec;
}

async function upload() {
  const { appUrl, captureToken, studentId, startedAt } = await chrome.storage.local.get([
    "appUrl",
    "captureToken",
    "studentId",
    "startedAt",
  ]);

  const durationMin = Math.max(1, Math.round((Date.now() - (startedAt || Date.now())) / 60000));

  try {
    if (!appUrl || !captureToken) throw new Error("Extension isn't connected — open settings.");
    if (!studentId) throw new Error("No student selected.");
    if (!blobs.student || !blobs.tutor) throw new Error("Recording was empty.");

    const base = appUrl.replace(/\/+$/, "");
    const uploadId = crypto.randomUUID();

    // 1. Cut the silence out of each track, keeping the map that says what was
    //    cut. Uploading less is a bonus; the point is the Deepgram bill.
    const trimmed = {
      student: await BumbleNoteTrim.trimSilence(blobs.student),
      tutor: await BumbleNoteTrim.trimSilence(blobs.tutor),
    };
    for (const track of ["student", "tutor"]) {
      const t = trimmed[track];
      console.log(
        `[capture] ${track}: ${t.originalSec.toFixed(0)}s -> ${t.trimmedSec.toFixed(0)}s` +
          `${t.map ? "" : " (untrimmed)"}`,
      );
    }
    const trimMaps = { student: trimmed.student.map, tutor: trimmed.tutor.map };

    // 2. Chunk-upload both tracks.
    const parts = {
      student: await uploadTrack(base, captureToken, uploadId, "student", trimmed.student.blob),
      tutor: await uploadTrack(base, captureToken, uploadId, "tutor", trimmed.tutor.blob),
    };

    // 3. Finalize — kicks the background worker.
    const completeRes = await fetch(`${base}/api/upload/complete`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${captureToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ uploadId, studentId, durationMin, parts, trimMaps }),
    });
    const completeData = await completeRes.json().catch(() => ({}));
    if (!completeRes.ok) {
      throw new Error(completeData.error || `Couldn't start processing (${completeRes.status}).`);
    }

    // 4. Poll until the draft is ready.
    const deadline = Date.now() + POLL_TIMEOUT_MS;
    let lessonId = "";
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
      const res = await fetch(`${base}/api/upload/status?uploadId=${uploadId}`, {
        headers: { Authorization: `Bearer ${captureToken}` },
      });
      if (!res.ok) continue;
      const status = await res.json();
      if (status.state === "done") { lessonId = status.lessonId; break; }
      if (status.state === "error") throw new Error(status.error || "Processing failed.");
    }
    if (!lessonId) throw new Error("Processing timed out — please try again.");

    chrome.runtime.sendMessage({
      type: "UPLOAD_RESULT",
      ok: true,
      id: lessonId,
      url: `${base}/dashboard/sessions/${lessonId}`,
    });
  } catch (err) {
    chrome.runtime.sendMessage({
      type: "UPLOAD_RESULT",
      ok: false,
      error: String(err && err.message ? err.message : err),
    });
  } finally {
    cleanup();
  }
}

function cleanup() {
  try { tabStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { micStream?.getTracks().forEach((t) => t.stop()); } catch {}
  try { audioCtx?.close(); } catch {}
  chrome.runtime.sendMessage({ type: "CAPTURE_DONE" });
  started = false;
  recorders = [];
  delete blobs.student;
  delete blobs.tutor;
}

async function start(streamId) {
  if (started) return;
  started = true;
  try {
    // Tab audio (the student). Chrome's tab-capture constraint syntax.
    tabStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        mandatory: {
          chromeMediaSource: "tab",
          chromeMediaSourceId: streamId,
        },
      },
    });

    // Microphone (the tutor). Permission is granted once from the popup.
    micStream = await navigator.mediaDevices.getUserMedia({ audio: true });

    // Capturing tab audio silences it for the user, so route it back to the
    // speakers — otherwise the tutor can't hear the student.
    audioCtx = new AudioContext();
    audioCtx.createMediaStreamSource(tabStream).connect(audioCtx.destination);

    const tabRec = recordStream(tabStream, "student");
    const micRec = recordStream(micStream, "tutor");
    recorders = [tabRec, micRec];
    pending = 2;
    // Flush a chunk every 5s. Without a timeslice, MediaRecorder emits one big
    // WebM blob at stop with no duration/periodic-cluster metadata, and Deepgram
    // only transcribes its first portion (~10 min) — truncating long lessons.
    tabRec.start(5000);
    micRec.start(5000);
  } catch (err) {
    started = false;
    chrome.runtime.sendMessage({
      type: "CAPTURE_ERROR",
      error: String(err && err.message ? err.message : err),
    });
  }
}

function stop() {
  recorders.forEach((r) => {
    if (r.state !== "inactive") r.stop();
  });
}

chrome.runtime.onMessage.addListener((msg) => {
  if (msg.target !== "offscreen") return;
  if (msg.type === "START") start(msg.streamId);
  else if (msg.type === "STOP") stop();
});

// Also pick up a pending start on load, in case the doc was created after the
// START message was broadcast.
chrome.storage.local.get("pendingStreamId").then(({ pendingStreamId }) => {
  if (pendingStreamId && !started) start(pendingStreamId);
});
