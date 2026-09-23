"use client";

// The "my student agreed to this" tick that gates every recording. Shared by the
// sidebar picker (RecordLessonButton) and the student page (SessionRecorder) so
// the wording — which is effectively a legal statement — can only exist once.

import Link from "next/link";

export default function ConsentCheck({
  checked,
  onChange,
  name,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  /** Student's first name, when known. */
  name?: string;
}) {
  return (
    <label className="mb-3 mt-3 flex cursor-pointer items-start gap-2.5 rounded-xl bg-sky-soft px-3.5 py-3 text-sm leading-relaxed text-ink-soft">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 h-4 w-4 flex-none accent-[#412e28]"
      />
      <span>
        <span className="font-semibold text-ink">
          {name ?? "My student"} has agreed to this lesson being recorded
        </span>{" "}
        — or a parent or guardian has, if they&apos;re under 18.{" "}
        <Link href="/privacy#students" target="_blank" className="underline underline-offset-2 hover:text-ink">
          What to tell them
        </Link>
      </span>
    </label>
  );
}
