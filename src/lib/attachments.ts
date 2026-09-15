// Files a tutor attaches to a lesson report (worksheets, slides, a photo of the
// whiteboard). Emailed to the student alongside the PDF when the report is sent.
//
// Client-safe: the review screen imports these to check a file before uploading,
// and the server action re-checks with the same rules.

/** Total size of every file attached to one lesson, not per file — it's what
 *  lands in the student's inbox, and mail providers start bouncing past ~10MB. */
export const MAX_ATTACHMENT_TOTAL_BYTES = 2 * 1024 * 1024;

/**
 * Longest an attached file is kept. Normally it's gone much sooner — deleted the
 * moment the report is sent, since the student then has their own copy. This cap
 * covers drafts that are never sent. Enforced by the daily sweep
 * (src/lib/attachment-retention.ts) and published in the privacy policy via
 * LEGAL.attachmentRetentionDays.
 */
export const ATTACHMENT_RETENTION_DAYS = 10;

/**
 * Documents, images and audio a tutor would reasonably send. An allowlist rather
 * than a blocklist: anything executable or scriptable is what gets a sender's
 * domain flagged, and Resend rejects several of those outright anyway.
 */
export const ALLOWED_ATTACHMENT_EXTENSIONS = [
  "pdf",
  "doc",
  "docx",
  "odt",
  "rtf",
  "txt",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
  "csv",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "webp",
  "mp3",
  "m4a",
  "wav",
] as const;

export type AttachmentMeta = {
  id: string;
  filename: string;
  size: number;
};

export function attachmentExtension(filename: string): string {
  const dot = filename.lastIndexOf(".");
  return dot === -1 ? "" : filename.slice(dot + 1).toLowerCase();
}

export function isAllowedAttachment(filename: string): boolean {
  return (ALLOWED_ATTACHMENT_EXTENSIONS as readonly string[]).includes(
    attachmentExtension(filename),
  );
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
