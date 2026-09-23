import { notFound } from "next/navigation";
import Topbar from "@/components/dashboard/Topbar";
import ProfileSettings from "@/components/dashboard/ProfileSettings";
import DeleteAccountCard from "@/components/dashboard/DeleteAccountCard";
import BillingCard, { isBillingNotice } from "@/components/dashboard/BillingCard";
import { currentTutorId } from "@/auth";
import { getLessonTotal, getTutor } from "@/db/queries";
import { lessonUsage, studentUsage } from "@/lib/quota";

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
        <div className="grid max-w-5xl gap-4">
          {/* Profile and plan sit side by side on wide screens. `items-start`
              keeps the shorter plan card at its natural height instead of
              stretching it to match the profile form. */}
          <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
            <ProfileSettings
              name={tutor.name}
              email={tutor.email}
              memberSince={memberSince}
            />

            {/* Right column: the plan, then the billing that will govern it. */}
            <div className="grid gap-4">
              {/* Plan & usage — what quota.ts will actually enforce. */}
              <div className="rounded-2xl border border-line bg-surface p-6 shadow-soft-sm">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div className="font-semibold text-ink">Plan &amp; usage</div>
                  <span className="rounded-full bg-brand-soft px-3 py-1 text-[.82rem] font-semibold text-brand-deep">
                    {lessons.plan.name}
                  </span>
                </div>

                {unlimited ? (
                  <>
                    <div className="mt-5 text-sm text-ink-soft">
                      <span className="font-semibold text-ink">{lessons.used}</span>{" "}
                      {lessons.used === 1 ? "lesson" : "lessons"} recorded this month
                    </div>
                    {nearFairUse && (
                      <p className="mt-2 text-[.82rem] text-muted">
                        Fair use caps your plan at {lessons.limit} lessons a month,
                        resetting on the 1st.
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <div className="mt-5 text-sm text-ink-soft">
                      <span className="font-semibold text-ink">
                        {lessons.used} of {lessons.limit}
                      </span>{" "}
                      {lessons.plan.lessonWindow === "lifetime"
                        ? "free trial lessons used"
                        : "lessons used this month"}
                    </div>
                    <div className="mt-2 h-2 overflow-hidden rounded-full bg-brand-soft">
                      <div
                        className="h-full rounded-full bg-brand transition-[width] duration-500"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <p className="mt-2 text-[.82rem] text-muted">
                      {lessons.plan.lessonWindow === "lifetime"
                        ? "The trial doesn't reset — choose a plan to keep recording."
                        : "Resets on the 1st of each month."}
                    </p>
                  </>
                )}

                <div className="mt-5 border-t border-line pt-4 text-sm text-ink-soft">
                  <span className="font-semibold text-ink">{students.used}</span>{" "}
                  {students.used === 1 ? "student profile" : "student profiles"}
                  {students.limit !== null && <> of {students.limit} included</>}
                </div>
              </div>

              <BillingCard
                tutor={tutor}
                plan={lessons.plan}
                notice={isBillingNotice(billing) ? billing : undefined}
              />
            </div>
          </div>

          {/* Data export — sits right above deletion, since "take your data with
              you first" is exactly what the delete card and the Terms advise. */}
          <div className="rounded-2xl border border-line bg-surface p-6 shadow-soft-sm">
            <div className="font-semibold text-ink">Download your data</div>
            <p className="mt-1.5 text-sm text-ink-soft">
              Your account, student profiles and lesson notes as a single JSON file.
              Use it to keep a copy, move elsewhere, or answer a student who asks what
              you hold about them.
            </p>
            <a
              href="/dashboard/settings/export"
              download
              className="mt-4 inline-flex items-center gap-2 rounded-lg border border-line bg-white px-4 py-2.5 text-sm font-semibold text-ink-soft transition-all duration-200 hover:-translate-y-0.5 hover:text-ink"
            >
              Download export
            </a>
          </div>

          {/* Last on the page, and set apart — the only irreversible control here. */}
          <DeleteAccountCard
            email={tutor.email}
            studentCount={students.used}
            lessonCount={lessonTotal}
          />
        </div>
      </div>
    </>
  );
}
