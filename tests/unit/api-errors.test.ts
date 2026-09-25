import { describe, expect, it } from "vitest";
import {
  createApiErrorResponse,
  authRequiredError,
  invalidRequestError,
  forbiddenError,
  notFoundError,
  quotaExceededError,
  providerUnavailableError,
  generationFailedError,
  storageUnavailableError,
} from "@/lib/api-errors";

describe("API Error Responses", () => {
  it("formats standard error responses with error, code, and status", async () => {
    const res = createApiErrorResponse("AUTH_REQUIRED", "Please log in.", 401, "req-123");
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body).toEqual({
      error: "Please log in.",
      code: "AUTH_REQUIRED",
      requestId: "req-123",
    });
  });

  it("handles authRequiredError shorthand", async () => {
    const res = authRequiredError();
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("AUTH_REQUIRED");
    expect(body.error).toContain("Sign in");
  });

  it("handles invalidRequestError shorthand", async () => {
    const res = invalidRequestError("Bad input");
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID_REQUEST");
    expect(body.error).toBe("Bad input");
  });

  it("handles forbiddenError shorthand", async () => {
    const res = forbiddenError();
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("handles notFoundError shorthand", async () => {
    const res = notFoundError();
    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.code).toBe("NOT_FOUND");
  });

  it("handles quotaExceededError shorthand", async () => {
    const res = quotaExceededError();
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.code).toBe("QUOTA_EXCEEDED");
  });

  it("handles providerUnavailableError shorthand", async () => {
    const res = providerUnavailableError("AI down");
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("PROVIDER_UNAVAILABLE");
  });

  it("handles generationFailedError shorthand", async () => {
    const res = generationFailedError();
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.code).toBe("GENERATION_FAILED");
  });

  it("handles storageUnavailableError shorthand", async () => {
    const res = storageUnavailableError();
    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.code).toBe("STORAGE_UNAVAILABLE");
  });
});
