import { StudyPackDetail } from "@/components/study/study-pack-detail";

export default async function StudyPackPage({ params }: { params: Promise<{ packId: string }> }) {
  const { packId } = await params;
  return <StudyPackDetail packId={packId} />;
}
