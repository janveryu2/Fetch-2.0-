import { FlashcardStudyView } from "@/components/study/flashcard-study-view";

export default async function FlashcardStudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ artifactId: string }>;
  searchParams: Promise<{ packId?: string; title?: string }>;
}) {
  const { artifactId } = await params;
  const { packId = "", title = "Flashcards" } = await searchParams;

  return (
    <FlashcardStudyView
      artifactId={artifactId}
      packId={packId || artifactId}
      title={title}
    />
  );
}
