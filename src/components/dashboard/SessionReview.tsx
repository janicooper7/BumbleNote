'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import Avatar from './Avatar'
import LevelBadge from './LevelBadge'
import StatusBadge from './StatusBadge'
import type { Session, SessionStatus, Student, VocabItem } from '@/lib/mock'
import { LEVEL_DETERMINATION_LESSONS, isLevelDetermined } from '@/lib/student-options'
import type { SessionFeedbackInput } from '@/app/actions/sessions'
import {
  deleteSession,
  deleteSessionAttachment,
  resendLessonReport,
  saveSessionFeedback,
  sendLessonReport,
  uploadSessionAttachment,
} from '@/app/actions/sessions'
import { mergeSessions } from '@/app/actions/merge'
import {
  MAX_MERGE_PARTS,
  MERGE_WINDOW_HOURS,
  type MergeCandidate,
} from '@/lib/merge'
import { MIN_COUNTED_LESSON_MIN, countsAsLesson } from '@/lib/plans'
import {
  ALLOWED_ATTACHMENT_EXTENSIONS,
  MAX_ATTACHMENT_TOTAL_BYTES,
  formatBytes,
  isAllowedAttachment,
  type AttachmentMeta,
} from '@/lib/attachments'

/** The editable slice of a session, in a stable key order so two snapshots of it
 *  can be compared with a plain string equality check (see `dirty` below). */
function feedbackOf(s: Session): SessionFeedbackInput {
  return {
    vocab: s.vocab,
    wentWell: s.wentWell,
    focus: s.focus,
    homework: s.homework,
    additionalInfo: s.additionalInfo,
    nextLesson: s.nextLesson,
    lessonEndedAt: s.lessonEndedAt,
    tutorNotes: s.tutorNotes,
  }
}

export default function SessionReview({
  session,
  student,
  attachments = [],
  mergeCandidates = [],
}: {
  session: Session
  student?: Student
  attachments?: AttachmentMeta[]
  mergeCandidates?: MergeCandidate[]
}) {
  const router = useRouter()
  const [vocab, setVocab] = useState<VocabItem[]>(session.vocab)
  const [wentWell, setWentWell] = useState<string[]>(session.wentWell)
  const [focus, setFocus] = useState<string[]>(session.focus)
  const [homework, setHomework] = useState(session.homework)
  const [additionalInfo, setAdditionalInfo] = useState(session.additionalInfo)
  const [nextLesson, setNextLesson] = useState<string[]>(session.nextLesson)
  const [lessonEndedAt, setLessonEndedAt] = useState(session.lessonEndedAt)
  const [notes, setNotes] = useState(session.tutorNotes)
  const [saved, setSaved] = useState<null | string>(null)
  const [flashTone, setFlashTone] = useState<'ok' | 'err'>('ok')
  const [status, setStatus] = useState<SessionStatus>(session.status)
  const [saving, setSaving] = useState(false)
  // Which action is in flight, so each button shows its own progress label.
  const [pending, setPending] = useState<null | SessionStatus>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [confirmResend, setConfirmResend] = useState(false)
  const [resending, setResending] = useState(false)
  // BCC the tutor on send/resend. Off by default: each copy is a billed email.
  const [copyMe, setCopyMe] = useState(false)
  // A sent report is read-only until the tutor presses Edit.
  const [editing, setEditing] = useState(false)
  // Bumped after each delivery: the server deletes sent attachments, so the
  // attachment list clears to match.
  const [deliveries, setDeliveries] = useState(0)
  // Serialized copy of what's actually in the database, so we can tell whether
  // the tutor has edits they haven't saved yet.
  const [savedSnapshot, setSavedSnapshot] = useState(() =>
    JSON.stringify(feedbackOf(session)),
  )

  const title = session.title
  const sent = status === 'sent'
  const confirmed = status === 'confirmed'
  const missingEmail = !student?.email
  const locked = sent && !editing

  function flash(msg: string, tone: 'ok' | 'err' = 'ok') {
    setSaved(msg)
    setFlashTone(tone)
    setTimeout(() => setSaved(null), tone === 'err' ? 5000 : 2200)
  }

  const feedback = (): SessionFeedbackInput => ({
    vocab,
    wentWell,
    focus,
    homework,
    additionalInfo,
    nextLesson,
    lessonEndedAt,
    tutorNotes: notes,
  })

  // True while the on-screen edits differ from what's stored. Drives the
  // "Unsaved changes" hint and the leave-the-page guards below.
  const dirty = !locked && JSON.stringify(feedback()) !== savedSnapshot

  /** Leave edit mode on a sent report, putting the fields back to what's stored. */
  function cancelEdit() {
    const s = JSON.parse(savedSnapshot) as SessionFeedbackInput
    setVocab(s.vocab)
    setWentWell(s.wentWell)
    setFocus(s.focus)
    setHomework(s.homework)
    setAdditionalInfo(s.additionalInfo)
    setNextLesson(s.nextLesson)
    setLessonEndedAt(s.lessonEndedAt)
    setNotes(s.tutorNotes)
    setEditing(false)
  }

  // Guard a browser refresh / tab close. This is the exact hole that lost a
  // tutor's vocab edits: the edits live in component state until a save button
  // is pressed, and nothing warned before the page was reloaded.
  useEffect(() => {
    if (!dirty) return
    const onBeforeUnload = (e: BeforeUnloadEvent) => e.preventDefault()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => window.removeEventListener('beforeunload', onBeforeUnload)
  }, [dirty])

  async function save(target: SessionStatus) {
    const wasConfirmed = confirmed
    setSaving(true)
    setPending(target)
    // Snapshot exactly what we're sending, so late keystrokes during the
    // round-trip stay marked as unsaved rather than being wrongly cleared.
    const payload = feedback()
    const serialized = JSON.stringify(payload)
    try {
      if (sent) {
        // Editing a sent report: it stays sent, and the student only sees the
        // changes once it's resent.
        await saveSessionFeedback(session.id, payload, 'sent')
        setSavedSnapshot(serialized)
        setEditing(false)
        flash(
          `Changes saved — resend to share them with ${session.studentName.split(' ')[0]}.`,
        )
        router.refresh()
        return
      }
      if (target === 'sent') {
        const result = await sendLessonReport(session.id, payload, {
          copyTutor: copyMe,
        })
        // A failed send still persisted the edits as "confirmed" server-side,
        // so record that here instead of leaving the tutor thinking their
        // edits were lost along with the delivery.
        setSavedSnapshot(serialized)
        setStatus('confirmed')
        if (!result.ok) {
          flash(result.error, 'err')
          return
        }
      } else {
        await saveSessionFeedback(session.id, payload, target)
        setSavedSnapshot(serialized)
      }
      setStatus(target)
      if (target === 'sent') {
        setDeliveries((n) => n + 1)
        flash(`Feedback PDF sent to ${session.studentName.split(' ')[0]}.`)
        if (typeof window !== 'undefined')
          window.scrollTo({ top: 0, behavior: 'smooth' })
      } else if (target === 'confirmed') {
        flash(
          wasConfirmed ? 'Changes saved.' : 'Lesson confirmed — ready to send.',
        )
      } else {
        flash('Draft saved.')
      }
      router.refresh()
    } catch (err) {
      flash(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't save — please try again.",
        'err',
      )
    } finally {
      setSaving(false)
      setPending(null)
    }
  }

  async function resend() {
    setResending(true)
    try {
      const result = await resendLessonReport(session.id, {
        copyTutor: copyMe,
      })
      if (!result.ok) {
        flash(result.error, 'err')
        return
      }
      flash(`Report resent to ${session.studentName.split(' ')[0]}.`)
      setConfirmResend(false)
      setDeliveries((n) => n + 1)
      router.refresh()
    } catch {
      flash("Couldn't resend — please try again.", 'err')
    } finally {
      setResending(false)
    }
  }

  async function remove() {
    setDeleting(true)
    try {
      // deleteSession redirects to /dashboard on success, so control won't
      // return here in the happy path.
      await deleteSession(session.id)
    } catch (err) {
      flash(
        err instanceof Error && err.message
          ? err.message
          : "Couldn't delete — please try again.",
        'err',
      )
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className='px-6 py-8 lg:px-10'>
      <Link
        href='/dashboard'
        onClick={(e) => {
          // beforeunload doesn't fire on client-side navigation, so guard the
          // in-app route change too.
          if (
            dirty &&
            !window.confirm('You have unsaved changes. Leave without saving?')
          ) {
            e.preventDefault()
          }
        }}
        className='text-sm font-medium text-brand-deep hover:underline'
      >
        ← Back to overview
      </Link>

      {/* header */}
      <div className='mt-6 flex flex-wrap items-center justify-between gap-4 border-b border-line pb-6'>
        <div className='flex min-w-0 items-center gap-4'>
          <Avatar initial={session.studentInitial} size={56} />
          <div className='min-w-0'>
            <div className='font-display text-xl text-ink uppercase tracking-[.03em]'>
              {title}
            </div>
            <div className='text-base text-muted'>
              <Link
                href={`/dashboard/students/${session.studentId}`}
                className='font-medium text-ink-soft hover:text-ink hover:underline'
              >
                {session.studentName}
              </Link>{' '}
              · {session.date} · {session.durationMin} min
            </div>
          </div>
        </div>
        <div className='flex flex-wrap items-center gap-3'>
          {session.isTrial && (
            <span
              className='rounded-full bg-mint/15 px-2.5 py-1 text-xs font-semibold text-cocoa'
              title="Marked as this student's trial lesson — any interests, focus areas or notes their profile was still missing were filled in from this lesson."
            >
              Trial lesson
            </span>
          )}
          <LevelBadge
            level={`${session.levelFrom} → ${session.levelTo}`}
            lessonCount={student?.lessonCount}
          />
          <StatusBadge status={status} />
        </div>
      </div>

      {sent && (
        <Notice tone='success' title={`Sent to ${session.studentName}`}>
          The student feedback PDF was emailed. Tutor notes saved to their
          journey.
        </Notice>
      )}

      {!sent && mergeCandidates.length > 1 && (
        <MergePanel
          sessionId={session.id}
          studentName={session.studentName}
          candidates={mergeCandidates}
          dirty={dirty}
          onError={(msg) => flash(msg, 'err')}
          onMerged={(id) => {
            flash('Recordings combined into one lesson.')
            if (id !== session.id) router.push(`/dashboard/sessions/${id}`)
            router.refresh()
          }}
        />
      )}

      {/* two feedbacks */}
      <div className='mt-8 grid grid-cols-1 gap-x-12 gap-y-10 lg:grid-cols-2'>
        {/* student feedback */}
        <section className='min-w-0'>
          <ColumnHeader
            tone='brand'
            title='Student feedback'
            hint='For the student · emailed as a PDF'
            icon={
              <>
                <rect x='3' y='5' width='18' height='14' rx='2' />
                <path d='m3 7 9 6 9-6' />
              </>
            }
          />
          <div className='divide-y divide-line border-t border-line [&>*]:py-6'>
            <VocabEditor vocab={vocab} setVocab={setVocab} disabled={locked} />
            <ListEditor
              title='Went well'
              tone='mint'
              items={wentWell}
              setItems={setWentWell}
              disabled={locked}
              placeholder='Something they did well…'
              maxItems={2}
            />
            <ListEditor
              title='Areas to improve'
              tone='amber'
              items={focus}
              setItems={setFocus}
              disabled={locked}
              placeholder='An area to improve…'
              maxItems={2}
            />
            <div>
              <SectionLabel>Homework</SectionLabel>
              <textarea
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
                disabled={locked}
                rows={3}
                placeholder='Suggest a task to practise before next lesson…'
                className='w-full resize-none rounded-xl border border-amber/30 bg-white px-4 py-3 text-sm text-ink outline-none transition-all [field-sizing:content] focus:border-amber focus:ring-4 focus:ring-amber/20 disabled:opacity-70'
              />
            </div>
            <div>
              <SectionLabel>Additional information</SectionLabel>
              <textarea
                value={additionalInfo}
                onChange={(e) => setAdditionalInfo(e.target.value)}
                disabled={locked}
                rows={3}
                placeholder='Anything else to pass on to the student…'
                className='w-full resize-none rounded-xl border border-brand-line bg-white px-4 py-3 text-sm text-ink outline-none transition-all [field-sizing:content] focus:border-brand focus:ring-4 focus:ring-brand/30 disabled:opacity-70'
              />
              <AttachmentsEditor
                sessionId={session.id}
                initial={attachments}
                disabled={locked}
                deliveries={deliveries}
                onError={(msg) => flash(msg, 'err')}
              />
            </div>
          </div>
        </section>

        {/* tutor notes */}
        <section className='min-w-0'>
          <ColumnHeader
            tone='mint'
            title='Tutor notes'
            hint='For you · private, never sent'
            icon={
              <>
                <rect x='5' y='11' width='14' height='10' rx='2' />
                <path d='M8 11V7a4 4 0 0 1 8 0v4' />
              </>
            }
          />
          <div className='divide-y divide-line border-t border-line [&>*]:py-6'>
            <div>
              <div className='mb-3 flex items-baseline justify-between gap-3'>
                <SectionLabel>Lesson metrics</SectionLabel>
                <span className='text-xs font-medium uppercase tracking-wide text-muted'>
                  Measured from the lesson
                </span>
              </div>
              <TalkTimeMeter studentPct={session.talkTime.student} />
              <div className='mt-4 flex items-center justify-between gap-3'>
                <span className='text-sm font-medium text-ink-soft'>
                  Observed level this lesson
                </span>
                <span className='rounded-full bg-mint/15 px-3 py-1 text-sm font-semibold text-cocoa'>
                  {session.observedLevel}
                </span>
              </div>
              {student && !isLevelDetermined(student.lessonCount) && (
                <p className='mt-2 text-xs text-cocoa/80'>
                  One data point toward a level — BumbleNote waits for{' '}
                  {LEVEL_DETERMINATION_LESSONS} taught lessons before calling{' '}
                  {session.studentName.split(' ')[0]}&rsquo;s level determined
                  ({student.lessonCount}/{LEVEL_DETERMINATION_LESSONS} so far).
                </p>
              )}
            </div>
            {student && student.focus.length > 0 && (
              <div>
                <SectionLabel>Focus areas</SectionLabel>
                <ul className='flex flex-col gap-2 border-l-[3px] border-l-mint/60 pl-4'>
                  {student.focus.map((f, i) => (
                    <li key={i} className='text-base text-ink-soft'>
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <SectionLabel>Where the lesson ended</SectionLabel>
              <textarea
                value={lessonEndedAt}
                onChange={(e) => setLessonEndedAt(e.target.value)}
                disabled={locked}
                rows={2}
                placeholder='Where in the material you stopped…'
                className='w-full resize-none rounded-xl border border-mint/30 bg-white px-4 py-3 text-sm text-ink outline-none transition-all [field-sizing:content] focus:border-mint focus:ring-4 focus:ring-mint/15 disabled:opacity-70'
              />
            </div>
            <ListEditor
              title='Suggestions for next lesson'
              tone='brand'
              items={nextLesson}
              setItems={setNextLesson}
              disabled={locked}
              placeholder='An idea for next time…'
            />
            <div>
              <SectionLabel>Prep notes</SectionLabel>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                disabled={locked}
                rows={5}
                className='w-full resize-none rounded-xl border border-brand-line bg-white px-4 py-3 text-ink outline-none transition-all [field-sizing:content] focus:border-brand focus:ring-4 focus:ring-brand/30 disabled:opacity-70'
              />
            </div>
          </div>
        </section>
      </div>

      {/* actions */}
      {!sent && missingEmail && (
        <Notice
          tone='amber'
          title={`No email on file for ${session.studentName}`}
          action={
            <Link
              href={`/dashboard/students/${session.studentId}`}
              className='text-sm font-semibold text-brand-deep hover:underline'
            >
              Add email →
            </Link>
          }
        >
          Add one to send the report.
        </Notice>
      )}

      <div className='sticky bottom-4 mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-line bg-surface/90 p-4 shadow-soft-md backdrop-blur'>
        <div className='flex items-center gap-3'>
          {confirmDelete ? (
            <div className='flex items-center gap-2'>
              <span className='text-sm font-medium text-[#d9534f]'>
                Delete this lesson?
              </span>
              <button
                onClick={remove}
                disabled={deleting}
                className='rounded-lg bg-[#d9534f] px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#c33] disabled:cursor-not-allowed disabled:opacity-60'
              >
                {deleting ? 'Deleting…' : 'Yes, delete'}
              </button>
              <button
                onClick={() => setConfirmDelete(false)}
                disabled={deleting}
                className='rounded-lg border border-line px-3.5 py-2 text-sm font-semibold text-ink transition-colors hover:bg-white disabled:opacity-60'
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              onClick={() => setConfirmDelete(true)}
              disabled={saving}
              className='rounded-xl border border-line px-4 py-3 font-semibold text-muted transition-colors hover:border-[#e77] hover:text-[#d9534f] disabled:cursor-not-allowed disabled:opacity-60'
            >
              Delete
            </button>
          )}
        </div>
        <div
          className={`min-h-[1.25rem] flex-1 text-right text-sm font-medium ${
            flashTone === 'err' ? 'text-danger-deep' : 'text-success-deep'
          }`}
        >
          {saved ??
            (dirty ? (
              <span className='text-brand-deep'>Unsaved changes</span>
            ) : null)}
        </div>
        <div className='flex flex-wrap items-center justify-end gap-3'>
          {sent ? (
            // A sent report is read-only until Edit; saving keeps it sent.
            editing ? (
              <>
                <button
                  onClick={cancelEdit}
                  disabled={saving}
                  className='rounded-xl border border-line px-4 py-3 font-semibold text-ink transition-colors hover:bg-white disabled:opacity-60'
                >
                  Cancel
                </button>
                <button
                  onClick={() => save('sent')}
                  disabled={saving}
                  className='rounded-xl border border-brand-line bg-white/70 px-5 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-brand disabled:cursor-not-allowed disabled:opacity-60'
                >
                  {saving ? 'Saving…' : 'Save changes'}
                </button>
              </>
            ) : (
              <button
                onClick={() => {
                  setConfirmResend(false)
                  setEditing(true)
                }}
                disabled={resending}
                className='rounded-xl border border-brand-line bg-white/70 px-5 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-brand disabled:cursor-not-allowed disabled:opacity-60'
              >
                Edit
              </button>
            )
          ) : (
            // Saves in place: a confirmed lesson stays confirmed, so editing after
            // confirming doesn't force the tutor to demote it back to a draft.
            <button
              onClick={() => save(confirmed ? 'confirmed' : 'draft')}
              disabled={saving}
              className='rounded-xl border border-brand-line bg-white/70 px-5 py-3 font-semibold text-ink transition-all duration-300 hover:-translate-y-0.5 hover:border-brand disabled:cursor-not-allowed disabled:opacity-60'
            >
              {saving &&
              (pending === 'draft' || (pending === 'confirmed' && confirmed))
                ? 'Saving…'
                : confirmed
                  ? 'Save changes'
                  : 'Save draft'}
            </button>
          )}
          <button
            onClick={() => save('confirmed')}
            disabled={sent || saving || confirmed}
            className='inline-flex items-center gap-2 rounded-xl border border-info bg-info/10 px-5 py-3 font-semibold text-info-deep transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60'
          >
            {confirmed || sent
              ? 'Confirmed ✓'
              : pending === 'confirmed'
                ? 'Confirming…'
                : 'Confirm lesson'}
          </button>
          {sent ? (
            confirmResend ? (
              <div className='flex items-center gap-2'>
                <span className='text-sm font-medium text-ink-soft'>
                  Email the report to {session.studentName.split(' ')[0]} again?
                </span>
                <CopyMeCheckbox
                  checked={copyMe}
                  onChange={setCopyMe}
                  disabled={resending}
                />
                <button
                  onClick={resend}
                  disabled={resending}
                  className='rounded-full bg-cocoa px-5 py-3 font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]'
                >
                  {resending ? 'Resending…' : 'Yes, resend'}
                </button>
                <button
                  onClick={() => setConfirmResend(false)}
                  disabled={resending}
                  className='rounded-xl border border-line px-4 py-3 font-semibold text-ink transition-colors hover:bg-white disabled:opacity-60'
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setConfirmResend(true)}
                disabled={missingEmail || editing}
                title={
                  missingEmail
                    ? 'Add an email address to resend.'
                    : editing
                      ? 'Save or cancel your edits before resending.'
                      : undefined
                }
                className='inline-flex items-center gap-2 rounded-full bg-cocoa px-6 py-3 font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]'
                style={{ boxShadow: '0 10px 24px -10px rgba(65,46,40,.45)' }}
              >
                Resend to student ↻
              </button>
            )
          ) : (
            <>
              <CopyMeCheckbox
                checked={copyMe}
                onChange={setCopyMe}
                disabled={saving || missingEmail || !confirmed}
              />
              <button
                onClick={() => save('sent')}
                disabled={saving || missingEmail || !confirmed}
                title={
                  !confirmed ? 'Confirm the lesson before sending.' : undefined
                }
                className='inline-flex items-center gap-2 rounded-full bg-cocoa px-6 py-3 font-semibold text-butter transition-all duration-300 hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 uppercase tracking-[.1em] hover:bg-cocoa-lift text-[.85rem]'
                style={{ boxShadow: '0 10px 24px -10px rgba(65,46,40,.45)' }}
              >
                {pending === 'sent' ? 'Sending…' : 'Send to student →'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/** Opt-in BCC of the report to the tutor, shown beside Send / Resend. */
function CopyMeCheckbox({
  checked,
  onChange,
  disabled,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  disabled?: boolean
}) {
  return (
    <label className='inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-ink-soft has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60'>
      <input
        type='checkbox'
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
        className='h-4 w-4 accent-[#412e28]'
      />
      Send me a copy
    </label>
  )
}

/**
 * Offered when the same student has other unsent recordings from around the
 * same time — almost always a call that dropped and was picked back up.
 */
function MergePanel({
  sessionId,
  studentName,
  candidates,
  dirty,
  onError,
  onMerged,
}: {
  sessionId: string
  studentName: string
  candidates: MergeCandidate[]
  dirty: boolean
  onError: (msg: string) => void
  onMerged: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [merging, setMerging] = useState(false)
  // This lesson is always part of the merge; the others start ticked when they
  // all fit in one merge.
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        candidates.length <= MAX_MERGE_PARTS
          ? candidates.map((c) => c.id)
          : [sessionId],
      ),
  )

  const picked = candidates.filter((c) => selected.has(c.id))
  const totalMin = picked.reduce((n, c) => n + c.durationMin, 0)
  const times = picked.map((c) => new Date(c.createdAt).getTime())
  const spanTooWide =
    picked.length > 1 &&
    Math.max(...times) - Math.min(...times) > MERGE_WINDOW_HOURS * 3_600_000
  const tooMany = picked.length > MAX_MERGE_PARTS
  const canMerge =
    picked.length >= 2 && !spanTooWide && !tooMany && !dirty && !merging
  const others = candidates.length - 1

  function toggle(id: string) {
    if (id === sessionId) return
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function merge() {
    setMerging(true)
    try {
      const result = await mergeSessions(picked.map((c) => c.id))
      if (!result.ok) {
        onError(result.error)
        return
      }
      setOpen(false)
      onMerged(result.id)
    } catch {
      onError("Couldn't combine the recordings — please try again.")
    } finally {
      setMerging(false)
    }
  }

  return (
    <div className='mt-6 rounded-r-lg border-l-[3px] border-l-amber bg-amber/10 py-4 pl-4 pr-4'>
      <div className='flex flex-wrap items-center justify-between gap-3'>
        <div>
          <div className='font-semibold text-brand-deep'>
            Did the call drop?
          </div>
          <div className='text-sm text-brand-deep/80'>
            There{' '}
            {others === 1
              ? 'is 1 other recording'
              : `are ${others} other recordings`}{' '}
            of {studentName.split(' ')[0]} from around the same time. Combine
            them into one lesson and one report.
          </div>
        </div>
        {!open && (
          <button
            onClick={() => setOpen(true)}
            className='text-sm font-semibold text-brand-deep hover:underline'
          >
            Combine recordings →
          </button>
        )}
      </div>

      {open && (
        <div className='mt-4'>
          <ul className='divide-y divide-amber/25 border-y border-amber/25'>
            {candidates.map((c) => {
              const isSelf = c.id === sessionId
              return (
                <li key={c.id}>
                  <label
                    className={`-mx-2 flex items-center gap-3 rounded-lg px-2 py-2.5 text-sm ${
                      isSelf ? '' : 'cursor-pointer hover:bg-white/60'
                    }`}
                  >
                    <input
                      type='checkbox'
                      checked={selected.has(c.id)}
                      disabled={isSelf || merging}
                      onChange={() => toggle(c.id)}
                      className='h-4 w-4 accent-[#412e28]'
                    />
                    <span
                      className='min-w-0 flex-1 truncate font-medium text-ink'
                      title={c.title}
                    >
                      {c.title}
                      {isSelf && (
                        <span className='font-normal text-muted'>
                          {' '}
                          · this lesson
                        </span>
                      )}
                    </span>
                    <span
                      className='flex-none text-xs text-muted'
                      suppressHydrationWarning
                    >
                      {new Date(c.createdAt).toLocaleTimeString([], {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}{' '}
                      · {c.durationMin} min
                    </span>
                  </label>
                </li>
              )
            })}
          </ul>

          <div className='mt-3 flex flex-wrap items-center justify-between gap-3'>
            <div className='text-sm text-brand-deep'>
              {tooMany ? (
                `Combine up to ${MAX_MERGE_PARTS} recordings at once.`
              ) : spanTooWide ? (
                `Pick recordings made within ${MERGE_WINDOW_HOURS} hours of each other.`
              ) : dirty ? (
                'Save your edits first — combining uses the saved version of each lesson.'
              ) : picked.length < 2 ? (
                'Pick at least one other recording.'
              ) : (
                <>
                  <strong>{totalMin} min</strong> combined ·{' '}
                  {countsAsLesson(totalMin)
                    ? 'uses 1 lesson credit'
                    : `under ${MIN_COUNTED_LESSON_MIN} min, so no credit used`}
                </>
              )}
            </div>
            <div className='flex items-center gap-2'>
              <button
                onClick={() => setOpen(false)}
                disabled={merging}
                className='px-2 py-2 text-sm font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-60'
              >
                Cancel
              </button>
              <button
                onClick={merge}
                disabled={!canMerge}
                className='rounded-full bg-cocoa px-4 py-2 text-sm font-semibold text-butter transition-colors disabled:cursor-not-allowed disabled:opacity-60 uppercase tracking-[.1em] hover:bg-cocoa-lift'
              >
                {merging
                  ? 'Combining… (about a minute)'
                  : `Combine ${picked.length} recordings`}
              </button>
            </div>
          </div>
          <p className='mt-2 text-xs text-brand-deep/70'>
            The feedback is rewritten as one lesson and the separate recordings
            are removed. Attachments are kept.
          </p>
        </div>
      )}
    </div>
  )
}

/** The heading over each of the two feedback columns, in the overview's style. */
function ColumnHeader({
  tone,
  title,
  hint,
  icon,
}: {
  tone: 'brand' | 'mint'
  title: string
  hint: string
  icon: React.ReactNode
}) {
  return (
    <header className='mb-4 flex items-center gap-3'>
      <span
        className={`grid h-10 w-10 flex-none place-items-center rounded-xl ${
          tone === 'brand'
            ? 'bg-brand-soft text-brand-deep'
            : 'bg-mint/15 text-mint'
        }`}
      >
        <svg
          width='18'
          height='18'
          viewBox='0 0 24 24'
          fill='none'
          stroke='currentColor'
          strokeWidth='2'
          strokeLinecap='round'
          strokeLinejoin='round'
          aria-hidden
        >
          {icon}
        </svg>
      </span>
      <div className='min-w-0'>
        <h2 className='text-lg font-semibold text-ink'>{title}</h2>
        <p className='text-sm text-muted'>{hint}</p>
      </div>
    </header>
  )
}

const noticeTones = {
  success: { bar: 'border-l-success bg-success/10', title: 'text-success-deep' },
  amber: { bar: 'border-l-amber bg-amber/10', title: 'text-brand-deep' },
}

/** A one-line status note: a coloured bar down the side rather than a boxed card. */
function Notice({
  tone,
  title,
  action,
  children,
}: {
  tone: keyof typeof noticeTones
  title: string
  action?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <div
      className={`mt-6 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-r-lg border-l-[3px] py-3 pl-4 pr-4 ${noticeTones[tone].bar}`}
    >
      <div className='min-w-0'>
        <div className={`font-semibold ${noticeTones[tone].title}`}>{title}</div>
        {children && <div className='text-sm text-ink-soft'>{children}</div>}
      </div>
      {action}
    </div>
  )
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className='mb-3 text-sm font-bold uppercase tracking-wide text-ink-soft'>
      {children}
    </div>
  )
}

function TalkTimeMeter({ studentPct }: { studentPct: number }) {
  const tutorPct = 100 - studentPct
  return (
    <div>
      <div className='flex items-center justify-between text-sm font-semibold'>
        <span className='text-brand-deep'>Student {studentPct}%</span>
        <span className='text-cocoa'>Tutor {tutorPct}%</span>
      </div>
      <div className='mt-2 flex h-3 overflow-hidden rounded-full bg-brand-soft'>
        <div className='bg-brand' style={{ width: `${studentPct}%` }} />
        <div className='bg-mint' style={{ width: `${tutorPct}%` }} />
      </div>
      <p className='mt-2 text-xs text-muted'>
        Share of speaking time during the lesson.
      </p>
    </div>
  )
}

const toneRing: Record<string, string> = {
  brand: 'focus:border-brand focus:ring-brand/30 border-brand-line',
  mint: 'focus:border-mint focus:ring-mint/15 border-mint/30',
  amber: 'focus:border-amber focus:ring-amber/20 border-amber/30',
}

function ListEditor({
  title,
  items,
  setItems,
  tone,
  placeholder,
  disabled,
  maxItems,
}: {
  title: string
  items: string[]
  setItems: (v: string[]) => void
  tone: 'brand' | 'mint' | 'amber'
  placeholder?: string
  disabled?: boolean
  maxItems?: number
}) {
  return (
    <div>
      <SectionLabel>{title}</SectionLabel>
      <div className='flex flex-col gap-2'>
        {items.map((item, i) => (
          <div key={i} className='flex items-start gap-2'>
            <textarea
              value={item}
              disabled={disabled}
              placeholder={placeholder}
              rows={1}
              onChange={(e) => {
                const next = [...items]
                next[i] = e.target.value
                setItems(next)
              }}
              className={`w-full resize-none rounded-xl border bg-white px-3.5 py-2.5 text-sm leading-snug text-ink outline-none transition-all [field-sizing:content] focus:ring-4 disabled:opacity-70 ${toneRing[tone]}`}
            />
            {!disabled && (
              <button
                onClick={() => setItems(items.filter((_, j) => j !== i))}
                className='grid h-9 w-9 flex-none place-items-center rounded-lg border border-line text-muted transition-colors hover:border-[#e77] hover:text-[#d9534f]'
                aria-label='Remove'
              >
                ×
              </button>
            )}
          </div>
        ))}
      </div>
      {!disabled && (!maxItems || items.length < maxItems) && (
        <button
          onClick={() => setItems([...items, ''])}
          className='mt-2 text-sm font-semibold text-brand-deep hover:underline'
        >
          + Add
        </button>
      )}
    </div>
  )
}

/**
 * Files emailed to the student with the report. Each file uploads as soon as
 * it's picked, so attachments aren't part of the "unsaved changes" state — they
 * persist on their own, like a file dropped into a shared folder.
 */
function AttachmentsEditor({
  sessionId,
  initial,
  disabled,
  deliveries,
  onError,
}: {
  sessionId: string
  initial: AttachmentMeta[]
  disabled?: boolean
  deliveries: number
  onError: (msg: string) => void
}) {
  const [files, setFiles] = useState<AttachmentMeta[]>(initial)
  // The server deletes attachments once they've been emailed.
  const [seenDeliveries, setSeenDeliveries] = useState(deliveries)
  if (deliveries !== seenDeliveries) {
    setSeenDeliveries(deliveries)
    setFiles([])
  }
  const [uploading, setUploading] = useState(false)
  const [removing, setRemoving] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const used = files.reduce((n, f) => n + f.size, 0)

  async function upload(picked: FileList | null) {
    if (!picked?.length) return
    setUploading(true)
    let total = used
    try {
      for (const file of Array.from(picked)) {
        // Same rules the server enforces, checked first so an oversized file
        // fails instantly instead of after uploading it.
        if (!isAllowedAttachment(file.name)) {
          onError(
            `${file.name} can't be attached — use a document, spreadsheet, image or audio file.`,
          )
          continue
        }
        if (total + file.size > MAX_ATTACHMENT_TOTAL_BYTES) {
          onError(
            `${file.name} is ${formatBytes(file.size)} — only ${formatBytes(Math.max(0, MAX_ATTACHMENT_TOTAL_BYTES - total))} of the ${formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)} limit is left.`,
          )
          continue
        }
        const form = new FormData()
        form.append('file', file)
        const result = await uploadSessionAttachment(sessionId, form)
        if (!result.ok) {
          onError(result.error)
          continue
        }
        total += result.attachment.size
        setFiles((prev) => [...prev, result.attachment])
      }
    } catch {
      onError("Couldn't attach the file — please try again.")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  async function remove(id: string) {
    setRemoving(id)
    try {
      await deleteSessionAttachment(sessionId, id)
      setFiles((prev) => prev.filter((f) => f.id !== id))
    } catch {
      onError("Couldn't remove the file — please try again.")
    } finally {
      setRemoving(null)
    }
  }

  if (disabled && files.length === 0) return null

  return (
    <div className='mt-3'>
      {files.length > 0 && (
        <ul className='mb-2 flex flex-col gap-2'>
          {files.map((f) => (
            <li
              key={f.id}
              className='flex items-center gap-3 rounded-xl border border-brand-line bg-white/60 px-3.5 py-2.5 text-sm'
            >
              <span
                className='grid h-7 w-7 flex-none place-items-center rounded-lg bg-brand-soft text-xs text-brand-deep'
                aria-hidden
              >
                📎
              </span>
              <span
                className='min-w-0 flex-1 truncate font-medium text-ink'
                title={f.filename}
              >
                {f.filename}
              </span>
              <span className='flex-none text-xs text-muted'>
                {formatBytes(f.size)}
              </span>
              {!disabled && (
                <button
                  onClick={() => remove(f.id)}
                  disabled={removing === f.id}
                  className='grid h-8 w-8 flex-none place-items-center rounded-lg border border-line text-muted transition-colors hover:border-[#e77] hover:text-[#d9534f] disabled:opacity-60'
                  aria-label={`Remove ${f.filename}`}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {!disabled && (
        <div className='flex flex-wrap items-center justify-between gap-2'>
          <button
            type='button'
            onClick={() => inputRef.current?.click()}
            disabled={uploading || used >= MAX_ATTACHMENT_TOTAL_BYTES}
            className='text-sm font-semibold text-brand-deep hover:underline disabled:cursor-not-allowed disabled:opacity-60 disabled:no-underline'
          >
            {uploading ? 'Attaching…' : '+ Attach file'}
          </button>
          <span className='text-xs text-muted'>
            {formatBytes(used)} of {formatBytes(MAX_ATTACHMENT_TOTAL_BYTES)}
          </span>
          <input
            ref={inputRef}
            type='file'
            multiple
            hidden
            accept={ALLOWED_ATTACHMENT_EXTENSIONS.map((e) => `.${e}`).join(',')}
            onChange={(e) => upload(e.target.files)}
          />
        </div>
      )}
    </div>
  )
}

function VocabEditor({
  vocab,
  setVocab,
  disabled,
}: {
  vocab: VocabItem[]
  setVocab: (v: VocabItem[]) => void
  disabled?: boolean
}) {
  function update(i: number, key: keyof VocabItem, value: string) {
    const next = vocab.map((v, j) => (j === i ? { ...v, [key]: value } : v))
    setVocab(next)
  }
  return (
    <div>
      <SectionLabel>New vocabulary</SectionLabel>
      <div className='divide-y divide-line border-l-[3px] border-l-brand-line'>
        {vocab.map((v, i) => (
          <div key={i} className='py-3 pl-4 first:pt-1 last:pb-1'>
            <div className='flex items-start gap-2'>
              <input
                value={v.term}
                disabled={disabled}
                placeholder='term'
                onChange={(e) => update(i, 'term', e.target.value)}
                className='w-40 flex-none rounded-lg border border-brand-line bg-white px-3 py-2 text-sm font-semibold text-ink outline-none transition-all focus:border-brand focus:ring-4 focus:ring-brand/30 disabled:opacity-70'
              />
              <span className='mt-2 flex-none text-sm text-muted' aria-hidden>
                —
              </span>
              <textarea
                value={v.meaning}
                disabled={disabled}
                placeholder='meaning'
                rows={1}
                onChange={(e) => update(i, 'meaning', e.target.value)}
                className='min-w-0 flex-1 resize-none rounded-lg border border-brand-line bg-white px-3 py-2 text-sm leading-snug text-ink-soft outline-none transition-all [field-sizing:content] focus:border-brand focus:ring-4 focus:ring-brand/30 disabled:opacity-70'
              />
              {!disabled && (
                <button
                  onClick={() => setVocab(vocab.filter((_, j) => j !== i))}
                  className='grid h-9 w-9 flex-none place-items-center rounded-lg border border-line text-muted transition-colors hover:border-[#e77] hover:text-[#d9534f]'
                  aria-label='Remove'
                >
                  ×
                </button>
              )}
            </div>
            <textarea
              value={v.example}
              disabled={disabled}
              placeholder='Example sentence from the lesson…'
              rows={1}
              onChange={(e) => update(i, 'example', e.target.value)}
              className='mt-2 w-full resize-none rounded-lg border border-line bg-white px-3 py-2 text-sm italic leading-snug text-ink-soft outline-none transition-all [field-sizing:content] focus:border-brand focus:ring-4 focus:ring-brand/30 disabled:opacity-70'
            />
          </div>
        ))}
      </div>
      {!disabled && (
        <button
          onClick={() =>
            setVocab([...vocab, { term: '', meaning: '', example: '' }])
          }
          className='mt-2 text-sm font-semibold text-brand-deep hover:underline'
        >
          + Add word
        </button>
      )}
    </div>
  )
}
