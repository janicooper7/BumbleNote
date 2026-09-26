// The "How-to guides" in the dashboard sidebar. Each guide gets its own page at
// /dashboard/guides/<slug>. Until a guide has a `video`, its page shows a
// "coming soon" placeholder.
//
// `video` takes any of:
//   - a YouTube link (watch, youtu.be, embed or shorts URL) or a bare video ID —
//     shown as a click-to-play thumbnail, so YouTube only loads on click
//   - a direct file URL (.mp4 / .webm / .mov, e.g. a file in /public/guides/)
//   - any other embed URL (Loom, Vimeo "embed" links)

export type Guide = {
  slug: string;
  title: string;
  summary: string;
  video?: string;
};

export const GUIDES: Guide[] = [
  {
    slug: "add-a-student",
    title: "Add a student",
    summary: "Set up a student's profile: level, goals, interests and native language.",
    video: "/guides/add-a-student.webm",
  },
  {
    slug: "record-a-lesson",
    title: "Record a lesson",
    summary: "Capture your lesson's tab audio and microphone straight from the browser.",
    video: "/guides/record-a-lesson.webm",
  },
  {
    slug: "review-lesson-notes",
    title: "Review and edit lesson notes",
    summary: "Check the generated feedback, vocabulary and homework, and make it your own.",
    video: "/guides/review-lesson-notes.webm",
  },
  {
    slug: "combine-lessons",
    title: "Combine lessons",
    summary: "Join a lesson that was recorded in parts into one set of notes.",
    video: "/guides/combine-lessons.webm",
  },
  {
    slug: "track-student-progress",
    title: "Track a student's progress",
    summary: "Use the student page to see lesson history, metrics and vocabulary bank.",
    video: "/guides/track-student-progress.webm",
  },
  {
    slug: "manage-your-plan",
    title: "Manage your plan",
    summary: "Upgrade, downgrade or pause your plan, and see your lessons left.",
    video: "/guides/manage-your-plan.webm",
  },
  {
    slug: "edit-your-profile",
    title: "Edit your profile",
    summary: "Update your name and the email your lesson reports are sent to.",
    video: "/guides/edit-your-profile.webm",
  },
];

export function getGuide(slug: string): Guide | undefined {
  return GUIDES.find((g) => g.slug === slug);
}

export function isVideoFile(url: string): boolean {
  return /\.(mp4|webm|mov)(\?|#|$)/i.test(url);
}

/**
 * Pull the 11-character video ID out of a YouTube link, or accept a bare ID.
 * Returns null for anything that isn't YouTube.
 */
export function youTubeId(input: string): string | null {
  const value = input.trim();
  if (/^[\w-]{11}$/.test(value)) return value;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www\.|m\.)/, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.split("/")[1] ?? null;
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    id =
      url.searchParams.get("v") ??
      url.pathname.match(/^\/(?:embed|shorts|live)\/([^/]+)/)?.[1] ??
      null;
  }
  return id && /^[\w-]{11}$/.test(id) ? id : null;
}
