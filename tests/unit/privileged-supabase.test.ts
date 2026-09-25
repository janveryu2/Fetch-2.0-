import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

// Mock server-only so Vitest in Node can import the file
vi.mock("server-only", () => ({}));

import {
  getPrivilegedSupabaseClient,
  isPrivilegedSupabaseConfigured,
  persistStudyPackServer,
} from "@/lib/server/privileged-supabase";

describe("Privileged Supabase Boundary", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("reports unconfigured when SUPABASE_SERVICE_ROLE_KEY is missing", () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    expect(isPrivilegedSupabaseConfigured()).toBe(false);
    expect(getPrivilegedSupabaseClient()).toBeNull();
  });

  it("reports configured when SUPABASE_SERVICE_ROLE_KEY and URL exist", () => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key-12345678901234567890";
    expect(isPrivilegedSupabaseConfigured()).toBe(true);
    expect(getPrivilegedSupabaseClient()).not.toBeNull();
  });

  it("returns error when no client is available for persistence", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const result = await persistStudyPackServer({
      ownerId: "user-1",
      title: "Title",
      sourceType: "text",
      sourceLabel: "Label",
      sourceContent: "Content",
      contentHash: "hash",
      questions: [],
    });
    expect(result.data).toBeNull();
    expect(result.error?.message).toContain("No database client available");
  });

  it("persists using fallback client when privileged client is not configured", async () => {
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const mockRpc = vi.fn().mockResolvedValue({
      data: {
        id: "pack-123",
        questions: [{ id: "q-1", prompt: "test" }],
      },
      error: null,
    });

    const fallbackClient = {
      rpc: mockRpc,
    } as unknown as Parameters<typeof persistStudyPackServer>[0]["fallbackClient"];

    const result = await persistStudyPackServer({
      ownerId: "user-1",
      title: "Biology",
      sourceType: "text",
      sourceLabel: "Pasted text",
      sourceContent: "Content",
      contentHash: "hash-xyz",
      questions: [{ id: "q-1", type: "multiple_choice", prompt: "test", answer: "ans", explanation: "exp" }],
      fallbackClient,
    });

    expect(mockRpc).toHaveBeenCalledWith("create_study_pack", expect.objectContaining({
      p_title: "Biology",
      p_source_type: "text",
      p_content_hash: "hash-xyz",
      p_owner_id: "user-1",
    }));
    expect(result.error).toBeNull();
    expect(result.data?.id).toBe("pack-123");
  });
});
