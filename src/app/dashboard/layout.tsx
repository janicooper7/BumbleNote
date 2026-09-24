import type { Metadata } from "next";
import { auth, currentTutorId } from "@/auth";
import Sidebar from "@/components/dashboard/Sidebar";
import PendingUploads from "@/components/dashboard/PendingUploads";
import { bnFontVars } from "@/components/bn/fonts";
import { getStudents, getTutor, hasCombinableLessons } from "@/db/queries";
import { lessonUsage } from "@/lib/quota";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import {
  acceptedCurrentTerms,
  recordTermsAcceptance,
  TERMS_COOKIE,
  TERMS_VERSION,
} from "@/lib/terms";

// Everything under /dashboard is one tutor's own data and sits behind auth, so a
// crawler can't reach it anyway — this just keeps the sign-in redirects out of
// Search Console as soft-404s.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

// Only gates whether the sidebar's "Combine lessons" CTA shows — a DB hiccup
// here must never take the whole dashboard down with it.
async function canCombineLessonsFor(): Promise<boolean> {
  try {
    return await hasCombinableLessons();
  } catch (err) {
    console.error("could not check combinable lessons", err);
    return false;
  }
}

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [session, tutorId] = await Promise.all([auth(), currentTutorId()]);
  const [allStudents, usage, tutor, canCombineLessons] = await Promise.all([
    getStudents(),
    lessonUsage(tutorId),
    getTutor(),
    canCombineLessonsFor(),
  ]);

  // Terms gate (see lib/terms). A Google signup accepted on the signup page and
  // arrives with the cookie; anyone else without the current version is sent to
  // accept it before seeing the dashboard.
  if (tutor && !acceptedCurrentTerms(tutor.termsVersion)) {
    const cookie = (await cookies()).get(TERMS_COOKIE)?.value;
    if (cookie === TERMS_VERSION) await recordTermsAcceptance(tutorId);
    else redirect("/accept-terms");
  }

  const students = allStudents
    .filter((s) => s.active !== false)
    .map((s) => ({ id: s.id, name: s.name, initial: s.initial }));

  // Only the display-facing slice crosses into the client component.
  const quota = {
    used: usage.used,
    limit: usage.limit,
    remaining: usage.remaining,
    allowed: usage.allowed,
    planName: usage.plan.name,
    trial: usage.plan.lessonWindow === "lifetime",
  };

  // Prefer the tutor row over the JWT: the token keeps whatever name Google
  // supplied at sign-in, so a rename in Settings wouldn't show here until the
  // token was reissued.
  const user = tutor
    ? { name: tutor.name, email: tutor.email }
    : session?.user ?? null;

  return (
    // .theme-bn puts the dashboard in the homepage's template-pack look: the
    // shared tokens re-read as cocoa / butter / sky and the Gilda + Jost fonts.
    <div className={`theme-bn ${bnFontVars} flex min-h-screen`}>
      <Sidebar
        user={user}
        students={students}
        quota={quota}
        canCombineLessons={canCombineLessons}
      />
      <div className="min-w-0 flex-1">{children}</div>
      <PendingUploads students={students} />

    </div>
  );
}
