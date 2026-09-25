export type ApiErrorCode =
  | "AUTH_REQUIRED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "INVALID_REQUEST"
  | "INVALID_SOURCE"
  | "QUOTA_EXCEEDED"
  | "REQUEST_IN_PROGRESS"
  | "ATTEMPT_CONFLICT"
  | "GENERATION_FAILED"
  | "PROVIDER_UNAVAILABLE"
  | "STORAGE_UNAVAILABLE"
  | "RATE_LIMITED"
  | "INTERNAL_ERROR";

export interface ApiErrorResponse {
  error: string;
  code: ApiErrorCode;
  requestId?: string;
}

export function createApiErrorResponse(
  code: ApiErrorCode,
  message: string,
  status: number,
  requestId?: string,
  extra?: Record<string, unknown>
): Response {
  const body: ApiErrorResponse & Record<string, unknown> = {
    error: message,
    code,
    ...(requestId ? { requestId } : {}),
    ...(extra || {}),
  };
  return Response.json(body, { status });
}

export function authRequiredError(message = "Sign in to use account features.", requestId?: string) {
  return createApiErrorResponse("AUTH_REQUIRED", message, 401, requestId);
}

export function invalidRequestError(message: string, requestId?: string) {
  return createApiErrorResponse("INVALID_REQUEST", message, 400, requestId);
}

export function forbiddenError(message = "Permission denied.", requestId?: string) {
  return createApiErrorResponse("FORBIDDEN", message, 403, requestId);
}

export function notFoundError(message = "Resource not found.", requestId?: string) {
  return createApiErrorResponse("NOT_FOUND", message, 404, requestId);
}

export function quotaExceededError(message = "Monthly AI StudyPack allowance reached (15/month).", requestId?: string) {
  return createApiErrorResponse("QUOTA_EXCEEDED", message, 429, requestId);
}

export function providerUnavailableError(message: string, requestId?: string) {
  return createApiErrorResponse("PROVIDER_UNAVAILABLE", message, 503, requestId);
}

export function generationFailedError(message = "Generation failed safely. Your material was not saved; please retry.", requestId?: string) {
  return createApiErrorResponse("GENERATION_FAILED", message, 502, requestId);
}

export function storageUnavailableError(message = "FETCH could not save your data. Please retry.", requestId?: string) {
  return createApiErrorResponse("STORAGE_UNAVAILABLE", message, 503, requestId);
}

export function attemptConflictError(message = "This attempt ID was already used with different answers. Please start a new attempt.", requestId?: string) {
  return createApiErrorResponse("ATTEMPT_CONFLICT", message, 409, requestId);
}

