"use client";

// Shared in-page lesson-recording engine, used by both the student-page CTA
// (SessionRecorder) and the global sidebar button (RecordLessonButton).
//
// Captures the lesson tab's audio via getDisplayMedia (= student) and the mic
// via getUserMedia (= tutor) as two separate tracks, then on stop uploads both
// to a session-authed Server Action that transcribes and drafts the lesson.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { retryLessonProcessing, uploadLessonAudio, UploadError } from "@/lib/upload-client";

export type RecorderStatus = "idle" | "recording" | "processing" | "error";

// Flush a data chunk every 5s. Without a timeslice, MediaRecorder buffers the
// whole lesson into a single WebM blob with no duration/periodic-cluster
// metadata, and Deepgram's pre-recorded API only transcribes the first portion
// of such a file (~10 min) — silently truncating long lessons. Periodic chunks
// produce a well-formed, fully-transcribable stream. The chunks are concatenated
// back into one blob on stop.
const TIMESLICE_MS = 5000;

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
  // Fixed at the first upload attempt, so a retry minutes later doesn't inflate it.
  const durationMin = useRef(0);
  const failure = useRef<UploadError | null>(null);
  const [canRetry, setCanRetry] = useState(false);

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
      if (remaining.current <= 0) void upload();
    };
    return rec;
  }

  async function start(id: string) {
    studentId.current = id;
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
      durationMin.current = 0;
      failure.current = null;
      remaining.current = 2;
      recorders.current = [
        makeRecorder(studentStream, "student"),
        makeRecorder(mic, "tutor"),
      ];
      recorders.current.forEach((r) => r.start(TIMESLICE_MS));

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
    setStatus("processing");
    recorders.current.forEach((r) => {
      if (r.state !== "inactive") r.stop();
    });
    recorders.current = [];
  }

  function finish(id: string) {
    stopTracks();
    blobs.current = {};
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
        (failure.current?.retry === "reupload" && !!blobs.current.student && !!blobs.current.tutor),
    );
    setStatus("error");
  }

  async function upload() {
    if (!durationMin.current) {
      durationMin.current = Math.max(1, Math.round((Date.now() - startedAt.current) / 60000));
    }
    try {
      if (!blobs.current.student || !blobs.current.tutor) {
        throw new Error("The recording came through empty — please try again.");
      }
      // Chunk-upload the two tracks to Netlify Blobs, then a background worker
      // transcribes + drafts and we poll for the finished lesson id. (A single
      // upload would blow Netlify's 6 MB body limit and 26–60 s function timeout.)
      const { lessonId } = await uploadLessonAudio({
        studentId: studentId.current,
        durationMin: durationMin.current,
        student: blobs.current.student,
        tutor: blobs.current.tutor,
      });
      finish(lessonId);
    } catch (err) {
      fail(err);
    }
  }

  /**
   * Try a failed lesson again without re-recording it. Which way depends on where
   * it failed — see UploadError. The recording stays in memory until the lesson
   * is drafted, so a re-upload works as long as this page hasn't been closed.
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
    blobs.current = {};
    failure.current = null;
    setCanRetry(false);
    setStatus("idle");
    setError(undefined);
  }

  return { status, elapsed, error, canRetry, start, stop, retry, reset };
}

export function formatElapsed(totalSec: number): string {
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}
