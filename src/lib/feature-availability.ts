/**
 * FETCH Feature Availability & Runtime Capability Contract
 *
 * Defines truthful state representation across marketing, workspace, and secondary tools.
 * Separates editorial/marketing availability (pricing, feature preview cards)
 * from server-derived runtime capabilities (real execution prerequisites).
 */

export type AvailabilityStatus =
  | "available"
  | "account"
  | "preview"
  | "planned"
  | "coming_soon";

export interface FeatureDescriptor {
  key: string;
  name: string;
  status: AvailabilityStatus;
  badgeLabel: string;
  description: string;
  scopeNote?: string;
}

export interface RuntimeCapabilities {
  mode: "demo" | "account";
  userId?: string;
  aiConfigured: boolean;
  tutorConfigured: boolean;
  socialDelivery: "preview";
  accountDataStatus: "unauthenticated" | "loading" | "ready" | "error";
  syncError?: string;
}

/**
 * Editorial feature matrix used for landing, pricing, and feature cards.
 * Ensures marketing never promises unbuilt features without truthful badges.
 */
export const EDITORIAL_FEATURES: Record<string, FeatureDescriptor> = {
  paste_intake: {
    key: "paste_intake",
    name: "Paste study material",
    status: "available",
    badgeLabel: "Available",
    description: "Generate practice questions directly from your pasted notes and lecture transcripts.",
  },
  ai_generation: {
    key: "ai_generation",
    name: "AI StudyPack generation",
    status: "account",
    badgeLabel: "Account feature",
    description: "Cloud AI generation produces tailored questions when OpenAI credentials are configured.",
    scopeNote: "Falls back to local development fixture when AI is unconfigured.",
  },
  pdf_link_intake: {
    key: "pdf_link_intake",
    name: "Document & Link intake",
    status: "coming_soon",
    badgeLabel: "Coming soon",
    description: "Direct PDF uploads and web article URL extraction are in active development.",
  },
  active_recall_quiz: {
    key: "active_recall_quiz",
    name: "Active recall quizzes",
    status: "available",
    badgeLabel: "Available",
    description: "Multiple choice and fill-in-the-blank practice with immediate feedback.",
  },
  quiz_draft_recovery: {
    key: "quiz_draft_recovery",
    name: "Interrupted session recovery",
    status: "available",
    badgeLabel: "Available",
    description: "Active quizzes are protected in browser storage so progress is never lost on refresh.",
  },
  calendar: {
    key: "calendar",
    name: "Study Calendar",
    status: "available",
    badgeLabel: "Available",
    description: "Schedule study sessions, exams, and project deadlines.",
  },
  pomodoro: {
    key: "pomodoro",
    name: "Focus Timer",
    status: "available",
    badgeLabel: "Available",
    description: "Customizable 25/5 Pomodoro intervals with browser audio chimes.",
  },
  music_local: {
    key: "music_local",
    name: "Local Audio Studio",
    status: "available",
    badgeLabel: "Available",
    description: "Play your own audio files from your device while studying.",
    scopeNote: "Audio remains in this browser and is not uploaded to servers.",
  },
  music_youtube: {
    key: "music_youtube",
    name: "YouTube Ambient Player",
    status: "available",
    badgeLabel: "Available",
    description: "Stream lofi and study streams using the privacy-enhanced YouTube player.",
  },
  tutor: {
    key: "tutor",
    name: "FETCH AI Tutor",
    status: "account",
    badgeLabel: "Account feature",
    description: "Context-aware conversational study companion tied to your StudyPacks.",
    scopeNote: "Requires an active account and configured AI services.",
  },
  multiplayer_rooms: {
    key: "multiplayer_rooms",
    name: "Multiplayer Live Rooms",
    status: "preview",
    badgeLabel: "Preview",
    description: "Explore the live study room interface with local room codes.",
    scopeNote: "Preview only: does not connect to external participants.",
  },
  friends_social: {
    key: "friends_social",
    name: "Study Buddies",
    status: "preview",
    badgeLabel: "Preview",
    description: "Interface preview for buddy search, study streaks, and shared goals.",
    scopeNote: "Preview only: buddy invites and real-time requests are unconnected.",
  },
  pro_max: {
    key: "pro_max",
    name: "FETCH Pro Max",
    status: "planned",
    badgeLabel: "Planned",
    description: "Proposed tier with priority generation and multi-device sync.",
    scopeNote: "Pricing is proposed; payments and purchases are currently unavailable.",
  },
};

/**
 * Returns UI badge styling and label for an availability status.
 */
export function getAvailabilityBadgeProps(status: AvailabilityStatus): {
  label: string;
  variant: "default" | "secondary" | "outline" | "danger" | "warning";
} {
  switch (status) {
    case "available":
      return { label: "Available", variant: "default" };
    case "account":
      return { label: "Account feature", variant: "secondary" };
    case "preview":
      return { label: "Preview", variant: "outline" };
    case "planned":
      return { label: "Planned", variant: "outline" };
    case "coming_soon":
      return { label: "Coming soon", variant: "outline" };
  }
}

/**
 * Canonical terms as defined in the FETCH Copy Contract:
 * - "StudyPack" for the saved set
 * - "study session" for active practice
 * - "attempt" for a completed record
 * - "result" for its score
 * - "demo" for browser-local data
 * - "preview" for an experimental UI
 * - "account" for authenticated cloud persistence
 */
export const COPY_CONTRACT = {
  packNoun: "StudyPack",
  sessionNoun: "study session",
  attemptNoun: "attempt",
  resultNoun: "result",
  demoModeLabel: "Browser demo",
  accountModeLabel: "Account",
  previewTag: "Local preview",
} as const;
