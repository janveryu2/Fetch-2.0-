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

export type StudyPack = {
  id: string;
  title: string;
  sourceLabel: string;
  createdAt: string;
  questions: StudyQuestion[];
  progress: number;
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
