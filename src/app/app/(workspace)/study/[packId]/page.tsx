import { StudySession } from "@/components/study/study-session";

export default async function StudyPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  return <StudySession packId={packId} />;
}
