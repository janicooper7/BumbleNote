"use client";

import { useState, useTransition } from "react";
import Avatar from "./Avatar";
import { updateTutorName } from "@/app/actions/tutor";
import { MAX_NAME_LENGTH, normalizeTutorName } from "@/lib/tutor";

export default function ProfileSettings({
  name,
  email,
  memberSince,
}: {
  name: string;
  email: string;
  memberSince: string;
}) {
  // Server props are the source of truth; `saved` is the last value we know the
  // database holds, so the Save button can tell a real edit from a no-op.
  const [saved, setSaved] = useState(name);
  const [draft, setDraft] = useState(name);
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  // The name field and account details are tucked away: most visits to
  // settings aren't to rename yourself.
  const [open, setOpen] = useState(false);

  // Compare normalized, so trailing spaces alone don't arm the Save button.
  const dirty = normalizeTutorName(draft) !== saved;
  const initial = (saved[0] || email[0] || "?").toUpperCase();

  function save() {
    if (!dirty || pending) return;
    setError(null);
    startTransition(async () => {
      const res = await updateTutorName(draft);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setSaved(res.name);
      setDraft(res.name);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2000);
    });
  }

  return (
    <div>
      <div className="flex items-center gap-4">
        <Avatar initial={initial} size={56} />
        <div className="min-w-0 flex-1">
          <div className="truncate font-display text-lg text-ink uppercase tracking-[.03em]">
            {saved}
          </div>
          <div className="truncate text-base text-muted">{email}</div>
        </div>
        <button
          onClick={() => {
            // Closing throws away an unsaved edit rather than leaving it hidden.
            if (open) {
              setDraft(saved);
              setError(null);
            }
            setOpen(!open);
          }}
          aria-expanded={open}
          aria-controls="profile-details"
          className="flex flex-none items-center gap-1.5 text-base font-medium text-ink-soft transition-colors hover:text-ink"
        >
          {open ? "Close" : "Edit profile"}
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className={`transition-transform duration-200 ${open ? "rotate-180" : ""}`}
          >
            <path d="m6 9 6 6 6-6" />
          </svg>
        </button>
      </div>

      {open && (
        <div id="profile-details">
          <div className="mt-6">
            <label
              htmlFor="tutor-name"
              className="text-sm font-bold uppercase tracking-wide text-muted"
            >
              Display name
            </label>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                id="tutor-name"
                autoFocus
                value={draft}
                maxLength={MAX_NAME_LENGTH}
                onChange={(e) => {
                  setDraft(e.target.value);
                  setError(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") save();
                  if (e.key === "Escape") {
                    setDraft(saved);
                    setError(null);
                  }
                }}
                placeholder="Your name"
                className="min-w-[12rem] flex-1 rounded-xl border border-brand-line bg-white px-3.5 py-2.5 text-base text-ink outline-none transition-all focus:border-brand focus:ring-4 focus:ring-brand/30"
              />
              <button
                onClick={save}
                disabled={!dirty || pending}
                className="flex-none rounded-full bg-cocoa px-5 py-2.5 text-sm font-semibold text-butter transition-all duration-200 hover:-translate-y-0.5 disabled:translate-y-0 disabled:opacity-45 uppercase tracking-[.1em] hover:bg-cocoa-lift"
              >
                {pending ? "Saving…" : "Save"}
              </button>
              {justSaved && (
                <span className="self-center text-sm font-semibold text-mint">
                  Saved ✓
                </span>
              )}
            </div>
            {error ? (
              <p className="mt-2 text-sm font-medium text-[#a23b38]">{error}</p>
            ) : (
              <p className="mt-2 text-sm text-muted">
                Students see this: it&rsquo;s the subject line and sign-off on
                their lesson emails, and the credit on every report PDF.
              </p>
            )}
          </div>

          <dl className="mt-6 flex flex-col gap-3 text-base">
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-soft">Email</dt>
              <dd className="truncate text-right font-semibold text-ink">
                {email}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-soft">Signed in with</dt>
              <dd className="text-right font-semibold text-ink">Google</dd>
            </div>
            <div className="flex items-center justify-between gap-4">
              <dt className="text-ink-soft">Member since</dt>
              <dd className="text-right font-semibold text-ink">
                {memberSince}
              </dd>
            </div>
          </dl>
          <p className="mt-3 text-sm text-muted">
            Your email comes from your Google account and can&rsquo;t be changed
            here.
          </p>
        </div>
      )}
    </div>
  );
}
