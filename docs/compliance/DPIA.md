# Data Protection Impact Assessment — BumbleNote lesson recording

| | |
|---|---|
| Controller (tutor accounts) / processor (student data) | Dzhani Cooper, trading as BumbleNote (UK sole trader) |
| Contact | see `LEGAL.contactEmail` in `src/lib/legal.ts` |
| Version | 1 — drafted 23 September 2026 |
| Review | before public launch; then yearly, or whenever a provider, data category, or AI use changes |
| Status | **Draft — to be reviewed and signed off by the operator** |

## 1. Why a DPIA

The ICO lists processing that needs a DPIA. BumbleNote meets several of those criteria at once:

- **Innovative technology:** AI analysis of recorded speech.
- **Evaluating people:** an observed CEFR level, talk time, and strengths and weaknesses.
- **Vulnerable data subjects:** students may be children.
- **Data not obtained from the data subject:** the tutor enters and records it.

Voice recordings are not special category data here, because they are never used to identify anyone. They are still sensitive.

Tutors are the controllers for student data, so strictly this is their DPIA. BumbleNote writes it once so every tutor can rely on it, which is part of the Art. 28(3)(f) assistance the Terms promise (`/terms#data-processing`).

## 2. The processing

| Step | Data | Where | Kept |
|---|---|---|---|
| Tutor creates student profile | name, email (optional), first language, level, goal, interests, focus areas, target exam, hourly rate, notes | Neon (London) | until tutor deletes |
| Tutor records lesson (tutor confirms student consent each time) | two audio tracks: tutor mic, lesson-tab audio (student) | browser → Netlify Blobs (US) | deleted when notes exist; ≤ 7 days on failure (`purge-uploads.mts`) |
| Transcription | audio | Deepgram (US), `mip_opt_out: true` | not used for training |
| Analysis | transcript + profile fields | Anthropic API (US) | briefly, for abuse monitoring; never used for training |
| Transcript cache | transcript | Netlify Blobs | deleted with the audio |
| Draft notes | vocab, went well, focus, homework, level, talk time, tutor notes | Neon | until tutor deletes |
| Tutor reviews and sends | PDF report + attachments | Resend (US) → student inbox | attachments ≤ `ATTACHMENT_RETENTION_DAYS` |

**Lawful basis.** Each tutor chooses their own lawful basis. Typically it is legitimate interests or contract with the student, with consent specifically for the recording. BumbleNote's own basis for tutor account data is contract and legitimate interests.

## 3. Necessity and proportionality

- **Minimisation:** transcripts never reach the database, and audio is deleted as soon as the notes exist.
- **No secondary use:** no training on the data, no advertising, no analytics.
- **Human in the loop:** nothing reaches a student until the tutor has reviewed it (`/terms#ai-output`). No decision about the student is fully automated, so Art. 22 doesn't apply.
- **Transparency:**
  - privacy policy `#students` section, linked from every report email and from the consent tick
  - students are told the recording was made with their agreement
- **Rights:**
  - tutors can view, edit, export (Settings → Download your data) and delete
  - students go through their tutor, with the operator as a fallback contact

## 4. Risks

| # | Risk to students/tutors | Likelihood | Severity | Mitigation | Residual |
|---|---|---|---|---|---|
| R1 | Student recorded without knowing or agreeing | Medium | High | Per-lesson consent tick (`ConsentCheck.tsx`); Terms duty and indemnity; browser recording indicator; student told in the report email | Low–Medium: consent is still self-declared by the tutor |
| R2 | Child's data processed without parental agreement | Medium | High | Consent tick and Terms explicitly require a parent or guardian for under-18s | Medium: consider an "under 18" flag on the student profile |
| R3 | Recording outlives its purpose | Low | High | Deleted after processing; daily sweep with alerts on failure | Low |
| R4 | Provider trains on or reuses lesson content | Low | Medium | Deepgram MIP opt-out; Anthropic commercial terms | Low: re-check provider terms yearly |
| R5 | Inaccurate AI assessment harms a student (wrong level, wrong feedback) | Medium | Medium | Tutor review required before sending; Terms make clear it's a draft | Low |
| R6 | Breach of the database or blob store | Low | High | TLS; tenant-scoped queries; operator-only access; hashed reset and capture tokens | Low–Medium: single operator, no formal access review |
| R7 | US transfer exposes data to foreign access | Low | Medium | DPF / IDTA Addendum; database in the UK; audio held briefly | Low |
| R8 | Tutor's account deleted but data survives | Low | Medium | Cascade delete; backups roll off within `backupRetentionDays` | Low |
| R9 | Report emailed to the wrong address | Medium | Medium | Tutor enters and confirms the address; tutor gets a BCC copy | Medium |

## 5. Actions outstanding

- [ ] Confirm the Neon project's restore-history window is ≤ 30 days (`LEGAL.backupRetentionDays`).
- [ ] Check each US provider's transfer mechanism (DPF certification or IDTA Addendum in their DPA) and file copies of their DPAs.
- [ ] Confirm the Deepgram MIP opt-out on the account dashboard, not only per request.
- [ ] Consider an "under 18" flag on student profiles that reminds the tutor about guardian consent.
- [ ] Consider expiring dormant free accounts (e.g. 24 months inactive, with email notice).
- [ ] Revisit if you add EU marketing (Art. 3(2) / Art. 27 EU representative).

## 6. Sign-off

Operator: ____________________  Date: __________
