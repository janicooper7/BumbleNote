import { LEVEL_DETERMINATION_LESSONS, isLevelDetermined } from "@/lib/student-options";

/**
 * The level chip shown wherever a student's level appears. Below
 * `LEVEL_DETERMINATION_LESSONS` it reads as pending instead of showing the
 * tutor's starting guess as if BumbleNote had confirmed it — `lessonCount`
 * left undefined skips that check for callers that don't have it on hand
 * (e.g. a session with no matching student row).
 */
export default function LevelBadge({
  level,
  lessonCount,
  className = "",
}: {
  level: string;
  lessonCount?: number;
  className?: string;
}) {
  if (lessonCount === undefined || isLevelDetermined(lessonCount)) {
    return (
      <span
        className={`inline-flex items-center rounded-full bg-brand-soft px-2.5 py-1 text-xs font-semibold text-brand-deep ${className}`}
      >
        {level}
      </span>
    );
  }

  const remaining = LEVEL_DETERMINATION_LESSONS - lessonCount;
  return (
    <span
      title={`BumbleNote needs at least ${LEVEL_DETERMINATION_LESSONS} lessons to confirm a level — ${remaining} more to go.`}
      className={`inline-flex items-center rounded-full bg-amber/12 px-2.5 py-1 text-xs font-semibold text-brand-deep ${className}`}
    >
      Determining level · {lessonCount}/{LEVEL_DETERMINATION_LESSONS}
    </span>
  );
}
