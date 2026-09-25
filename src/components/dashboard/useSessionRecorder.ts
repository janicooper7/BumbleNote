"use client";

// Shared in-page lesson-recording engine, used by both the student-page CTA
// (SessionRecorder) and the global sidebar button (RecordLessonButton).
//
// Captures the lesson tab's audio via getDisplayMedia (= student) and the mic
// via getUserMedia (= tutor) as two separate tracks. On stop the recording goes
// straight into the browser outbox (lib/pending-uploads) and is uploaded from
// there, so a failed upload or a closed tab no longer loses the lesson — the
// dashboard banner (PendingUploads) picks up anything left behind.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  queueLessonRecording,
  retryLessonProcessing,
  sendPendingLesson,
  UploadError,
} from "@/lib/upload-client";
import { withUploadLock } from "@/lib/pending-uploads";

export type RecorderStatus = "idle" | "recording" | "processing" | "error";

// Flush a data chunk every 5s. Without a timeslice, MediaRecorder buffers the
// whole lesson into a single WebM blob with no duration/periodic-cluster
// metadata, and Deepgram's pre-recorded API only transcribes the first portion
// of such a file (~10 min) — silently truncating long lessons. Periodic chunks
// produce a well-formed, fully-transcribable stream. The chunks are concatenated
// back into one blob on stop.
const TIMESLICE_MS = 5000;

// A stop this soon after starting is a false start — a mis-click, or a restart to
// fix the share. Uploading it only produced a "No speech was detected" failure
// card for the tutor (and an alert for us), so it is dropped on the spot instead.
const MIN_RECORDING_SEC = 30;

// Live level check. A track that stays below AUDIBLE_RMS for SILENCE_WARN_SEC is
// flagged while recording, so a muted mic or an unshared tab surfaces during the
// lesson rather than as an empty transcript after it. AUDIBLE_RMS (~-46 dBFS) sits
// between a silent mic's noise floor (~-55 dBFS, measured on a real failed
// lesson) and speech, which with the browser's auto-gain is far louder.
const AUDIBLE_RMS = 0.005;
const SILENCE_WARN_SEC = 90;
const LEVEL_POLL_MS = 250;

type Track = "student" | "tutor";

export function useSessionRecorder() {
  const router = useRouter();

  const [status, setStatus] = useState<RecorderStatus>("idle");
  const [error, setError] = useState<string | undefined>();
  const [elapsed, setElapsed] = useState(0);

  const displayStream = useRef<MediaStream | null>(null);
  const micStream = useRef<MediaStream | null>(null);
  const recorders = useRef<MediaRecorder[]>([]);
  const blobs = useRef<{ student?: Blob; tutor?: Blob }>({});
  const remaining = useRef(0);
  const startedAt = useRef(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const studentId = useRef("");
  const isTrial = useRef(false);
  // The outbox entry for the last recording; set once it is safely queued.
  const queuedId = useRef<string | null>(null);
  const failure = useRef<UploadError | null>(null);
  const [canRetry, setCanRetry] = useState(false);
  const [silent, setSilent] = useState<Track[]>([]);
  const stopLevels = useRef<(() => void) | null>(null);
  const tooShort = useRef(false);

  useEffect(() => {
    // Stop any live capture if the tutor navigates away mid-recording.
    return () => stopTracks();
  }, []);

  useEffect(() => {
    // Recording and upload both live only in this tab's memory until the draft
    // exists — closing or refreshing here silently loses the whole lesson with
    // no server-side trace to recover from. Warn before that can happen.
    if (status !== "recording" && status !== "processing") return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Most browsers show their own fixed wording here regardless of this
      // string, but a few engines still surface it — worth setting anyway.
      e.returnValue =
        "BumbleNote hasn't saved this lesson yet — closing this tab now will lose it. Click Stop & file lesson first.";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [status]);

  function stopTracks() {
    if (timer.current) clearInterval(timer.current);
    stopLevels.current?.();
    stopLevels.current = null;
    setSilent([]);
    displayStream.current?.getTracks().forEach((t) => t.stop());
    micStream.current?.getTracks().forEach((t) => t.stop());
    displayStream.current = null;
    micStream.current = null;
  }

  function makeRecorder(stream: MediaStream, key: "student" | "tutor") {
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(stream, { mimeType: "audio/webm" });
    rec.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunks.push(e.data);
    };
    rec.onstop = () => {
      blobs.current[key] = new Blob(chunks, { type: "audio/webm" });
      remaining.current -= 1;
      if (remaining.current > 0) return;
      if (tooShort.current) {
        stopTracks();
        blobs.current = {};
        setError(
          `That recording was under ${MIN_RECORDING_SEC} seconds, so it wasn’t kept. Start recording again once the lesson is under way.`,
        );
        setCanRetry(false);
        setStatus("error");
        return;
      }
      void upload();
    };
    return rec;
  }

  async function start(id: string, trial = false) {
    studentId.current = id;
    isTrial.current = trial;
    setError(undefined);
    try {
      // Video is required for the tab picker; we only record the audio track,
      // but keep the video track alive so the share (and its audio) stays open.
      const display = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      displayStream.current = display;

      const tabAudio = display.getAudioTracks()[0];
      if (!tabAudio) {
        stopTracks();
        throw new Error(
          "No tab audio was shared. When the browser asks, pick your lesson tab and tick “Share tab audio”.",
        );
      }
      // If the tutor ends the share from the browser bar, treat it as Stop.
      tabAudio.addEventListener("ended", () => {
        if (recorders.current.length) stop();
      });

      const mic = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStream.current = mic;

      const studentStream = new MediaStream([tabAudio]);
      blobs.current = {};
      queuedId.current = null;
      failure.current = null;
      remaining.current = 2;
      recorders.current = [
        makeRecorder(studentStream, "student"),
        makeRecorder(mic, "tutor"),
      ];
      recorders.current.forEach((r) => r.start(TIMESLICE_MS));
      tooShort.current = false;
      stopLevels.current = watchLevels({ student: tabAudio, tutor: mic.getAudioTracks()[0] }, setSilent);

      startedAt.current = Date.now();
      setElapsed(0);
      setStatus("recording");
      timer.current = setInterval(
        () => setElapsed(Math.floor((Date.now() - startedAt.current) / 1000)),
        1000,
      );
    } catch (err) {
      stopTracks();
      const e = err as DOMException;
      if (e?.name === "NotAllowedError") {
        setStatus("idle"); // user dismissed the share picker
        return;
      }
      setError(err instanceof Error ? err.message : "Couldn't start recording.");
      setStatus("error");
    }
  }

  function stop() {
    if (timer.current) clearInterval(timer.current);
    tooShort.current = Date.now() - startedAt.current < MIN_RECORDING_SEC * 1000;
    stopLevels.current?.();
    stopLevels.current = null;
    setSilent([]);
    setStatus("processing");
    recorders.current.forEach((r) => {
      if (r.state !== "inactive") r.stop();
    });
    recorders.current = [];
  }

  function finish(id: string) {
    stopTracks();
    blobs.current = {};
    queuedId.current = null;
    failure.current = null;
    // Draft is ready — clear the recording UI (the sidebar button lives in the
    // persistent layout, so it won't unmount on navigation) and open the lesson.
    setStatus("idle");
    setElapsed(0);
    setCanRetry(false);
    router.push(`/dashboard/sessions/${id}`);
  }

  function fail(err: unknown) {
    stopTracks();
    failure.current = err instanceof UploadError ? err : null;
    setError(err instanceof Error ? err.message : "Couldn't process the recording.");
    setCanRetry(
      failure.current?.retry === "reprocess" ||
        (failure.current?.retry === "reupload" && !!queuedId.current),
    );
    setStatus("error");
  }

  async function upload() {
    try {
      if (!queuedId.current) {
        const { student, tutor } = blobs.current;
        if (!student || !tutor) {
          throw new Error("The recording came through empty — please try again.");
        }
        // Into the outbox before anything touches the network: from here the
        // lesson survives a failed upload, a closed tab, or a crashed browser.
        queuedId.current = await queueLessonRecording({
          studentId: studentId.current,
          isTrial: isTrial.current,
          // Fixed now, so a retry minutes later doesn't inflate it.
          durationMin: Math.max(1, Math.round((Date.now() - startedAt.current) / 60000)),
          student,
          tutor,
        });
        blobs.current = {}; // the outbox holds them now
      }
      const id = queuedId.current;
      // Chunk-upload the two tracks to Netlify Blobs, then a background worker
      // transcribes + drafts and we poll for the finished lesson id. (A single
      // upload would blow Netlify's 6 MB body limit and 26–60 s function timeout.)
      const result = await withUploadLock(id, () => sendPendingLesson(id));
      if (!result) {
        throw new UploadError("This lesson is already uploading in another tab.", null);
      }
      finish(result.lessonId);
    } catch (err) {
      fail(err);
    }
  }

  /**
   * Try a failed lesson again without re-recording it. Which way depends on where
   * it failed — see UploadError. A re-upload resumes from the outbox copy.
   */
  async function retry() {
    const f = failure.current;
    if (!f?.retry) return;
    setError(undefined);
    setStatus("processing");
    if (f.retry === "reupload") return upload();
    try {
      const { lessonId } = await retryLessonProcessing(f.uploadId!);
      finish(lessonId);
    } catch (err) {
      fail(err);
    }
  }

  function reset() {
    // Deliberately leaves the outbox alone: closing the error dialog must not
    // throw away a lesson that hasn't reached the server yet.
    blobs.current = {};
    queuedId.current = null;
    failure.current = null;
    setCanRetry(false);
    setStatus("idle");
    setError(undefined);
  }

  return { status, elapsed, error, canRetry, silent, start, stop, retry, reset };
}

/**
 * Poll each track's level and report which have been silent for SILENCE_WARN_SEC.
 * Returns a cleanup. Best-effort: if WebAudio isn't available the recording goes
 * ahead without the check.
 */
function watchLevels(
  tracks: Record<Track, MediaStreamTrack | undefined>,
  onChange: (silent: Track[]) => void,
): () => void {
  let ctx: AudioContext;
  try {
    ctx = new AudioContext();
  } catch {
    return () => {};
  }
  // The start click gives the page user activation, so this resolves; it's only
  // here in case the context was created suspended.
  void ctx.resume().catch(() => {});

  const probes: { key: Track; analyser: AnalyserNode; buf: Float32Array<ArrayBuffer>; heardAt: number }[] = [];
  for (const key of ["student", "tutor"] as const) {
    const track = tracks[key];
    if (!track) continue;
    const analyser = ctx.createAnalyser();
    // The largest window (~0.7 s at 48 kHz): background tabs throttle the poll to
    // about once a second, and a wide window keeps that from missing speech.
    analyser.fftSize = 32768;
    ctx.createMediaStreamSource(new MediaStream([track])).connect(analyser);
    probes.push({ key, analyser, buf: new Float32Array(analyser.fftSize), heardAt: Date.now() });
  }

  let reported = "";
  const poll = setInterval(() => {
    const now = Date.now();
    const quiet: Track[] = [];
    for (const p of probes) {
      p.analyser.getFloatTimeDomainData(p.buf);
      let sum = 0;
      for (const v of p.buf) sum += v * v;
      if (Math.sqrt(sum / p.buf.length) >= AUDIBLE_RMS) p.heardAt = now;
      if (now - p.heardAt >= SILENCE_WARN_SEC * 1000) quiet.push(p.key);
    }
    const key = quiet.join();
    if (key !== reported) {
      reported = key;
      onChange(quiet);
    }
  }, LEVEL_POLL_MS);

  return () => {
    clearInterval(poll);
    void ctx.close().catch(() => {});
  };
}

/** What to tell the tutor about silent tracks mid-recording, or null if all is well. */
export function silenceWarning(silent: Track[]): string | null {
  const tab = silent.includes("student");
  const mic = silent.includes("tutor");
  if (tab && mic) {
    return "We haven’t heard anything from the lesson tab or your microphone for a while. Check the call is playing in the tab you shared and your mic isn’t muted.";
  }
  if (tab) {
    return "No sound from the lesson tab for a while. If your student is talking, the tab’s audio isn’t being captured — stop, then record again and tick “Share tab audio”.";
  }
  if (mic) {
    return "Your microphone has been silent for a while. Check it isn’t muted, or set to the wrong device in your browser.";
  }
  return null;
}

export function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
