export interface RetrievedChunk {
  label: string;
  content: string;
  score: number;
}

export interface RetrievalResult {
  chunks: RetrievedChunk[];
  formattedContext: string;
  hasRelevantChunks: boolean;
}

const STOP_WORDS = new Set([
  "a", "an", "the", "and", "or", "but", "if", "because", "as", "what",
  "which", "this", "that", "these", "those", "then", "just", "so", "than",
  "such", "both", "through", "about", "for", "is", "of", "while", "during",
  "to", "from", "in", "out", "on", "off", "again", "further", "then", "once",
  "here", "there", "when", "where", "why", "how", "all", "any", "both",
  "each", "few", "more", "most", "other", "some", "such", "no", "nor", "not",
  "only", "own", "same", "so", "than", "too", "very", "can", "will", "just",
  "don", "should", "now", "are", "was", "were", "been", "being", "have", "has",
  "had", "having", "do", "does", "did", "doing", "would", "could", "tell", "me",
  "explain", "help", "understand", "please", "with", "know", "does", "like"
]);

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
}

export function chunkSourceDocument(sourceText: string): Array<{ label: string; content: string }> {
  if (!sourceText.trim()) return [];

  const rawChunks: Array<{ label: string; content: string }> = [];

  // Check if text is structured with page dividers: e.g. "--- Page 1 ---" or "[Page 1]"
  const pageRegex = /(?:^|\n)(?:---|===)?\s*(?:Page|PAGE)\s*(\d+)\s*(?:---|===)?/g;
  let match: RegExpExecArray | null;
  const pageIndices: Array<{ index: number; pageNumber: string }> = [];

  while ((match = pageRegex.exec(sourceText)) !== null) {
    pageIndices.push({ index: match.index, pageNumber: match[1] });
  }

  if (pageIndices.length > 0) {
    for (let i = 0; i < pageIndices.length; i++) {
      const current = pageIndices[i];
      const nextIndex = i + 1 < pageIndices.length ? pageIndices[i + 1].index : sourceText.length;
      const content = sourceText.slice(current.index, nextIndex).trim();
      if (content.length > 1200) {
        let offset = 0;
        let part = 1;
        while (offset < content.length) {
          const slice = content.slice(offset, offset + 1200).trim();
          if (slice.length > 0) {
            rawChunks.push({
              label: `Page ${current.pageNumber} (Part ${part})`,
              content: slice,
            });
            part++;
          }
          offset += 1200;
        }
      } else if (content.length > 0) {
        rawChunks.push({
          label: `Page ${current.pageNumber}`,
          content,
        });
      }
    }
  } else {
    // Split by Markdown headings or double newlines
    const sections = sourceText.split(/\n\s*\n+/);
    let currentLabel = "Overview";
    let buffer = "";

    for (const section of sections) {
      const trimmed = section.trim();
      if (!trimmed) continue;

      const headingMatch = trimmed.match(/^(?:#{1,4})\s+(.+)$/m);
      if (headingMatch) {
        if (buffer.trim()) {
          rawChunks.push({ label: currentLabel, content: buffer.trim() });
          buffer = "";
        }
        currentLabel = headingMatch[1].slice(0, 40);
      }

      if (trimmed.length > 1200) {
        if (buffer.trim()) {
          rawChunks.push({ label: currentLabel, content: buffer.trim() });
          buffer = "";
        }
        let offset = 0;
        let part = 1;
        while (offset < trimmed.length) {
          const slice = trimmed.slice(offset, offset + 1200).trim();
          if (slice.length > 0) {
            rawChunks.push({
              label: `${currentLabel} (Part ${part})`,
              content: slice,
            });
            part++;
          }
          offset += 1200;
        }
        continue;
      }

      if (buffer.length + trimmed.length > 1200) {
        if (buffer.trim()) {
          rawChunks.push({ label: currentLabel, content: buffer.trim() });
        }
        buffer = trimmed;
      } else {
        buffer = buffer ? `${buffer}\n\n${trimmed}` : trimmed;
      }
    }

    if (buffer.trim()) {
      rawChunks.push({ label: currentLabel, content: buffer.trim() });
    }
  }

  return rawChunks;
}

export function retrieveRelevantChunks(
  sourceText: string,
  userQuery: string,
  options?: { maxChunks?: number; maxTotalChars?: number }
): RetrievalResult {
  const maxChunks = options?.maxChunks ?? 3;
  const maxTotalChars = options?.maxTotalChars ?? 3500;

  if (!sourceText.trim()) {
    return { chunks: [], formattedContext: "", hasRelevantChunks: false };
  }

  const chunks = chunkSourceDocument(sourceText);
  if (chunks.length === 0) {
    return { chunks: [], formattedContext: "", hasRelevantChunks: false };
  }

  const queryTokens = tokenize(userQuery);
  const normalizedQuery = userQuery.toLowerCase().trim();

  const scored = chunks.map((chunk) => {
    let score = 0;
    const chunkLower = chunk.content.toLowerCase();
    const labelLower = chunk.label.toLowerCase();

    // Exact phrase match bonus
    if (normalizedQuery.length > 5 && chunkLower.includes(normalizedQuery)) {
      score += 15;
    }

    // Keyword matching
    for (const token of queryTokens) {
      if (labelLower.includes(token)) {
        score += 5; // heading match
      }
      if (chunkLower.includes(token)) {
        score += 2;
        // Count multiple occurrences up to cap
        const occurrences = (chunkLower.match(new RegExp(`\\b${token}\\b`, "g")) || []).length;
        score += Math.min(occurrences, 4);
      }
    }

    return { ...chunk, score };
  });

  // Sort by score descending
  scored.sort((a, b) => b.score - a.score);

  // If top score is 0 (no keyword overlap), fallback to the first chunks up to budget
  const hasRelevance = scored[0].score > 0;
  const selected: RetrievedChunk[] = [];
  let totalChars = 0;

  for (const item of scored) {
    if (selected.length >= maxChunks) break;
    const remainingBudget = maxTotalChars - totalChars;
    if (remainingBudget <= 0) break;

    let contentToInclude = item.content;
    if (contentToInclude.length > remainingBudget) {
      contentToInclude = contentToInclude.slice(0, remainingBudget).trim();
    }

    if (contentToInclude.length > 0) {
      selected.push({
        label: item.label,
        content: contentToInclude,
        score: item.score,
      });
      totalChars += contentToInclude.length;
    }
  }

  const formattedContext = selected
    .map((c) => `[Source: ${c.label}]\n${c.content}`)
    .join("\n\n");

  return {
    chunks: selected,
    formattedContext,
    hasRelevantChunks: hasRelevance,
  };
}
