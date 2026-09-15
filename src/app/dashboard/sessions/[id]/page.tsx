import { notFound } from "next/navigation";
import Topbar from "@/components/dashboard/Topbar";
import SessionReview from "@/components/dashboard/SessionReview";
import {
  getMergeCandidates,
  getSessionAttachments,
  getSessionById,
  getStudentById,
} from "@/db/queries";

export default async function SessionReviewPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSessionById(id);
  if (!session) notFound();
  const [student, attachments, mergeCandidates] = await Promise.all([
    getStudentById(session.studentId),
    getSessionAttachments(id),
    getMergeCandidates(id),
  ]);

  return (
    <>
      <Topbar title="Review lesson feedback" subtitle="Edit, confirm, and send" />
      <SessionReview
        // Remount after a merge rewrites this lesson, so the editors pick up the
        // combined feedback instead of keeping the old part's state.
        key={`${session.id}:${session.durationMin}:${session.title}`}
        session={session}
        student={student}
        attachments={attachments}
        mergeCandidates={mergeCandidates}
      />
    </>
  );
}
