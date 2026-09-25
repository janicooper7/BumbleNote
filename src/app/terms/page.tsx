// Terms of Service.
//
// Two clauses here carry real weight and should not be softened without thought:
//
//   - §"Recording other people" puts the consent duty on the tutor, which is
//     where it legally sits — we never meet the student.
//   - §"Student data we process for you" is the UK GDPR Art. 28 processor
//     contract. Every item in Art. 28(3)(a)–(h) maps to a point in it; don't drop
//     one without checking the article.
//   - §"The AI drafts, you decide" is why the review step in the product exists.
//     If a tutor sends an unreviewed report containing a mistake, that is on them,
//     and the product is deliberately built so nothing sends without confirmation.
//
// Tutors must accept these terms before using the dashboard (src/lib/terms.ts).
// A change a tutor should re-read and re-accept means bumping TERMS_VERSION there,
// alongside LEGAL.lastUpdated.

import type { Metadata } from "next";
import Link from "next/link";
import { Callout, Clause, LegalShell, Points } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  alternates: { canonical: "/terms" },
  description:
    "The agreement between BumbleNote and the tutors who use it — what we provide, what we ask of you, and where responsibility sits.",
};

export default function TermsPage() {
  return (
    <LegalShell
      title="Terms of Service"
      contactBox={false}
      intro="These terms are the agreement between you and BumbleNote. We have tried to write them in plain English, because terms nobody can read protect nobody."
    >
      <Clause id="agreement" heading="The agreement">
        <p>
          {LEGAL.tradingName} is operated by {LEGAL.operator}, a sole trader based in
          the United Kingdom (&ldquo;we&rdquo;, &ldquo;us&rdquo;). By creating an
          account or using the service you agree to these terms. If you are using
          BumbleNote on behalf of an organisation, you confirm you are allowed to
          accept these terms for it.
        </p>
        <p>
          You must be 18 or over to hold an account. BumbleNote is a tool for your
          tutoring work: you use it in the course of your business or profession, not
          as a consumer.
        </p>
      </Clause>

      <Clause id="service" heading="What BumbleNote does">
        <p>
          BumbleNote records a 1-to-1 online language lesson, transcribes it, and uses
          AI to draft two things: feedback you can send to your student as a PDF, and
          private teaching notes that stay with you. You review and edit everything
          before it goes anywhere.
        </p>
        <p>
          We may add, change, or remove features as the product develops. If we remove
          something you rely on, we will give you reasonable notice.
        </p>
      </Clause>

      <Clause id="account" heading="Your account">
        <p>
          You are responsible for what happens under your account, including keeping
          your sign-in secure.
        </p>
        <p>
          One account is for one tutor. Please do not share a login with colleagues.
        </p>
      </Clause>

      <Clause id="consent" heading="Recording other people">
        <Callout>
          <strong>
            You are responsible for getting your student&apos;s consent before you
            record them.
          </strong>{" "}
          We are never in the room and cannot obtain it for you.
        </Callout>
        <p>
          The law on recording conversations differs by country, and in many places
          everyone taking part must agree in advance. Before recording a lesson, tell
          your student that BumbleNote is being used and confirm they are happy with
          it. If your student is under 18, get that agreement from a parent or
          guardian.
        </p>
        <p>
          You also confirm you have the right to give us the student information you
          enter — their name, email address, and learning history — for the purpose of
          producing their feedback.
        </p>
        <p>
          Every recording you make with BumbleNote is made by you, as the person in
          charge of the lesson. BumbleNote does not check whether consent was given and
          accepts no responsibility for a recording made without it. If a claim is
          brought against us because you recorded someone without their agreement, you
          agree to cover the reasonable costs that claim causes us.
        </p>
      </Clause>

      <Clause id="data-processing" heading="Student data we process for you">
        <p>
          For your students&apos; data you are the controller and we are your
          processor. This section is the contract UK GDPR requires between the two
          of us.
        </p>
        <Points
          items={[
            <>
              <strong>What, and for how long.</strong> We process your students&apos;
              names, email addresses, the learning details you enter, lesson audio and
              transcripts, and the notes generated from them. The purpose is to provide
              BumbleNote to you, for as long as you have an account.
            </>,
            <>
              <strong>Only on your instructions.</strong> These terms and the way you
              use the product are your instructions. We will not use student data for
              anything else. If the law ever requires us to, we will tell you first
              unless the law forbids it, and we will tell you if we think an
              instruction breaks data protection law.
            </>,
            <>
              <strong>Confidentiality and security.</strong> Only the operator can
              access production data, under a duty of confidentiality. We protect it
              with the measures described in the{" "}
              <Link href="/privacy#security">Privacy Policy</Link>.
            </>,
            <>
              <strong>Our providers.</strong> You authorise the providers listed in the{" "}
              <Link href="/privacy#processors">Privacy Policy</Link>. Each is bound by
              data protection terms at least as protective as these. We will email you
              at least {LEGAL.subprocessorNoticeDays} days before adding or replacing
              one that handles student data. If you object, you may close your account
              and we will refund any unused part of a paid period.
            </>,
            <>
              <strong>Helping you with requests.</strong> You can view, correct, export,
              and delete student data yourself in the product. For anything the product
              can&apos;t do, we will help you answer a student&apos;s request.
            </>,
            <>
              <strong>Breaches and assessments.</strong> We will tell you without undue
              delay after we become aware of a breach affecting your students&apos;
              data, with what you need to assess it and report it if necessary. We will
              also give you reasonable help with a data protection impact assessment.
            </>,
            <>
              <strong>When you leave.</strong> Deleting your account deletes all student
              data we hold for you, and it leaves our backups within{" "}
              {LEGAL.backupRetentionDays} days. Download it from Settings first if you
              want to keep it.
            </>,
            <>
              <strong>Checking on us.</strong> We will give you the information you
              reasonably need to show we meet these obligations, and answer
              reasonable written questions about how we handle your data.
            </>,
          ]}
        />
        <p>
          Transfers outside the UK are covered by the safeguards described in the{" "}
          <Link href="/privacy#processors">Privacy Policy</Link>.
        </p>
      </Clause>

      <Clause id="ai-output" heading="The AI drafts, you decide">
        <p>
          Feedback is generated by an AI model from an automatic transcript. Both steps
          can be wrong. Transcription mishears accented speech; analysis can misjudge a
          level, invent an emphasis, or miss something that mattered.
        </p>
        <Callout>
          <strong>Check every report before you send it.</strong> Once you confirm and
          send, the content is yours — you are the teacher, and the student will read
          it as your professional judgement.
        </Callout>
        <p>
          BumbleNote is a drafting aid for a qualified tutor. It is not a substitute for
          your assessment of a student, and it does not provide educational,
          professional, or exam advice.
        </p>
      </Clause>

      <Clause id="acceptable-use" heading="What you may not do">
        <Points
          items={[
            "Record anyone who has not agreed to be recorded.",
            "Use the service for anything unlawful, or to produce material that harasses or demeans a student.",
            "Attempt to access another tutor's account, students, or lessons.",
            "Resell or white-label the service, or share your account with other tutors.",
            "Probe, scrape, overload, or reverse-engineer the service, or work around plan limits.",
          ]}
        />
        <p>
          We may suspend or close an account that breaks these rules. Where it is
          reasonable to do so, we will warn you first.
        </p>
      </Clause>

      <Clause id="your-content" heading="Who owns what">
        <p>
          <strong>Your material stays yours.</strong> Student profiles, lesson notes,
          and the reports you produce belong to you. We claim no ownership over them and
          use them only to run the service for you, as set out in the{" "}
          <Link href="/privacy">Privacy Policy</Link>.
        </p>
        <p>
          <strong>The product stays ours.</strong> The BumbleNote software, design, and
          name remain our property. Using the service does not transfer any of that to
          you.
        </p>
      </Clause>

      <Clause id="plans" heading="Plans and payment">
        <p>
          BumbleNote has a free trial of two lessons with one student, and paid plans
          with monthly lesson allowances. Current prices and limits are shown on our
          pricing page. A new allowance starts each month on your billing date; the free trial
          does not reset.
        </p>
        <p>
          <strong>Unused lessons roll over, within a limit.</strong> While your
          subscription is active, lessons you don&apos;t use carry into the next month,
          up to 5 on Starter, 10 on Advanced and 15 on Pro. Anything above that limit
          expires at the end of the month. Carried-over lessons have no cash value and
          end with your subscription.
        </p>
        <p>
          Paid plans are billed in US dollars, in advance, monthly or yearly, and renew
          automatically until you cancel. Payments are handled by Stripe; we never see or
          store your full card details. You can cancel at any time from Settings and keep
          access until the end of the period you have paid for; we do not refund
          part-used periods except where the law requires it. If you upgrade, the new
          plan starts straight away and a new billing period begins that day: we charge
          the new plan&apos;s price, less a credit for the unused part of your old plan,
          and you get the new plan&apos;s lessons on top of any you have left. If you
          downgrade, the change takes effect
          at your next renewal and you keep your current plan until then. If we change
          prices, we will give you at least 30 days&apos; notice before it affects you.
        </p>
        <p>
          On monthly billing you can pause your plan from Settings for one month at a
          time. You aren&apos;t charged for that month and no new allowance is added for
          it, but lessons you already have stay usable. Your plan resumes automatically
          after one month, or sooner if you choose.
        </p>
        <p>
          If a payment fails, we keep your plan active while it is retried. If it still
          cannot be collected, your account moves to the free plan — your students and
          lessons are kept.
        </p>
        <p>
          Reaching your limit stops new lessons being recorded until your next
          allowance arrives or you upgrade. It never deletes work you have already done.
        </p>
      </Clause>

      <Clause id="availability" heading="Availability">
        <p>
          We want the service up whenever you teach, but we do not promise uninterrupted
          availability. Maintenance, provider outages, and faults happen. BumbleNote is
          provided &ldquo;as is&rdquo;, without warranties beyond those that cannot
          legally be excluded.
        </p>
        <p>
          Because lesson recordings are deleted once processed, a failure at the wrong
          moment can mean a lesson produces no notes. We keep failed recordings briefly
          so they can be retried, but we cannot guarantee recovery — so please do not
          treat BumbleNote as the only record of a lesson that you cannot afford to
          lose.
        </p>
      </Clause>

      <Clause id="liability" heading="Liability">
        <p>
          Nothing in these terms limits our liability for death or personal injury
          caused by negligence, for fraud, or for anything else that cannot be limited
          under English law.
        </p>
        <p>
          Subject to that, we are not liable for lost profits, lost business, or
          indirect or consequential loss, and our total liability to you in any 12-month
          period is limited to the amount you paid us in that period (or £50 if you are
          on a free plan).
        </p>
      </Clause>

      <Clause id="ending" heading="Ending the agreement">
        <p>
          You can stop using BumbleNote and delete your account at any time from
          Settings. Deleting your account permanently removes your students and their
          lessons — download your data from Settings first if you want to keep it.
        </p>
        <p>
          We may end the agreement by giving you reasonable notice, or immediately if
          you seriously breach these terms. If we close your account without cause while
          you are on a paid plan, we will refund the unused part of what you have paid.
        </p>
      </Clause>

      <Clause id="changes" heading="Changes to these terms">
        <p>
          We may update these terms as the product changes. The date at the top shows
          when they last changed, and we will email account holders about anything
          significant. Continuing to use the service after a change means you accept the
          updated terms.
        </p>
      </Clause>

      <Clause id="law" heading="Governing law">
        <p>
          These terms are governed by the law of England and Wales, and the courts of
          England and Wales have exclusive jurisdiction over any dispute. If you are a
          consumer, this does not deprive you of protections available under the law of
          the country you live in.
        </p>
        <p>
          See also our <Link href="/privacy">Privacy Policy</Link>.
        </p>
      </Clause>
    </LegalShell>
  );
}
