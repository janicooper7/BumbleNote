"use client";

import { useState } from "react";
import { deleteAccount } from "@/app/actions/tutor";

/**
 * The account-deletion row. Rendered last on the settings page — it's the most
 * destructive control there, so nothing sits below it to be mis-clicked past.
 */
export default function DeleteAccountCard({
  email,
  studentCount,
  lessonCount,
}: {
  email: string;
  studentCount: number;
  lessonCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Typing the email is deliberate friction: this wipes every student and
  // lesson, and there is no undo.
  const matches = confirm.trim().toLowerCase() === email.toLowerCase();

  async function handleDelete() {
    if (!matches) return;
    setDeleting(true);
    setError(null);
    try {
      await deleteAccount();
    } catch (err) {
      // A successful delete redirects, which surfaces as a thrown control-flow
      // signal — re-throw it and only report anything that isn't that.
      if (isRedirectError(err)) throw err;
      setDeleting(false);
      setError("Something went wrong deleting your account. Please try again.");
    }
  }

  const losing = [
    `${studentCount} student ${studentCount === 1 ? "profile" : "profiles"}`,
    `${lessonCount} ${lessonCount === 1 ? "lesson" : "lessons"}`,
  ].join(" and ");

  return (
    // Collapsed, it's a quiet row rather than an alarm; the red only appears
    // once the tutor has actually opened the confirmation.
    <div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
        <p className="min-w-0 text-base text-ink-soft">
          Permanently removes your account along with {losing}.
        </p>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className="shrink-0 text-base font-medium text-ink-soft underline decoration-line underline-offset-4 transition-colors hover:text-[#a23b38] hover:decoration-[#f0c4c2]"
          >
            Delete account…
          </button>
        )}
      </div>

      {open && (
        <div className="mt-4 rounded-xl border border-[#f0c4c2] bg-[#fdf1f1]/60 p-4">
          <p className="mb-3 text-base text-ink-soft">This can&rsquo;t be undone.</p>
          <label htmlFor="delete-confirm" className="text-base font-medium text-[#a23b38]">
            Type <span className="font-semibold">{email}</span> to confirm.
          </label>
          <input
            id="delete-confirm"
            autoFocus
            autoComplete="off"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            placeholder={email}
            className="mt-2.5 w-full rounded-xl border border-[#f0c4c2] bg-white px-3.5 py-2.5 text-base text-ink outline-none transition-all focus:border-[#d9534f] focus:ring-4 focus:ring-[#d9534f]/20"
          />
          {error && <p className="mt-2 text-sm font-medium text-[#a23b38]">{error}</p>}
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              onClick={handleDelete}
              disabled={!matches || deleting}
              className="rounded-lg bg-[#d9534f] px-4 py-2 text-sm font-semibold text-white transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-50"
            >
              {deleting ? "Deleting…" : "Delete everything"}
            </button>
            <button
              onClick={() => {
                setOpen(false);
                setConfirm("");
                setError(null);
              }}
              disabled={deleting}
              className="rounded-lg border border-line bg-white px-4 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function isRedirectError(err: unknown): boolean {
  return typeof (err as { digest?: unknown })?.digest === "string" &&
    (err as { digest: string }).digest.startsWith("NEXT_REDIRECT");
}
