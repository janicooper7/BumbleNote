# BumbleNote

A web app + companion browser extension for 1-on-1 online language tutors. It captures a
lesson's audio (student = tab audio, tutor = mic), transcribes it, and uses Claude to generate
editable feedback — a student report (emailed as a PDF) and private teaching notes — plus a
per-student learning journey that improves suggestions over time.

## Stack

- **Next.js 16** (App Router) + React 19, Tailwind v4
- **Neon** Postgres + **Drizzle ORM**
- **NextAuth v5** (Google sign-in)
- **Claude** (`@anthropic-ai/sdk`) for feedback, **Deepgram** for speech-to-text
- **Resend** + `pdf-lib` for the emailed lesson PDF
- **Netlify** hosting — lesson audio is chunk-uploaded to Netlify Blobs and processed by a
  background function (see below)

## Local development

```bash
npm install
cp .env.example .env.local   # fill in the values (see the file's comments)
npm run dev
```

To exercise the full record → draft pipeline locally you need **Netlify Blobs**, which only
exists under the Netlify CLI:

```bash
npx netlify dev
```

Database migrations (Drizzle): `npm run db:generate` / `db:migrate` / `db:push` / `db:studio`.

## Deploying to Netlify

Because a full lesson's audio far exceeds Netlify's 6 MB request limit and 26–60 s function
timeout, the two audio tracks are sliced into ~4 MB chunks, uploaded to Netlify Blobs via
`/api/upload/*`, and transcribed + drafted by the 15-minute background function in
`netlify/functions/process.mts`, which then deletes the audio.

Connect the repo in Netlify and set the environment variables listed in the **Deploying to
Netlify** section of [`.env.example`](./.env.example) (all the app keys plus `INTERNAL_TASK_SECRET`
and `AUTH_TRUST_HOST=true`), then add `https://<your-site>.netlify.app/api/auth/callback/google`
to your Google OAuth client's authorized redirect URIs.

## Meta ads tracking

Cookie consent, the Meta Pixel, the Conversions API and first-touch attribution. Nothing
non-essential runs until a visitor clicks **Accept marketing cookies** in the banner
(`src/components/tracking`); "Cookie settings" in the footer reopens it.

| Variable | Where | What |
| --- | --- | --- |
| `NEXT_PUBLIC_META_PIXEL_ID` | build + runtime | Pixel id for the browser. Needs a redeploy to change. |
| `META_PIXEL_ID` | runtime | Same id, for server events. |
| `META_CAPI_ACCESS_TOKEN` | runtime | Conversions API token (Events Manager → Settings). |
| `META_TEST_EVENT_CODE` | runtime | Optional. Sends server events to **Test events**. Remove after testing. |
| `META_GRAPH_VERSION` | runtime | Optional. Defaults to `v26.0`. |
| `PUBLIC_MARKETING_PAGES` | runtime | `true` opens `/`, `/signup` and the legal pages past the pre-launch gate. |

Events (browser and server copies share an `event_id`, so Meta de-duplicates them):

| Event | Browser | Server | Fires when |
| --- | --- | --- | --- |
| `PageView` | ✓ | | every route change |
| `ViewContent` | ✓ | | landing page view |
| `Lead` | ✓ | ✓ | new address joins the waitlist on `/enter` |
| `CompleteRegistration` | ✓ | ✓ | account created (Google or password) |
| `ActivatedTrial` (custom) | | ✓ | first lesson written up, once per tutor |
| `Subscribe` | | ✓ | Stripe `checkout.session.completed` for a plan, with value + currency |
| `Purchase` | | ✓ | Stripe `checkout.session.completed` for a lesson pack |

Server events go only to tutors whose stored `ad_consent` is true, and each event id is
recorded once in `meta_events` (status `sent`, `skipped` or `failed`), so Stripe retries
don't double-send. Waitlist Leads have no tutor, so their consent is read from the join
request itself. First-touch UTMs, `fbclid` and the landing page are saved on the
`tutors` row at sign-up.

### Testing each event

1. Set `META_TEST_EVENT_CODE` (Events Manager → Test events) and deploy. Open the site,
   click **Accept marketing cookies**.
2. **PageView / ViewContent**: load `/` and click around. Both appear under Test events as
   *Browser* events.
3. **Attribution + CompleteRegistration**: in a private window, open
   `/?utm_source=facebook&utm_medium=paid_social&utm_campaign=test&utm_content=a&fbclid=TEST`,
   accept cookies, and sign up. Test events shows CompleteRegistration from *Browser* and
   *Server*, marked de-duplicated. Check the row:
   `select utm_source, utm_campaign, fbclid, landing_page, ad_consent from tutors order by created_at desc limit 1;`
4. **ActivatedTrial**: record a lesson as that tutor. One *Server* event when the notes are
   ready; a second lesson sends nothing.
5. **Subscribe**: with Stripe test keys, buy a plan with card `4242 4242 4242 4242`. One
   Subscribe with the plan's value and `USD`. Resend the event from Stripe (Developers →
   Events → Resend) and check nothing new arrives: `select * from meta_events;`
6. **Purchase**: as a subscriber, buy a lesson pack the same way.
7. **No tracking before consent**: in a fresh private window, open the site with the
   browser's network tab filtered on `facebook`. Nothing loads until you accept; choose
   **Essential only** and nothing loads at all, and that tutor's server events are
   recorded as `skipped`.

Remove `META_TEST_EVENT_CODE` once you're done.

## Browser extension

The `extension/` folder is an unpacked Chrome (Manifest V3) extension. Load it via
`chrome://extensions` → Developer mode → Load unpacked, then set its app URL and capture token
from the dashboard's **Settings → Lesson capture**.
