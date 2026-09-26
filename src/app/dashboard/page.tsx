import Link from "next/link";
import Topbar from "@/components/dashboard/Topbar";
import Greeting from "@/components/dashboard/Greeting";
import Avatar from "@/components/dashboard/Avatar";
import LessonSection from "@/components/dashboard/LessonSection";
import { LESSON_SECTIONS } from "@/lib/lesson-sections";
import LevelBadge from "@/components/dashboard/LevelBadge";
import { ArrowUpIcon } from "@/components/dashboard/icons";
import FailedLessons, { type FailedLessonItem } from "@/components/dashboard/FailedLessons";
import { currentTutorId } from "@/auth";
import { getPendingSessions, getSessions, getStudents, getTutor } from "@/db/queries";
import { isPermanentFailure, listFailedLessons } from "@/lib/failed-lessons";
import { AUDIO_RETENTION_MS } from "@/lib/upload-store";
import { dailyNote } from "@/lib/daily-note";

// Monday 00:00 of the week containing `d`.
function startOfWeek(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const mondayOffset = (x.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0, …
  x.setDate(x.getDate() - mondayOffset);
  return x;
}

type StatTone = "up" | "down" | "muted";

const STUDENT_SNAPSHOT = 5;

/**
 * Failed lessons for the Retry banner. Best-effort: Netlify Blobs isn't available
 * under plain `next dev`, and a storage hiccup must never take the dashboard
 * down with it.
 */
async function failedLessonsFor(
  tutorId: string,
  studentNames: Map<string, string>,
): Promise<FailedLessonItem[]> {
  try {
    const failed = await listFailedLessons(tutorId);
    return failed.map((f) => ({
      uploadId: f.uploadId,
      studentName: studentNames.get(f.studentId) ?? "a student",
      durationMin: f.durationMin,
      failedAt: f.failedAt,
      error: f.error,
      canRetry: !isPermanentFailure(f.error),
      daysLeft: Math.max(1, Math.ceil((f.failedAt + AUDIO_RETENTION_MS - Date.now()) / 86_400_000)),
    }));
  } catch (err) {
    console.error("could not load failed lessons", err);
    return [];
  }
}

export default async function DashboardHome() {
  const tutorId = await currentTutorId();
  const [tutor, pending, students, sessions] = await Promise.all([
    getTutor(),
    getPendingSessions(),
    getStudents(),
    getSessions(),
  ]);
  const failed = await failedLessonsFor(tutorId, new Map(students.map((s) => [s.id, s.name])));

  // The tutor row, not the JWT — the name is editable in Settings.
  const firstName = tutor?.name.trim().split(/\s+/)[0] || "there";
  const activeCount = students.filter((s) => s.active !== false).length;
  // The home page is a snapshot, not the roster: a handful of students, active
  // ones first, with "View all" for the rest.
  const snapshot = [...students]
    .sort((a, b) => Number(a.active === false) - Number(b.active === false))
    .slice(0, STUDENT_SNAPSHOT);
  // Only drafts still "need review" — a confirmed lesson has been reviewed and
  // is just awaiting send, so it stays in the list but isn't counted as a draft.
  const draftCount = pending.filter((s) => s.status === "draft").length;
  // Reviewed already, but the report hasn't gone out to the student yet.
  const confirmedCount = pending.filter((s) => s.status === "confirmed").length;

  // Real lessons-per-week from session dates, plus a week-over-week trend.
  const thisWeekStart = startOfWeek(new Date());
  const lastWeekStart = new Date(thisWeekStart);
  lastWeekStart.setDate(lastWeekStart.getDate() - 7);
  const dateOf = (iso: string) => new Date(`${iso}T00:00:00`);
  const thisWeek = sessions.filter((s) => dateOf(s.isoDate) >= thisWeekStart).length;
  const lastWeek = sessions.filter(
    (s) => dateOf(s.isoDate) >= lastWeekStart && dateOf(s.isoDate) < thisWeekStart,
  ).length;
  const weekDiff = thisWeek - lastWeek;
  const weekDelta =
    weekDiff > 0 ? `+${weekDiff} vs last week`
    : weekDiff < 0 ? `${weekDiff} vs last week`
    : "same as last week";
  const weekTone: StatTone = weekDiff > 0 ? "up" : weekDiff < 0 ? "down" : "muted";

  const stats: { label: string; value: string; delta: string; tone: StatTone }[] = [
    { label: "Active students", value: String(activeCount), delta: "on your roster", tone: "muted" },
    { label: "Lessons this week", value: String(thisWeek), delta: weekDelta, tone: weekTone },
    { label: "Drafts to review", value: String(draftCount), delta: "Awaiting you", tone: "muted" },
    { label: "Ready to send to student", value: String(confirmedCount), delta: "Not sent yet", tone: "muted" },
  ];

  return (
    <>
      <Topbar title={<Greeting name={firstName} />} subtitle="Here's what's happened since your last lessons." />

      <div className="px-6 py-8 lg:px-10">
        <FailedLessons items={failed} />

        {/* A daily note from the founders — warmth, not a task, so it sits
            quietly above the numbers. */}
        <figure className="relative mb-8 flex items-center gap-4 overflow-hidden rounded-2xl border border-sky/60 bg-gradient-to-r from-sky-soft via-sky-soft/60 to-white px-5 py-4 sm:gap-5 sm:px-6">
          <div className="flex flex-none -space-x-2.5" aria-hidden>
            {["M", "J"].map((i) => (
              <span
                key={i}
                className="grid h-10 w-10 place-items-center rounded-full bg-cocoa font-display text-base text-butter ring-[3px] ring-white"
              >
                {i}
              </span>
            ))}
          </div>
          <div className="min-w-0">
            <blockquote className="text-lg font-medium leading-snug text-ink">&ldquo;{dailyNote()}&rdquo;</blockquote>
            <figcaption className="mt-1 text-sm text-ink-soft">
              Daily message from <span className="font-semibold text-ink">Millie &amp; Jani</span>
            </figcaption>
          </div>
        </figure>

        {/* Stats read as one strip, not four cards: they're context, not controls. */}
        <dl className="grid grid-cols-2 gap-x-6 gap-y-6 border-b border-line pb-8 xl:grid-cols-4">
          {stats.map((s) => (
            <div key={s.label}>
              <dt className="text-sm text-ink-soft">{s.label}</dt>
              <dd className="mt-1.5 font-display text-[2rem] leading-none text-ink uppercase tracking-[.03em]">
                {s.value}
              </dd>
              <dd
                className={`mt-2 inline-flex items-center gap-1 text-sm ${
                  s.tone === "up" ? "font-medium text-success-deep" : s.tone === "down" ? "text-ink-soft" : "text-muted"
                }`}
              >
                {s.tone === "up" && <ArrowUpIcon size={13} />}
                {s.tone === "down" && <ArrowUpIcon size={13} className="rotate-180" />}
                {s.delta}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-8 grid grid-cols-1 gap-10 lg:grid-cols-[1.4fr_1fr]">
          {/* review queue */}
          <section className="min-w-0">
            <SectionHeader title="Awaiting you" href="/dashboard/lessons" link="All lessons" />
            {pending.length === 0 ? (
              <p className="border-y border-line py-6 text-base text-muted">
                <span className="font-semibold text-ink">All caught up.</span> Every lesson
                has been reviewed and sent — new drafts will appear here.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {/* Only the buckets that still need the tutor — sent lessons live on the lessons page. */}
                {LESSON_SECTIONS.filter((section) => section.status !== "sent").map((section) => (
                  <LessonSection
                    key={section.status}
                    {...section}
                    sessions={pending.filter((s) => s.status === section.status)}
                    nested
                  />
                ))}
              </div>
            )}
          </section>

          {/* students snapshot */}
          <section className="min-w-0">
            <SectionHeader
              title="Your students"
              href="/dashboard/students"
              link={students.length > STUDENT_SNAPSHOT ? `View all ${students.length}` : "View all"}
            />
            {students.length === 0 ? (
              <p className="border-y border-line py-6 text-base text-muted">
                No students yet.{" "}
                <Link href="/dashboard/students/new" className="font-semibold text-brand-deep hover:underline">
                  Add your first
                </Link>
              </p>
            ) : (
              <ul className="divide-y divide-line border-y border-line">
                {snapshot.map((st) => (
                  <li key={st.id}>
                    <Link
                      href={`/dashboard/students/${st.id}`}
                      className="group -mx-2 flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-brand-soft/40"
                    >
                      <Avatar initial={st.initial} size={40} />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-semibold text-ink">{st.name}</div>
                        <div className="truncate text-sm text-muted">{st.goal}</div>
                      </div>
                      <LevelBadge level={st.level} lessonCount={st.lessonCount} />
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </>
  );
}

/** A home-page section heading with its "see everything" link on the right. */
function SectionHeader({ title, href, link }: { title: string; href: string; link: string }) {
  return (
    <div className="mb-3 flex items-baseline justify-between gap-4">
      <h2 className="text-lg font-semibold text-ink">{title}</h2>
      <Link href={href} className="text-sm font-semibold text-brand-deep hover:underline">
        {link}
      </Link>
    </div>
  );
}
