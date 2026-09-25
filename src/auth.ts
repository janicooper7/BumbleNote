// Full NextAuth setup (Node runtime). Spreads the edge-safe config and adds
// everything that needs the database: the email/password provider, and the
// callbacks that ensure a `tutors` row exists for the account and carry its id
// in the JWT so every request can resolve the tenant.
//
// The Credentials provider lives here rather than in auth.config.ts on purpose
// — its `authorize` touches the DB, and auth.config.ts has to stay edge-safe
// for the proxy. The proxy only decodes the session JWT, so it never needs to
// know this provider exists.

import NextAuth, { CredentialsSignin } from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { eq } from "drizzle-orm";
import { authConfig } from "./auth.config";
import { db } from "@/db";
import { tutors } from "@/db/schema";
import { verifyPassword } from "@/lib/password";
import { clientIp, rateLimitAll } from "@/lib/rate-limit";

/**
 * Thrown for every failed password sign-in, whatever the actual cause — wrong
 * password, no such tutor, or a Google-only account. `code` reaches the client
 * as `error=...`; keeping it uniform means the form can't be used to probe
 * which emails have accounts.
 */
class InvalidLogin extends CredentialsSignin {
  code = "credentials";
}

/**
 * Too many password attempts for this IP or this email. Keyed on the typed
 * email whether or not it has an account, so it gives nothing away that
 * InvalidLogin doesn't. The server-side signIn() rethrows this very object, so
 * the login action can read `retryAfterSec` off it for its message.
 */
export class LoginRateLimited extends CredentialsSignin {
  code = "rate_limited";
  constructor(readonly retryAfterSec: number) {
    super();
  }
}

// Per email: stops a slow, distributed guess at one account. Per IP: stops one
// machine spraying many accounts, with headroom for a shared office/school NAT.
// Successful logins count too — simpler, and nobody logs in 10 times in 15 min.
const LOGIN_WINDOW_SEC = 15 * 60;
const LOGIN_LIMIT_PER_EMAIL = 10;
const LOGIN_LIMIT_PER_IP = 30;

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    ...authConfig.providers,
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      // The limit lives here, not in the login action, because this is the one
      // place every password check passes through. /api/auth/callback/credentials
      // is public — anyone can GET a CSRF token from /api/auth/csrf and post
      // straight to it, skipping our server actions entirely. `request` carries
      // the original headers on both paths (server-side signIn() forwards them),
      // so clientIp sees the same address either way.
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "")
          .trim()
          .toLowerCase();
        const password = String(credentials?.password ?? "");
        if (!email || !password) throw new InvalidLogin();

        // Before the lookup and the hash compare, so a refused attempt costs us
        // one upsert rather than a slow KDF.
        const ip = clientIp(request.headers);
        const limited = await rateLimitAll([
          // Sliced: this input is untrusted on the direct-post path.
          { key: `login:email:${email.slice(0, 254)}`, limit: LOGIN_LIMIT_PER_EMAIL, windowSec: LOGIN_WINDOW_SEC },
          { key: `login:ip:${ip}`, limit: LOGIN_LIMIT_PER_IP, windowSec: LOGIN_WINDOW_SEC },
        ]);
        if (!limited.ok) throw new LoginRateLimited(limited.retryAfterSec);

        const [tutor] = await db
          .select({
            id: tutors.id,
            email: tutors.email,
            name: tutors.name,
            passwordHash: tutors.passwordHash,
          })
          .from(tutors)
          .where(eq(tutors.email, email))
          .limit(1);

        // No row, or a Google-only row with no password set. Either way, refuse.
        if (!tutor?.passwordHash) throw new InvalidLogin();
        if (!(await verifyPassword(password, tutor.passwordHash))) {
          throw new InvalidLogin();
        }

        return { id: tutor.id, email: tutor.email, name: tutor.name };
      },
    }),
  ],
  session: { strategy: "jwt" },
  callbacks: {
    ...authConfig.callbacks,
    async jwt({ token, user }) {
      // `user` is only present on initial sign-in. Upsert the tutor by email
      // and stash its id on the token for subsequent requests.
      if (user?.email) {
        const email = user.email;
        const [existing] = await db
          .select({ id: tutors.id })
          .from(tutors)
          .where(eq(tutors.email, email))
          .limit(1);

        if (existing) {
          token.tutorId = existing.id;
        } else {
          const [created] = await db
            .insert(tutors)
            .values({ email, name: user.name ?? email })
            .returning({ id: tutors.id });
          token.tutorId = created.id;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.tutorId) {
        session.user.tutorId = token.tutorId as string;
      }
      return session;
    },
  },
});

/** The tutor the current request acts as. Throws if unauthenticated. */
export async function currentTutorId(): Promise<string> {
  const session = await auth();
  if (!session?.user?.tutorId) {
    throw new Error("Unauthorized: no tutor in session");
  }
  return session.user.tutorId;
}
