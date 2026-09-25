import { describe, expect, it, vi, beforeEach } from "vitest";
import { GroqTutorProvider } from "@/lib/ai/groq-tutor";

describe("GroqTutorProvider", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("checks configuration correctly", () => {
    const unconfigured = new GroqTutorProvider({ apiKey: "" });
    expect(unconfigured.isConfigured()).toBe(false);

    const configured = new GroqTutorProvider({ apiKey: "gsk_test123" });
    expect(configured.isConfigured()).toBe(true);
  });

  it("throws if streaming without an API key", async () => {
    const provider = new GroqTutorProvider({ apiKey: "" });
    const generator = provider.streamReply({ message: "Hello tutor" });
    await expect(generator.next()).rejects.toThrow("GROQ_API_KEY is not configured.");
  });

  it("streams deltas from Groq SSE response", async () => {
    const sseChunks = [
      'data: {"choices":[{"delta":{"content":"Hello! "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"How can I "}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"help you learn today?"}}]}\n\n',
      "data: [DONE]\n\n",
    ];

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const chunk of sseChunks) {
          controller.enqueue(encoder.encode(chunk));
        }
        controller.close();
      },
    });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      body: stream,
    });
    vi.stubGlobal("fetch", mockFetch);

    const provider = new GroqTutorProvider({
      apiKey: "gsk_test123",
      model: "openai/gpt-oss-120b",
    });

    const collected: string[] = [];
    for await (const delta of provider.streamReply({
      message: "Explain photosynthesis",
      source: "Photosynthesis converts light into energy.",
    })) {
      collected.push(delta);
    }

    expect(collected.join("")).toBe("Hello! How can I help you learn today?");
    expect(mockFetch).toHaveBeenCalledWith(
      "https://api.groq.com/openai/v1/chat/completions",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer gsk_test123",
        }),
      })
    );
  });
});
