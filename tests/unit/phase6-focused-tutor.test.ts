// @vitest-environment jsdom
import { describe, expect, it, vi, beforeEach } from "vitest";
import React from "react";
import { render } from "@testing-library/react";
import { retrieveRelevantChunks, chunkSourceDocument } from "@/lib/study/tutor-retrieval";
import { GroqTutorProvider } from "@/lib/ai/groq-tutor";
import { SafeMarkdown } from "@/components/study/safe-markdown";

describe("Phase 6: Focused Tutor & Safe Answer Rendering", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("Tutor Source Chunk Retrieval", () => {
    const sampleMultiPageSource = `
--- Page 1 ---
Photosynthesis is the process by which green plants and certain other organisms transform light energy into chemical energy.
During photosynthesis in green plants, light energy is captured and used to convert water, carbon dioxide, and minerals into oxygen and energy-rich organic compounds.

--- Page 2 ---
Cellular respiration takes place in the mitochondria of eukaryotic cells.
The process consists of three main stages: glycolysis, the citric acid cycle (Krebs cycle), and oxidative phosphorylation via the electron transport chain.
ATP synthase generates the majority of cellular ATP.

--- Page 3 ---
Mitosis and meiosis are types of cell division.
Mitosis results in two identical diploid daughter cells, while meiosis produces four genetically diverse haploid gametes.
Crossing over occurs during prophase I of meiosis.
`;

    it("parses multi-page documents into labeled chunks", () => {
      const chunks = chunkSourceDocument(sampleMultiPageSource);
      expect(chunks).toHaveLength(3);
      expect(chunks[0].label).toBe("Page 1");
      expect(chunks[0].content).toContain("Photosynthesis");
      expect(chunks[1].label).toBe("Page 2");
      expect(chunks[1].content).toContain("Cellular respiration");
      expect(chunks[2].label).toBe("Page 3");
      expect(chunks[2].content).toContain("Mitosis and meiosis");
    });

    it("retrieves the most relevant page chunk for a targeted question", () => {
      const result = retrieveRelevantChunks(
        sampleMultiPageSource,
        "Where does cellular respiration take place and how is ATP produced?"
      );

      expect(result.hasRelevantChunks).toBe(true);
      expect(result.chunks.length).toBeGreaterThan(0);
      expect(result.chunks[0].label).toBe("Page 2");
      expect(result.formattedContext).toContain("[Source: Page 2]");
      expect(result.formattedContext).toContain("mitochondria");
    });

    it("enforces maximum total characters budget on retrieved context", () => {
      const result = retrieveRelevantChunks(sampleMultiPageSource, "cells energy plants", {
        maxChunks: 2,
        maxTotalChars: 300,
      });

      expect(result.chunks.length).toBeLessThanOrEqual(2);
      expect(result.formattedContext.length).toBeLessThanOrEqual(500);
    });

    it("handles queries about topics not in the source gracefully", () => {
      const result = retrieveRelevantChunks(
        sampleMultiPageSource,
        "What is quantum electrodynamics?"
      );
      // Even if no keyword matches, fallback chunks are provided but hasRelevantChunks is false
      expect(result.hasRelevantChunks).toBe(false);
    });
  });

  describe("GroqTutorProvider Bounded Context & Instructions", () => {
    it("bounds conversation history to latest 12 messages (6 turns)", async () => {
      const longHistory = Array.from({ length: 20 }, (_, i) => ({
        role: (i % 2 === 0 ? "user" : "assistant") as "user" | "assistant",
        content: `Message ${i + 1}`,
      }));

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Reply"}}]}\n\n')
            );
            controller.close();
          },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GroqTutorProvider({ apiKey: "gsk_test123" });
      const stream = provider.streamReply({
        message: "Current question",
        history: longHistory,
      });

      for await (const chunk of stream) {
        void chunk;
      }

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const messages = callBody.messages;

      // History should only contain the last 12 messages from longHistory
      const historyInCall = messages.filter((m: { role: string; content: string }) =>
        m.content.startsWith("Message ")
      );
      expect(historyInCall).toHaveLength(12);
      expect(historyInCall[0].content).toBe("Message 9");
      expect(historyInCall[11].content).toBe("Message 20");
    });

    it("includes grounding requirement for missing source topics in prompt", async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        body: new ReadableStream<Uint8Array>({
          start(controller) {
            controller.enqueue(
              new TextEncoder().encode('data: {"choices":[{"delta":{"content":"Ok"}}]}\n\n')
            );
            controller.close();
          },
        }),
      });
      vi.stubGlobal("fetch", mockFetch);

      const provider = new GroqTutorProvider({ apiKey: "gsk_test123" });
      const stream = provider.streamReply({
        message: "What is dark matter?",
        source: "--- Page 1 ---\nCell biology notes.",
      });

      for await (const chunk of stream) {
        void chunk;
      }

      expect(mockFetch).toHaveBeenCalled();
      const callBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      const sourceUserMsg = callBody.messages.find(
        (m: { role: string; content: string }) =>
          m.role === "user" && m.content.includes("<study_material>")
      );
      expect(sourceUserMsg).toBeDefined();
      expect(sourceUserMsg.content).toContain("The provided study material does not mention");
    });
  });

  describe("SafeMarkdown Rendering & XSS Security", () => {
    it("strips malicious script tags and inline event handlers", () => {
      const maliciousMarkdown =
        "Here is an answer <script>alert('xss')</script> with <img src=x onerror=alert(1)> and regular text.";

      const { container } = render(React.createElement(SafeMarkdown, { content: maliciousMarkdown }));

      expect(container.querySelector("script")).toBeNull();
      expect(container.querySelector("img")).toBeNull();
      expect(container.textContent).toContain("Here is an answer");
      expect(container.textContent).toContain("and regular text.");
    });

    it("sanitizes javascript: links while allowing safe https: links", () => {
      const linkMarkdown =
        "Check [malicious link](javascript:alert(1)) and [safe reference](https://example.com/study).";

      const { container } = render(React.createElement(SafeMarkdown, { content: linkMarkdown }));

      const links = container.querySelectorAll("a");
      expect(links).toHaveLength(1);
      expect(links[0].getAttribute("href")).toBe("https://example.com/study");
      expect(links[0].textContent).toBe("safe reference");
      expect(container.textContent).toContain("malicious link");
    });

    it("renders code blocks, lists, headings, and bold text correctly", () => {
      const richMarkdown = `
# Main Concept
Here is **important** terminology:
- Point 1
- Point 2

\`\`\`typescript
const a = 1;
\`\`\`
`;

      const { container } = render(React.createElement(SafeMarkdown, { content: richMarkdown }));

      expect(container.querySelector("h2")).not.toBeNull();
      expect(container.querySelector("strong")?.textContent).toBe("important");
      expect(container.querySelectorAll("li")).toHaveLength(2);
      expect(container.querySelector("pre")).not.toBeNull();
      expect(container.querySelector("code")?.textContent).toContain("const a = 1;");
    });

    it("strips raw decorative noise like isolated || or //", () => {
      const noisyMarkdown = "Paragraph 1\n\n||\n\nParagraph 2\n\n//\n\nParagraph 3";

      const { container } = render(React.createElement(SafeMarkdown, { content: noisyMarkdown }));

      expect(container.textContent).not.toContain("||");
      expect(container.textContent).not.toContain("//");
      expect(container.textContent).toContain("Paragraph 1");
      expect(container.textContent).toContain("Paragraph 2");
      expect(container.textContent).toContain("Paragraph 3");
    });

    it("renders valid markdown tables as semantic HTML tables", () => {
      const tableMarkdown = `
| Section | Key Points |
|---------|------------|
| Intro   | First point |
| Outro   | Last point  |
`;
      const { container } = render(React.createElement(SafeMarkdown, { content: tableMarkdown }));

      const table = container.querySelector("table");
      expect(table).not.toBeNull();
      const headers = container.querySelectorAll("th");
      expect(headers).toHaveLength(2);
      expect(headers[0].textContent).toBe("Section");
      expect(headers[1].textContent).toBe("Key Points");
      const cells = container.querySelectorAll("td");
      expect(cells).toHaveLength(4);
      expect(cells[0].textContent).toBe("Intro");
      expect(cells[1].textContent).toBe("First point");
    });

    it("converts malformed pseudo-tables into structured card elements without naked pipes", () => {
      const pseudoTable = "| Concept | Detailed explanation without delimiter row |";
      const { container } = render(React.createElement(SafeMarkdown, { content: pseudoTable }));

      expect(container.querySelector("table")).toBeNull();
      expect(container.querySelector("strong")?.textContent).toBe("Concept");
      expect(container.textContent).toContain("Detailed explanation without delimiter row");
      expect(container.textContent).not.toContain("|");
    });
  });
});
