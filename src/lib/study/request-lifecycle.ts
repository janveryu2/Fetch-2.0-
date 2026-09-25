/**
 * Request ID lifecycle management for StudyPack generation.
 *
 * Each request ID represents ONE logical generation payload fingerprint.
 * Retrying the same payload reuses the request ID to preserve backend idempotency.
 * Materially changing the payload (mode, source text, PDF docId, title, count)
 * generates a fresh UUID to prevent 409 REQUEST_CONFLICT errors.
 */

export interface RequestState {
  requestId: string;
  fingerprint: string;
}

export type GenerationPayloadParams =
  | {
      mode: "paste";
      title: string;
      source: string;
      count: number;
    }
  | {
      mode: "pdf";
      docId: string;
      title: string;
      count: number;
    };

export function computePayloadFingerprint(params: GenerationPayloadParams): string {
  if (params.mode === "paste") {
    return JSON.stringify({
      mode: "paste",
      title: params.title.trim(),
      source: params.source.trim(),
      count: params.count,
    });
  }

  return JSON.stringify({
    mode: "pdf",
    docId: params.docId.trim(),
    title: params.title.trim(),
    count: params.count,
  });
}

export function resolveRequestId(
  currentState: RequestState,
  newFingerprint: string
): { requestId: string; nextState: RequestState; isNew: boolean } {
  if (currentState.fingerprint && currentState.fingerprint === newFingerprint) {
    return {
      requestId: currentState.requestId,
      nextState: currentState,
      isNew: false,
    };
  }

  const nextId = crypto.randomUUID();
  return {
    requestId: nextId,
    nextState: {
      requestId: nextId,
      fingerprint: newFingerprint,
    },
    isNew: true,
  };
}

export function createInitialRequestState(): RequestState {
  return {
    requestId: crypto.randomUUID(),
    fingerprint: "",
  };
}

export function rotateRequestState(): RequestState {
  return {
    requestId: crypto.randomUUID(),
    fingerprint: "",
  };
}
