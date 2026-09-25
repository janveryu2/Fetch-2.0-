import { z } from "zod";
import type { StudyPack } from "./demo-types";

export const DRAFT_STORAGE_PREFIX = "fetch-study-draft-v1";
export const DRAFT_MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

export const studySessionDraftSchema = z.object({
  version: z.literal(1),
  sessionId: z.string().min(1),
  clientAttemptId: z.string().min(1),
  scopeId: z.string().min(1), // "demo" or account userId
  packId: z.string().min(1),
  packTitle: z.string().min(1),
  packFingerprint: z.string().min(1),
  currentIndex: z.number().int().min(0),
  currentAnswer: z.string(),
  checked: z.boolean(),
  feedback: z
    .object({
      correct: z.boolean(),
      explanation: z.string(),
      answer: z.string().optional(),
    })
    .nullable(),
  submittedAnswers: z.array(
    z.object({
      questionId: z.string().min(1),
      answer: z.string(),
      correct: z.boolean().optional(),
    }),
  ),
  revision: z.number().int().min(1).optional(),
  startedAt: z.string(),
  updatedAt: z.string(),
  isCompleted: z.boolean().default(false),
});

export type StudySessionDraft = z.infer<typeof studySessionDraftSchema>;

export function getDraftStorageKey(scopeId: string, packId: string): string {
  return `${DRAFT_STORAGE_PREFIX}:${scopeId}:${packId}`;
}

/**
 * Computes a deterministic fingerprint of a StudyPack's questions to detect
 * if the pack was edited or questions were replaced since the session started.
 */
export function computePackFingerprint(pack: Pick<StudyPack, "id" | "questions">): string {
  const ids = pack.questions.map((q) => q.id).join(",");
  const count = pack.questions.length;
  return `${pack.id}:${count}:${ids}`;
}

function getStorage(): Storage | null {
  try {
    if (typeof window !== "undefined" && window.localStorage) {
      return window.localStorage;
    }
    if (typeof globalThis !== "undefined" && (globalThis as unknown as { localStorage?: Storage }).localStorage) {
      return (globalThis as unknown as { localStorage: Storage }).localStorage;
    }
  } catch {
    return null;
  }
  return null;
}

export type DraftLoadResult =
  | { success: true; draft: StudySessionDraft }
  | { success: false; reason: "not_found" | "expired" | "fingerprint_mismatch" | "scope_mismatch" | "invalid_data"; draft?: null };

/**
 * Loads and validates a study draft for the given scope and pack.
 * Validates expiration (30 days) and question fingerprint.
 */
export function loadStudySessionDraft(
  scopeId: string,
  pack: Pick<StudyPack, "id" | "questions">,
): DraftLoadResult {
  const storage = getStorage();
  if (!storage) {
    return { success: false, reason: "not_found" };
  }

  const key = getDraftStorageKey(scopeId, pack.id);
  let raw: string | null = null;
  try {
    raw = storage.getItem(key);
  } catch {
    return { success: false, reason: "not_found" };
  }

  if (!raw) {
    return { success: false, reason: "not_found" };
  }

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(raw);
  } catch {
    return { success: false, reason: "invalid_data" };
  }

  const validation = studySessionDraftSchema.safeParse(parsedJson);
  if (!validation.success) {
    return { success: false, reason: "invalid_data" };
  }

  const draft = validation.data;

  // Scope check: cannot restore another user's draft
  if (draft.scopeId !== scopeId) {
    return { success: false, reason: "scope_mismatch" };
  }

  // Expiration check: drafts expire after 30 days
  const updatedTime = new Date(draft.updatedAt).getTime();
  if (Number.isNaN(updatedTime) || Date.now() - updatedTime > DRAFT_MAX_AGE_MS) {
    clearStudySessionDraft(scopeId, pack.id);
    return { success: false, reason: "expired" };
  }

  // Pack fingerprint check
  const currentFingerprint = computePackFingerprint(pack);
  if (draft.packFingerprint !== currentFingerprint) {
    return { success: false, reason: "fingerprint_mismatch" };
  }

  return { success: true, draft };
}

/**
 * Saves a study session draft to localStorage.
 * Returns true if saved successfully, false if storage quota exceeded or unavailable.
 */
export function saveStudySessionDraft(draft: StudySessionDraft): boolean {
  const storage = getStorage();
  if (!storage) {
    return false;
  }

  try {
    const key = getDraftStorageKey(draft.scopeId, draft.packId);
    storage.setItem(key, JSON.stringify(draft));
    return true;
  } catch {
    // Local storage quota exceeded or disabled in private browsing
    return false;
  }
}

/**
 * Removes a study session draft from localStorage.
 */
export function clearStudySessionDraft(scopeId: string, packId: string): void {
  const storage = getStorage();
  if (!storage) {
    return;
  }

  try {
    const key = getDraftStorageKey(scopeId, packId);
    storage.removeItem(key);
  } catch {
    // Ignore storage removal errors
  }
}

/**
 * Searches localStorage for any active, uncompleted draft belonging to the scope.
 * Returns the most recently updated draft metadata if one exists.
 */
export function findActiveDraft(
  scopeId: string,
): { packId: string; packTitle: string; updatedAt: string; progress: number } | null {
  const storage = getStorage();
  if (!storage) {
    return null;
  }

  const prefix = `${DRAFT_STORAGE_PREFIX}:${scopeId}:`;
  let latestDraft: { packId: string; packTitle: string; updatedAt: string; progress: number; time: number } | null = null;

  try {
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key || !key.startsWith(prefix)) continue;

      const raw = storage.getItem(key);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw);
        const validated = studySessionDraftSchema.safeParse(parsed);
        if (!validated.success || validated.data.isCompleted) continue;

        const draft = validated.data;
        const time = new Date(draft.updatedAt).getTime();
        if (Number.isNaN(time) || Date.now() - time > DRAFT_MAX_AGE_MS) continue;

        if (!latestDraft || time > latestDraft.time) {
          latestDraft = {
            packId: draft.packId,
            packTitle: draft.packTitle,
            updatedAt: draft.updatedAt,
            progress: draft.currentIndex,
            time,
          };
        }
      } catch {
        // Skip unparseable draft item
      }
    }
  } catch {
    return null;
  }

  if (!latestDraft) return null;
  return {
    packId: latestDraft.packId,
    packTitle: latestDraft.packTitle,
    updatedAt: latestDraft.updatedAt,
    progress: latestDraft.progress,
  };
}

let cachedSnapshot: {
  cacheKey: string;
  data: { packId: string; packTitle: string; progress: number } | null;
} | null = null;

/**
 * Returns a stable reference snapshot of the active draft for use in React's useSyncExternalStore.
 */
export function getActiveDraftSnapshot(
  scopeId: string,
): { packId: string; packTitle: string; progress: number } | null {
  const draft = findActiveDraft(scopeId);
  const cacheKey = draft
    ? `${scopeId}:${draft.packId}:${draft.updatedAt}:${draft.progress}`
    : `${scopeId}:none`;

  if (cachedSnapshot && cachedSnapshot.cacheKey === cacheKey) {
    return cachedSnapshot.data;
  }

  cachedSnapshot = {
    cacheKey,
    data: draft
      ? {
          packId: draft.packId,
          packTitle: draft.packTitle,
          progress: draft.progress,
        }
      : null,
  };

  return cachedSnapshot.data;
}

export async function fetchCloudDraft(packId: string): Promise<StudySessionDraft | null> {
  try {
    const res = await fetch(`/api/study-drafts/${packId}`, { cache: "no-store" });
    if (!res.ok) return null;
    const data = await res.json();
    return data.draft ?? null;
  } catch {
    return null;
  }
}

export async function syncDraftToCloud(
  draft: StudySessionDraft,
  expectedRevision?: number
): Promise<{ success: boolean; conflict?: boolean; cloudRevision?: number; draft?: StudySessionDraft }> {
  try {
    const res = await fetch(`/api/study-drafts/${draft.packId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientAttemptId: draft.clientAttemptId,
        revision: draft.revision ?? 1,
        expectedRevision,
        currentIndex: draft.currentIndex,
        currentAnswer: draft.currentAnswer,
        checked: draft.checked,
        feedback: draft.feedback,
        submittedAnswers: draft.submittedAnswers,
        packFingerprint: draft.packFingerprint,
      }),
    });

    if (res.status === 409) {
      const data = await res.json().catch(() => ({}));
      return { success: false, conflict: true, cloudRevision: data.cloudRevision };
    }

    if (!res.ok) {
      return { success: false };
    }

    const data = await res.json();
    return { success: true, draft: data.draft };
  } catch {
    return { success: false };
  }
}

export async function deleteCloudDraft(packId: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/study-drafts/${packId}`, { method: "DELETE" });
    return res.ok;
  } catch {
    return false;
  }
}

