// Privacy policy.
//
// Every factual claim here is checked against the code, and several of them are
// load-bearing:
//
//   - "transcripts are never stored in our database" — sessions has no transcript
//     column (src/db/schema.ts); the cached transcript blob is deleted with the
//     audio (netlify/functions/process.mts, src/lib/upload-retention.ts).
//   - the audio retention window — enforced by the daily sweep in
//     netlify/functions/purge-uploads.mts. LEGAL.audioRetentionDays must stay in
//     step with AUDIO_RETENTION_MS.
//   - the #cookies and #advertising clauses — the Meta Pixel loads only after
//     "Accept marketing cookies" (src/components/tracking), and server-side Meta
//     events go only to tutors with tutors.ad_consent = true (src/lib/meta-capi.ts).
//     Add any other tracker and these clauses must change with it.
//   - "not used to train their models" (Deepgram) — true because of
//     mip_opt_out in src/lib/stt.ts. Remove that flag and this page lies.
//   - the #students section is what tutors link students to before recording
//     them (see the note at the end of it). Keep the anchor stable.
//
// If you change what the product does with lesson data, change this page in the
// same commit.

import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Clause, LegalShell, Points } from "@/components/legal/LegalPage";
import { LEGAL, SUBPROCESSORS } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Policy",
  alternates: { canonical: "/privacy" },
  description:
    "What BumbleNote does with lesson recordings, student records, and tutor account data — and what it never does.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      title="Privacy Policy"
      intro="BumbleNote listens to language lessons, which means it handles something genuinely personal: a student's voice. This page explains exactly what happens to that recording, who else it passes through, and how quickly it disappears."
    >
      <Clause id="who-we-are" heading="Who we are">
        <p>
          {LEGAL.tradingName} is operated by {LEGAL.operator}, a sole trader based in
          the United Kingdom. {LEGAL.addressNote} You can reach us about anything on
          this page at{" "}
          <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>.
        </p>
      </Clause>

      <Clause id="two-roles" heading="Two different relationships, and why it matters">
        <p>
          BumbleNote handles two kinds of personal data, and our responsibilities are
          different for each.
        </p>
        <Points
          items={[
            <>
              <strong>Tutor account data</strong> — your name, email, and how you use
              the product. Here we are the <strong>data controller</strong>: we decide
              what to collect and why, and this policy governs it.
            </>,
            <>
              <strong>Student and lesson data</strong> — the profiles you create, the
              lessons you record, and the notes generated from them. Here the{" "}
              <strong>tutor is the controller and we are the processor</strong>: it is
              your material, we only handle it to provide the service to you, and we
              act on your instructions.
            </>,
          ]}
        />
        <p>
          The practical consequence: your students are your responsibility. If a
          student asks what data is held about them or wants it deleted, that request
          goes to their tutor, and we will help that tutor answer it. Tutors can
          download everything held about their students from Settings at any time. The
          terms we process student data under are set out in the{" "}
          <Link href="/terms#data-processing">data processing section of our Terms</Link>.
        </p>
      </Clause>

      <Clause id="what-we-collect" heading="What we collect">
        <p>
          <strong>When you join the launch waitlist.</strong> If you leave your email on
          our &ldquo;coming soon&rdquo; page, we store that address and the date you
          added it, and use it only to email you about BumbleNote: when it opens, and
          occasionally after that about what it can do for you. Every email has an
          unsubscribe link. We are the data controller for it.
        </p>
        <p>
          <strong>When you create an account.</strong> If you sign in with Google, we
          receive your name and email address from Google, and never your password.
          Google&apos;s sign-in also passes along your profile picture and an account
          identifier; we don&apos;t store either. We also store which plan you are on,
          when you signed up, and when you accepted our terms. We note the country
          you signed up from, from your connection, and, if you accepted marketing
          cookies, which link or ad brought you to us (see{" "}
          <Link href="#advertising" className="font-semibold text-ink underline underline-offset-2">
            Advertising
          </Link>
          ).
        </p>
        <p>
          <strong>When you pay.</strong> Paid plans are processed by Stripe. Stripe
          collects your card details and billing address directly; we only keep your
          Stripe customer reference, your plan, and its renewal date. We never see or
          store your full card number.
        </p>
        <p>
          <strong>What you type in.</strong> The student profiles you create: name and
          (optionally) email address, first language, level, learning goal, interests,
          areas to improve, any target exam, the hourly rate you charge them, and your
          own private notes. Also any files you attach to a lesson report.
        </p>
        <p>
          <strong>What we record.</strong> When you start a lesson recording, BumbleNote
          captures two audio streams — your microphone and the audio coming from the
          lesson tab, which is your student. Recording only ever starts when you
          explicitly start it, and your browser shows its own indicator throughout.
        </p>
        <p>
          <strong>What we generate.</strong> From the transcript: vocabulary covered,
          what went well, areas to improve, homework, a talk-time estimate, an observed
          level, suggestions for the next lesson, and your private teaching notes. If
          you mark a lesson as a trial lesson, we also draft a starting profile for
          the student — interests, areas to work on, notes — which only fills in
          fields you have left empty, and which you can edit or delete.
        </p>
      </Clause>

      <Clause id="audio" heading="What happens to a lesson recording">
        <p>
          This is the part most people want to know, so here is the whole sequence.
          Audio is uploaded in pieces, transcribed, analysed, and then deleted. The
          notes are what persist — the recording is not.
        </p>
        <Points
          items={[
            <>
              <strong>Audio is never kept after a lesson is processed.</strong> The
              moment your lesson notes exist, every piece of the recording is deleted
              automatically.
            </>,
            <>
              <strong>Transcripts are never stored in our database.</strong> The
              transcript exists only in temporary storage while the analysis runs, and
              is deleted alongside the audio. There is no field in our database that
              holds a record of what was said.
            </>,
            <>
              <strong>If processing fails</strong>, the audio is kept for up to{" "}
              {LEGAL.audioRetentionDays} days so the lesson can be retried rather than
              lost, and is then deleted automatically. The same applies to a recording
              you start but never finish uploading.
            </>,
            <>
              <strong>We do not listen to your lessons.</strong> Nobody at BumbleNote
              plays back tutor recordings. In the rare case of a failed lesson we may
              re-run the automated pipeline, which is a machine process, not a person
              listening.
            </>,
          ]}
        />
        <Callout>
          <strong>Recording consent is the tutor&apos;s responsibility.</strong> Laws on
          recording a conversation vary by country, and in some places every
          participant must agree. Before you record a student, tell them BumbleNote is
          being used and get their agreement. If they are under 18, that agreement
          needs to come from a parent or guardian.
        </Callout>
      </Clause>

      <Clause id="ai" heading="AI, and what it is not used for">
        <p>
          Lesson transcripts are analysed by an AI model to draft the feedback you
          review. That draft is a starting point, not a verdict — you edit and confirm
          everything before a student ever sees it.
        </p>
        <p>
          <strong>
            We do not use lesson content, student data, or your notes to train AI
            models,
          </strong>{" "}
          and we do not sell or share any of it for advertising. Our speech-to-text and
          analysis providers are engaged under business terms that do not permit
          training on the content we send them.
        </p>
      </Clause>

      <Clause id="legal-basis" heading="Why we are allowed to hold it">
        <p>Under UK GDPR, we rely on:</p>
        <Points
          items={[
            <>
              <strong>Performance of a contract</strong> — we cannot run your account or
              produce lesson notes without processing this data.
            </>,
            <>
              <strong>Legitimate interests</strong> — keeping the service secure,
              preventing abuse, and fixing failures. We have weighed these against your
              rights and kept the processing to what the feature needs.
            </>,
            <>
              <strong>Consent</strong> — for marketing cookies and the advertising
              measurement described below, which you can withdraw at any time from
              &ldquo;Cookie settings&rdquo; at the bottom of our pages.
            </>,
            <>
              <strong>Consent</strong> — for the recording itself, which is obtained by
              the tutor from the student, as described above — and for the launch
              waitlist, which you join by choosing to submit your email. You can
              withdraw that consent at any time with the unsubscribe link in any of
              our emails, or by emailing us, and we will remove your address.
            </>,
          ]}
        />
      </Clause>

      <Clause id="processors" heading="Who else touches it">
        <p>
          We use a small number of specialist providers. Each one is contractually
          bound to process data only on our instructions, and we have kept the list as
          short as the product allows.
        </p>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-left text-[.95rem]">
            <thead>
              <tr className="border-b border-line">
                <th className="py-3 pr-4 font-semibold text-ink">Provider</th>
                <th className="py-3 pr-4 font-semibold text-ink">Purpose</th>
                <th className="py-3 pr-4 font-semibold text-ink">What it sees</th>
                <th className="py-3 font-semibold text-ink">Where</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((p) => (
                <tr key={p.name} className="border-b border-line/70 align-top">
                  <td className="py-3 pr-4 font-semibold text-ink">{p.name}</td>
                  <td className="py-3 pr-4">{p.role}</td>
                  <td className="py-3 pr-4">{p.data}</td>
                  <td className="py-3">{p.location}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          Our database is in the United Kingdom. The other providers above process
          data in the United States. Those transfers rely on the UK Extension to the
          EU–US Data Privacy Framework where the provider is certified under it, and
          otherwise on the UK International Data Transfer Addendum to the EU Standard
          Contractual Clauses, built into that provider&apos;s data processing terms.
          Email us if you would like a copy of the relevant safeguard.
        </p>
        <p>
          Before adding or replacing a provider that handles student or lesson data,
          we will update this list and email account holders at least{" "}
          {LEGAL.subprocessorNoticeDays} days in advance.
        </p>
      </Clause>

      <Clause id="retention" heading="How long we keep things">
        <Points
          items={[
            <>
              <strong>Launch waitlist emails</strong> — kept until you unsubscribe or
              ask us to remove yours, then deleted.
            </>,
            <>
              <strong>Lesson audio and transcripts</strong> — deleted as soon as the
              notes are generated; at most {LEGAL.audioRetentionDays} days if something
              went wrong.
            </>,
            <>
              <strong>Files attached to a lesson report</strong> — deleted as soon as
              the report is emailed to the student; at most{" "}
              {LEGAL.attachmentRetentionDays} days if it is never sent.
            </>,
            <>
              <strong>Student profiles and lesson notes</strong> — kept until you delete
              the student or your account. They are yours, and we do not expire them
              behind your back.
            </>,
            <>
              <strong>Your account</strong> — kept until you delete it. You can do that
              yourself, at any time, from Settings. Deleting your account deletes your
              students and their lessons with it, and cancels any subscription.
            </>,
            <>
              <strong>Backups</strong> — our database keeps a rolling restore history
              for recovering from faults. Anything you delete leaves that history
              within {LEGAL.backupRetentionDays} days and cannot be restored after that.
            </>,
            <>
              <strong>Billing records</strong> — Stripe keeps payment and invoice records
              for as long as tax and anti-fraud law requires, even after you delete
              your account. We do not keep a separate copy.
            </>,
          ]}
        />
      </Clause>

      <Clause id="cookies" heading="Cookies">
        <p>
          Some cookies are <strong>strictly necessary</strong> and always on: one to
          keep you signed in, one to remember your cookie choice, and, while the site
          is in private pre-launch, one to remember that you have entered the access
          password.
        </p>
        <p>
          <strong>Marketing cookies</strong> are off unless you choose &ldquo;Accept
          marketing cookies&rdquo;. If you do, we load the Meta Pixel, which sets
          Meta&apos;s own cookies (<code>_fbp</code>, and <code>_fbc</code> if you
          arrived from a Meta ad), and we set one cookie of our own,{" "}
          <code>bn_attr</code>, which remembers the link that first brought you here
          for 90 days. If you choose &ldquo;Essential only&rdquo;, none of these are
          set. We ask again after six months.
        </p>
        <p>
          You can change your choice at any time from &ldquo;Cookie settings&rdquo; at
          the bottom of our pages. Withdrawing removes these cookies from your browser
          and stops us sending anything further about you to Meta.
        </p>
        <p>
          There is no analytics service or tag manager on this site.
        </p>
      </Clause>

      <Clause id="advertising" heading="Advertising">
        <p>
          We advertise BumbleNote on Facebook and Instagram. To learn which ads bring
          tutors who find BumbleNote useful, and so Meta shows our ads to similar
          people, we tell Meta when certain things happen, but only if you accepted
          marketing cookies:
        </p>
        <Points
          items={[
            <>You viewed our home page, joined the waitlist, or created an account.</>,
            <>Your first lesson notes were created. We do not send anything about the lesson itself.</>,
            <>You started a paid plan or bought extra lessons, with the amount paid.</>,
          ]}
        />
        <p>
          Each event is sent from your browser by the Meta Pixel and also from our
          server, so it still counts if your browser blocks the Pixel. The server
          copy includes your email address in hashed (scrambled) form, your IP
          address, your browser&apos;s user agent, your country and Meta&apos;s
          cookie values, which Meta uses to match the event to its own records.
          Nothing about your students or lessons is ever sent to Meta.
        </p>
        <p>
          For this measurement, Meta Platforms Ireland Ltd and BumbleNote are joint
          controllers of the data collected by the Pixel. Meta&apos;s own use of it
          is covered by the{" "}
          <a
            href="https://www.facebook.com/privacy/policy/"
            className="font-semibold text-ink underline underline-offset-2"
            target="_blank"
            rel="noopener"
          >
            Meta Privacy Policy
          </a>
          .
        </p>
      </Clause>

      <Clause id="security" heading="Security">
        <p>
          Data is encrypted in transit. Access to the production database and to lesson
          storage is limited to the operator. Every query in the application is scoped
          to the signed-in tutor, so one tutor&apos;s students and lessons are not
          reachable from another tutor&apos;s account.
        </p>
        <p>
          No system is perfect. If we ever discover a breach affecting your data, we
          will tell you and, where the law requires it, the ICO — without waiting to be
          asked.
        </p>
      </Clause>

      <Clause id="rights" heading="Your rights">
        <p>Under UK GDPR you can ask us to:</p>
        <Points
          items={[
            "Give you a copy of the personal data we hold about you.",
            "Correct anything that is wrong.",
            "Delete your data — though for most of it you can simply delete your account yourself.",
            "Restrict or object to how we use it.",
            "Provide it in a portable format.",
          ]}
        />
        <p>
          Email <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> and we
          will respond within one month. If you are unhappy with how we have handled
          your data you can complain to the Information Commissioner&apos;s Office at{" "}
          <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">
            ico.org.uk
          </a>
          , but we would rather you told us first so we can put it right.
        </p>
      </Clause>

      <Clause id="students" heading="If you are a student">
        <p>
          If you received a lesson report from your tutor, this section is for you.
        </p>
        <Points
          items={[
            <>
              <strong>Who is responsible.</strong> Your tutor decides to use BumbleNote
              and is responsible for your data. We handle it only on their behalf, to
              produce your lesson notes.
            </>,
            <>
              <strong>What is used.</strong> The audio of your lesson, your name and
              email address, and learning details your tutor has entered, such as your
              level and goals. From the recording we produce a written summary of the
              lesson: vocabulary, what went well, what to work on, and homework.
            </>,
            <>
              <strong>What happens to the recording.</strong> It is turned into text,
              analysed, and then deleted — usually within minutes, and never later
              than {LEGAL.audioRetentionDays} days. Nobody listens to it, and it is
              not used to train AI.
            </>,
            <>
              <strong>Who else sees it.</strong> The providers listed above, for the
              purposes described there. It is never sold or used for advertising.
            </>,
            <>
              <strong>How long the notes are kept.</strong> Until your tutor deletes
              them, your profile, or their account.
            </>,
            <>
              <strong>Your rights.</strong> You can ask your tutor for a copy of what is
              held about you, to correct it, or to delete it, and you can ask them to
              stop recording your lessons at any time. If you can&apos;t reach your
              tutor, email us at{" "}
              <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a> and we
              will pass your request on and help them respond. You can also complain to
              the ICO at{" "}
              <a href="https://ico.org.uk" target="_blank" rel="noopener noreferrer">
                ico.org.uk
              </a>
              .
            </>,
          ]}
        />
        <p>
          <strong>Tutors:</strong> this is what to tell a student before you record
          them for the first time. Sending them a link to this section is an easy way
          to do it.
        </p>
      </Clause>

      <Clause id="children" heading="Children">
        <p>
          BumbleNote accounts are for tutors, who must be 18 or over. Students may be
          children — that is normal in language teaching. Where a student is a minor,
          the tutor is responsible for having appropriate consent from a parent or
          guardian before recording a lesson.
        </p>
      </Clause>

      <Clause id="changes" heading="Changes to this policy">
        <p>
          If we change how we handle personal data, we will update this page and move
          the date at the top. For anything significant — a new category of data, a new
          provider handling lesson content — we will email account holders rather than
          rely on you noticing.
        </p>
        <p>
          See also our <Link href="/terms">Terms of Service</Link>.
        </p>
      </Clause>
    </LegalShell>
  );
}
