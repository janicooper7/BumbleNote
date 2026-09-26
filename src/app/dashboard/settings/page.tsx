import { notFound } from "next/navigation";
import Topbar from "@/components/dashboard/Topbar";
import ProfileSettings from "@/components/dashboard/ProfileSettings";
import DeleteAccountCard from "@/components/dashboard/DeleteAccountCard";
import BillingCard, { isBillingNotice } from "@/components/dashboard/BillingCard";
import { currentTutorId } from "@/auth";
import { getLessonTotal, getTutor } from "@/db/queries";
import { lessonUsage, studentUsage } from "@/lib/quota";

const renewsOn = (d: Date | null) =>
  d ? d.toLocaleDateString("en-GB", { day: "numeric", month: "long", timeZone: "UTC" }) : "your billing date";

export default async function SettingsPage({ searchParams }: PageProps<"/dashboard/settings">) {
  // ?billing=success|pending|cancelled|error, set by the billing routes on the way back.
  const { billing } = await searchParams;
  const tutorId = await currentTutorId();
  const [tutor, lessons, students, lessonTotal] = await Promise.all([
    getTutor(),
    lessonUsage(tutorId),
    studentUsage(tutorId),
    getLessonTotal(),
  ]);

  // The session can outlive the row it points at — most plausibly right after
  // the tutor deletes their own account in the tab next door.
  if (!tutor) notFound();

  const pct = Math.min(100, Math.round((lessons.used / lessons.limit) * 100));
  const memberSince = tutor.createdAt.toLocaleDateString("en-GB", {
    month: "long",
    year: "numeric",
  });

  // Grandfathered (legacy) tutors were sold "unlimited", so there's no allowance
  // to count down and the "x of y" line and its bar are just noise. The 250 is a
  // real fair-use ceiling though, so it surfaces once they're close to hitting it.
  const unlimited = lessons.plan.id === "legacy";
  const nearFairUse = unlimited && pct >= 80;

  return (
    <>
      <Topbar title="Settings" subtitle="Account, billing, and preferences" />
      <div className="px-6 py-8 lg:px-10">
        <div className="max-w-4xl divide-y divide-line">
          <Section title="Profile" description="How you appear to students.">
            <ProfileSettings
              name={tutor.name}
              email={tutor.email}
              memberSince={memberSince}
            />
          </Section>

          {/* What quota.ts will actually enforce. */}
          <Section
            title="Plan & usage"
            description={
              <span className="rounded-full bg-brand-soft px-2.5 py-0.5 text-sm font-semibold text-brand-deep">
                {lessons.plan.name}
              </span>
            }
          >
            {unlimited ? (
              <>
                <div className="text-base text-ink-soft">
                  <span className="font-semibold text-ink">{lessons.used}</span>{" "}
                  {lessons.used === 1 ? "lesson" : "lessons"} recorded this month
                </div>
                {nearFairUse && (
                  <p className="mt-2 text-sm text-muted">
                    Fair use caps your plan at {lessons.limit} lessons a month,
                    resetting on the 1st.
                  </p>
                )}
              </>
            ) : (
              <>
                <div className="text-base text-ink-soft">
                  <span className="font-semibold text-ink">
                    {lessons.used} of {lessons.limit}
                  </span>{" "}
                  {lessons.plan.lessonWindow === "lifetime"
                    ? "free trial lessons used"
                    : lessons.rollover
                      ? "lessons used this billing month"
                      : "lessons used this month"}
                </div>
                <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-soft">
                  <div
                    className="h-full rounded-full bg-brand transition-[width] duration-500"
                    style={{ width: `${pct}%` }}
                  />
                </div>
                <p className="mt-2 text-sm text-muted">
                  {lessons.plan.lessonWindow === "lifetime"
                    ? "The trial doesn't reset — choose a plan to keep recording."
                    : lessons.rollover
                      ? <>
                          {lessons.rolledOver > 0 &&
                            `Includes ${lessons.rolledOver} carried over. `}
                          {lessons.paused
                            ? "Paused — no new lessons are added this billing month."
                            : <>
                                Your allowance resets on {renewsOn(lessons.renewsAt)}, your billing date.
                                <br />
                                Up to {lessons.plan.rolloverCap} unused lessons carry over.
                              </>}
                        </>
                      : "Resets on the 1st of each month."}
                </p>
              </>
            )}

            <div className="mt-4 text-base text-ink-soft">
              <span className="font-semibold text-ink">{students.used}</span>{" "}
              {students.used === 1 ? "student profile" : "student profiles"}
              {students.limit !== null && <> of {students.limit} included</>}
            </div>
          </Section>

          <Section title="Billing" description="Your plan, invoices and payment details.">
            <BillingCard
              tutor={tutor}
              plan={lessons.plan}
              lessonsLeft={lessons.remaining}
              notice={isBillingNotice(billing) ? billing : undefined}
            />
          </Section>

          {/* Last on the page — the only irreversible control here. */}
          <Section title="Delete account">
            <DeleteAccountCard
              email={tutor.email}
              studentCount={students.used}
              lessonCount={lessonTotal}
            />
          </Section>
        </div>
      </div>
    </>
  );
}

/**
 * One settings row: the heading sits in a narrow left column on wide screens and
 * the controls to its right, with hairlines between rows instead of cards.
 */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="grid gap-4 py-8 first:pt-0 md:grid-cols-[13rem_1fr] md:gap-10">
      <div>
        <h2 className="text-lg font-semibold text-ink">{title}</h2>
        {description && <div className="mt-1 text-sm text-muted">{description}</div>}
      </div>
      <div className="min-w-0">{children}</div>
    </section>
  );
}
