"use server";

import { AuthError } from "next-auth";
import { eq, sql } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { currentTutorId, LoginRateLimited, signIn, signOut } from "@/auth";
import { db } from "@/db";
import { tutors } from "@/db/schema";
import { appOrigin } from "@/lib/app-url";
import { checkoutPath } from "@/lib/billing";
import {
  recordTermsAcceptance,
  TERMS_COOKIE,
  TERMS_COOKIE_MAX_AGE,
  TERMS_VERSION,
} from "@/lib/terms";
import { sendPasswordResetEmail, sendPasswordResetGoogleEmail } from "@/lib/email";
import { hashPassword } from "@/lib/password";
import { passwordProblem } from "@/lib/password-policy";
import { clientIp, rateLimit, waitText } from "@/lib/rate-limit";
import {
  consumeResetToken,
  issueResetToken,
  RESET_TTL_MINUTES,
} from "@/lib/reset-tokens";

/**
 * Where to land after signing in: Checkout for the plan picked on the pricing
 * page, if one came through the form (see PlanIntentFields), else the dashboard.
 * Built from the validated plan, never from a caller-supplied path, so it can't
 * be turned into an open redirect.
 */
function afterAuth(formData: FormData): string {
  return checkoutPath(formData.get("plan"), formData.get("billing")) ?? "/dashboard";
}

export async function signInWithGoogle(formData: FormData) {
  // Only the signup page sends this. The account itself is created inside
  // NextAuth's jwt callback, out of reach of this form, so the acceptance rides
  // a short-lived cookie that the dashboard layout records (see lib/terms).
  if (formData.get("acceptTerms") === "yes") {
    (await cookies()).set(TERMS_COOKIE, TERMS_VERSION, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: TERMS_COOKIE_MAX_AGE,
    });
  }
  await signIn("google", { redirectTo: afterAuth(formData) });
}

/**
 * The /accept-terms screen. Only ever returns to a dashboard path, so `next`
 * can't be turned into an open redirect.
 */
export async function acceptTerms(formData: FormData) {
  const tutorId = await currentTutorId();
  if (formData.get("acceptTerms") !== "yes") redirect("/accept-terms?missing=1");
  await recordTermsAcceptance(tutorId);
  const next = String(formData.get("next") ?? "");
  redirect(next.startsWith("/dashboard") ? next : "/dashboard");
}

export async function signOutAction() {
  await signOut({ redirectTo: "/" });
}

/**
 * What the auth forms hand back to `useActionState`. `errors` is keyed by field
 * name so each input can show its own message; `formError` covers everything
 * that isn't about one field. `values` echoes the non-secret inputs back so a
 * rejected submit doesn't wipe what the tutor typed.
 */
export type AuthFormState = {
  errors?: Partial<
    Record<"firstName" | "lastName" | "email" | "password" | "confirm" | "acceptTerms", string>
  >;
  formError?: string;
  values?: { firstName?: string; lastName?: string; email?: string };
  /** Set once a reset email has gone out, so the form can swap to a receipt. */
  sent?: boolean;
};

// Deliberately permissive: the only thing worth rejecting here is input that
// clearly isn't an address. Deliverability is proven by mail actually arriving.
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

const field = (data: FormData, name: string) => String(data.get(name) ?? "").trim();

const requestIp = async () => clientIp(await headers());

const HOUR = 60 * 60;

/**
 * The one message every limited auth form shows. Saying "too many attempts"
 * leaks nothing: the per-email rules count the typed address whether or not
 * it has an account.
 */
const slowDown = (retryAfterSec: number) =>
  `Too many attempts. Wait ${waitText(retryAfterSec)} and try again.`;

/**
 * Create a tutor from name/surname/email/password, then sign them straight in.
 *
 * On success this never returns — `signIn` redirects to the dashboard. The
 * redirect travels as a thrown control-flow signal, so the catch below has to
 * rethrow anything that isn't an AuthError.
 */
export async function signUpWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const firstName = field(formData, "firstName");
  const lastName = field(formData, "lastName");
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");
  const values = { firstName, lastName, email };

  const errors: AuthFormState["errors"] = {};
  if (!firstName) errors.firstName = "Tell us your first name.";
  if (!lastName) errors.lastName = "Tell us your last name.";
  if (!EMAIL.test(email)) errors.email = "That doesn't look like an email address.";
  const pwProblem = passwordProblem(password);
  if (pwProblem) errors.password = pwProblem;
  if (formData.get("acceptTerms") !== "yes") {
    errors.acceptTerms = "Please accept the Terms of Service to create your account.";
  }
  if (Object.keys(errors).length) return { errors, values };

  // After validation, so typos don't burn the budget; before the lookup, since
  // "already an account" is exactly the answer a bulk enumerator is after — and
  // each pass costs us a password hash. Real households and classrooms sign up
  // a handful of people, not ten an hour.
  const limited = await rateLimit({ key: `signup:ip:${await requestIp()}`, limit: 10, windowSec: HOUR });
  if (!limited.ok) return { values, formError: slowDown(limited.retryAfterSec) };

  // Emails are stored lowercase by this flow, but Google rows predate that and
  // may carry mixed case — compare case-insensitively so the two flows can't
  // create two accounts for the same person.
  const [existing] = await db
    .select({ hasPassword: sql<boolean>`${tutors.passwordHash} is not null` })
    .from(tutors)
    .where(sql`lower(${tutors.email}) = ${email}`)
    .limit(1);

  if (existing) {
    return {
      values,
      errors: {
        email: existing.hasPassword
          ? "There's already an account with this email — log in instead."
          : "This email is already signed up with Google. Use “Continue with Google”.",
      },
    };
  }

  try {
    await db.insert(tutors).values({
      email,
      name: `${firstName} ${lastName}`,
      firstName,
      lastName,
      passwordHash: await hashPassword(password),
      termsAcceptedAt: new Date(),
      termsVersion: TERMS_VERSION,
    });
  } catch {
    // Almost certainly the unique index on email losing a race with a parallel
    // signup; anything else here is a DB fault we can't usefully explain.
    return {
      values,
      errors: { email: "We couldn't create that account. Try logging in instead." },
    };
  }

  try {
    await signIn("credentials", { email, password, redirectTo: afterAuth(formData) });
  } catch (error) {
    // The tutor exists at this point, so send them to the login form rather
    // than leaving them on a signup that looks like it failed outright.
    if (error instanceof AuthError) {
      return { values, formError: "Your account is ready — log in to continue." };
    }
    throw error; // redirect signal, or a genuine fault
  }

  return {}; // unreachable — signIn redirects
}

/** Sign in an existing tutor with their email and password. */
export async function logInWithPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, "email").toLowerCase();
  const password = String(formData.get("password") ?? "");

  if (!email || !password) {
    return {
      values: { email },
      formError: "Enter your email and password.",
    };
  }

  // No limit here: authorize() in src/auth.ts owns it, because posting to the
  // NextAuth callback directly would walk straight past anything in this action.
  try {
    await signIn("credentials", { email, password, redirectTo: afterAuth(formData) });
  } catch (error) {
    if (error instanceof LoginRateLimited) {
      return { values: { email }, formError: slowDown(error.retryAfterSec) };
    }
    if (error instanceof AuthError) {
      // Same message for every failure — see InvalidLogin in src/auth.ts.
      return {
        values: { email },
        formError:
          "That email and password don't match an account. If you signed up with Google, use the button above.",
      };
    }
    throw error; // redirect signal, or a genuine fault
  }

  return {};
}

/**
 * Step 1 of the reset: email a single-use link.
 *
 * The reply is identical whether or not the address has an account, so the form
 * can't be used to work out who's registered. That means the interesting cases
 * — no account, a Google-only account, a throttled repeat request — are all
 * settled in the mailbox rather than on screen.
 */
export async function requestPasswordReset(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const email = field(formData, "email").toLowerCase();
  if (!EMAIL.test(email)) {
    return { values: { email }, errors: { email: "Enter the email you signed up with." } };
  }

  // Two rules for two abuses. Per email: someone's inbox being flooded — the
  // 60 s cooldown in reset-tokens only spaces the mails out, this caps them.
  // Per IP: one machine walking a list of addresses. The per-email refusal is
  // silent, like the cooldown: they already have mail on its way, and an
  // on-screen "too many" for one address would differ from the normal reply.
  const [perEmail, perIp] = await Promise.all([
    rateLimit({ key: `reset-request:email:${email}`, limit: 3, windowSec: HOUR }),
    rateLimit({ key: `reset-request:ip:${await requestIp()}`, limit: 10, windowSec: HOUR }),
  ]);
  if (!perIp.ok) return { values: { email }, formError: slowDown(perIp.retryAfterSec) };
  if (!perEmail.ok) return { sent: true, values: { email } };

  const [tutor] = await db
    .select({ id: tutors.id, email: tutors.email, name: tutors.name, hash: tutors.passwordHash })
    .from(tutors)
    .where(sql`lower(${tutors.email}) = ${email}`)
    .limit(1);

  if (tutor) {
    const origin = await appOrigin();
    try {
      if (!tutor.hash) {
        await sendPasswordResetGoogleEmail({
          to: tutor.email,
          name: tutor.name,
          loginUrl: `${origin}/login`,
        });
      } else {
        const token = await issueResetToken(tutor.id);
        // null means one went out seconds ago; the earlier link is still valid.
        if (token) {
          await sendPasswordResetEmail({
            to: tutor.email,
            name: tutor.name,
            url: `${origin}/reset?token=${encodeURIComponent(token)}`,
            ttlMinutes: RESET_TTL_MINUTES,
          });
        }
      }
    } catch (error) {
      // A send failure is ours, not theirs, and it's the one case worth showing
      // — silently claiming success would leave them waiting on mail that is
      // never coming.
      console.error("password reset email failed", error);
      return {
        values: { email },
        formError: "We couldn't send that email just now. Try again in a minute.",
      };
    }
  }

  return { sent: true, values: { email } };
}

/**
 * Step 2: spend the token, set the new password, and sign them in.
 *
 * Spending the token before hashing is deliberate — it closes the window where
 * two submissions of the same link could both succeed.
 */
export async function resetPassword(
  _prev: AuthFormState,
  formData: FormData,
): Promise<AuthFormState> {
  const token = field(formData, "token");
  const password = String(formData.get("password") ?? "");
  const confirm = String(formData.get("confirm") ?? "");

  const problem = passwordProblem(password);
  if (problem) return { errors: { password: problem } };
  if (password !== confirm) return { errors: { confirm: "Those don't match." } };

  // The token is 32 random bytes, so guessing one is hopeless; this is about
  // cost — a valid token means a password hash, and the auto-login below
  // another. Anyone genuinely resetting needs one or two tries.
  const limited = await rateLimit({
    key: `reset:ip:${await requestIp()}`,
    limit: 10,
    windowSec: 15 * 60,
  });
  if (!limited.ok) return { formError: slowDown(limited.retryAfterSec) };

  const tutorId = await consumeResetToken(token);
  if (!tutorId) {
    return {
      formError:
        "That reset link has expired or already been used. Request a new one below.",
    };
  }

  const [tutor] = await db
    .update(tutors)
    .set({ passwordHash: await hashPassword(password) })
    .where(eq(tutors.id, tutorId))
    .returning({ email: tutors.email });

  if (!tutor) return { formError: "We couldn't update that account. Try again." };

  try {
    await signIn("credentials", { email: tutor.email, password, redirectTo: "/dashboard" });
  } catch (error) {
    // The password is already changed, so this is only about the auto-login.
    if (error instanceof AuthError) {
      return { formError: "Your password is updated — log in with it to continue." };
    }
    throw error; // redirect signal, or a genuine fault
  }

  return {}; // unreachable — signIn redirects
}
