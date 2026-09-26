import Topbar from "@/components/dashboard/Topbar";
import LessonSection from "@/components/dashboard/LessonSection";
import { LESSON_SECTIONS } from "@/lib/lesson-sections";
import { sortSessions } from "@/lib/mock";
import { getSessions } from "@/db/queries";

export default async function LessonsPage() {
  const sessions = sortSessions(await getSessions(), "date");

  return (
    <>
      <Topbar title="Lessons" subtitle="Every recorded session and its feedback status" />

      <div className="px-6 py-8 lg:px-10">
        {sessions.length === 0 ? (
          <p className="max-w-5xl border-y border-line py-6 text-base text-muted">
            No lessons recorded yet.
          </p>
        ) : (
          <div className="max-w-5xl divide-y divide-line">
            {LESSON_SECTIONS.map((section) => (
              <LessonSection
                key={section.status}
                {...section}
                sessions={sessions.filter((s) => s.status === section.status)}
              />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
