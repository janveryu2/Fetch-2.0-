import type { StudyAttempt, StudyPack } from "./demo-types";
import { findActiveDraft } from "./study-session-draft";

export type DestinationType = "draft" | "recently_studied" | "recently_created" | "empty";

export interface StudyDestination {
  href: string;
  label: "Resume studying" | "Start studying";
  type: DestinationType;
  packId?: string;
  packTitle?: string;
}

/**
 * Resolves the direct destination for the primary study shortcut:
 * 1. Resumable draft: /app/study/[packId] (Label: "Resume studying")
 * 2. Most recently studied existing pack: /app/study/[packId] (Label: "Start studying")
 * 3. Most recently created pack: /app/study/[packId] (Label: "Start studying")
 * 4. Empty fallback: /app/home#add-material (Label: "Start studying")
 */
export function resolveStudyDestination(params: {
  scopeId: string;
  packs: StudyPack[];
  attempts: StudyAttempt[];
  activeDraft?: { packId: string; packTitle: string; progress: number } | null;
}): StudyDestination {
  const { scopeId, packs, attempts, activeDraft } = params;

  // 1. Resumable draft
  const draft = activeDraft !== undefined ? activeDraft : findActiveDraft(scopeId);
  if (draft) {
    const matchingPack = packs.find((p) => p.id === draft.packId);
    return {
      href: `/app/study/${draft.packId}`,
      label: "Resume studying",
      type: "draft",
      packId: draft.packId,
      packTitle: matchingPack?.title ?? draft.packTitle,
    };
  }

  // 2. Most recently studied existing pack
  if (attempts.length > 0 && packs.length > 0) {
    const sortedAttempts = [...attempts].sort(
      (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime(),
    );
    const latestAttempt = sortedAttempts.find((a) =>
      packs.some((p) => p.id === a.packId),
    );
    if (latestAttempt) {
      const pack = packs.find((p) => p.id === latestAttempt.packId);
      return {
        href: `/app/study/${latestAttempt.packId}`,
        label: "Start studying",
        type: "recently_studied",
        packId: latestAttempt.packId,
        packTitle: pack?.title ?? latestAttempt.packTitle,
      };
    }
  }

  // 3. Most recently created pack
  if (packs.length > 0) {
    const latestPack = packs[0];
    return {
      href: `/app/study/${latestPack.id}`,
      label: "Start studying",
      type: "recently_created",
      packId: latestPack.id,
      packTitle: latestPack.title,
    };
  }

  // 4. Empty fallback: Home material intake
  return {
    href: "/app/home#add-material",
    label: "Start studying",
    type: "empty",
  };
}
