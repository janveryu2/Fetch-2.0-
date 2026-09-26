export type Question = {
  id: string;
  type: "multiple_choice" | "fill_blank";
  prompt: string;
  answer: string;
  choices?: string[];
  explanation: string;
};

export type StudyQuestion = Omit<Question, "answer" | "explanation"> & {
  /** Account packs omit answer keys until the learner submits an answer. */
  answer?: string;
  explanation?: string;
};

export type ArtifactKind = "quiz" | "flashcards" | "summary";
export type ArtifactOrigin = "generated" | "manual";
export type ArtifactStatus = "processing" | "ready" | "failed";

export type StudyArtifact = {
  id: string;
  packId: string;
  ownerId?: string;
  kind: ArtifactKind;
  origin: ArtifactOrigin;
  status: ArtifactStatus;
  title: string;
  version: number;
  createdAt: string;
  updatedAt: string;
};

export type StudyPack = {
  id: string;
  title: string;
  sourceLabel: string;
  createdAt: string;
  questions: StudyQuestion[];
  progress: number;
  artifacts?: StudyArtifact[];
};

export type StudyAttempt = {
  id: string;
  packId: string;
  packTitle: string;
  score: number;
  correct: number;
  total: number;
  completedAt: string;
};

export type CalendarEvent = {
  id: string;
  title: string;
  date: string;
  type: "study" | "exam" | "deadline";
  allDay?: boolean;
  start?: string;
  end?: string;
  color?: string;
  subject?: string;
  location?: string;
  packId?: string;
};
