import React, { useMemo } from "react";

interface SafeMarkdownProps {
  content: string;
  className?: string;
}

/**
 * Validates and sanitizes a URL to prevent XSS (blocks javascript:, data:, vbscript:, etc.).
 */
function sanitizeUrl(url: string): string | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  try {
    const parsed = new URL(trimmed, "http://localhost");
    if (parsed.protocol === "http:" || parsed.protocol === "https:") {
      return trimmed;
    }
  } catch {
    // If not a parseable URL, reject
    return null;
  }
  return null;
}

/**
 * Parses inline markdown: bold, italics, inline code, sanitized links, escaping raw HTML.
 */
function parseInline(text: string): React.ReactNode[] {
  const elements: React.ReactNode[] = [];
  // Tokenize regex:
  // 1. Links: [text](url)
  // 2. Inline code: `code`
  // 3. Bold: **text**
  // 4. Italic: *text* or _text_
  // 5. HTML tags: <tag> (to escape/strip)
  const tokenRegex = /(`[^`]+`)|(\*\*[^*]+\*\*)|(\*[^*]+\*)|(\[[^\]]+\]\([^)]+\))|(<[^>]+>)/g;

  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokenRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      elements.push(text.slice(lastIndex, match.index));
    }

    const token = match[0];

    if (token.startsWith("`") && token.endsWith("`")) {
      // Inline code
      const code = token.slice(1, -1);
      elements.push(
        <code
          key={match.index}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--surface-subtle)] px-1.5 py-0.5 font-mono text-[0.85em] font-medium text-[var(--fetch-blue-700)]"
        >
          {code}
        </code>
      );
    } else if (token.startsWith("**") && token.endsWith("**")) {
      // Bold
      const boldText = token.slice(2, -2);
      elements.push(
        <strong key={match.index} className="font-bold text-[var(--text-primary)]">
          {boldText}
        </strong>
      );
    } else if (token.startsWith("*") && token.endsWith("*")) {
      // Italic
      const italicText = token.slice(1, -1);
      elements.push(<em key={match.index}>{italicText}</em>);
    } else if (token.startsWith("[") && token.includes("](") && token.endsWith(")")) {
      // Link
      const closeBracket = token.indexOf("]");
      const linkText = token.slice(1, closeBracket);
      const rawUrl = token.slice(closeBracket + 2, -1);
      const safeHref = sanitizeUrl(rawUrl);

      if (safeHref) {
        elements.push(
          <a
            key={match.index}
            href={safeHref}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-[var(--fetch-blue-600)] underline hover:text-[var(--fetch-blue-700)]"
          >
            {linkText}
          </a>
        );
      } else {
        elements.push(linkText);
      }
    } else if (token.startsWith("<") && token.endsWith(">")) {
      // Strip/escape raw HTML tags completely to prevent XSS
      elements.push("");
    }

    lastIndex = match.index + token.length;
  }

  if (lastIndex < text.length) {
    elements.push(text.slice(lastIndex));
  }

  return elements;
}

export function SafeMarkdown({ content, className = "" }: SafeMarkdownProps) {
  const renderedBlocks = useMemo(() => {
    if (!content) return null;

    // Filter out raw decorative clichés like isolated "||" or "//"
    const cleaned = content.replace(/(?:^|\n)\s*(\|\||\/\/)\s*(?:\n|$)/g, "\n\n");

    const lines = cleaned.split(/\r?\n/);
    const blocks: React.ReactNode[] = [];
    let inCodeBlock = false;
    let codeLanguage = "";
    let codeLines: string[] = [];
    let currentList: { type: "ul" | "ol"; items: string[] } | null = null;

    const flushList = () => {
      if (!currentList) return;
      if (currentList.type === "ul") {
        blocks.push(
          <ul
            key={blocks.length}
            className="my-2.5 ml-5 list-disc space-y-1 text-sm text-[var(--text-primary)]"
          >
            {currentList.items.map((item, i) => (
              <li key={i}>{parseInline(item)}</li>
            ))}
          </ul>
        );
      } else {
        blocks.push(
          <ol
            key={blocks.length}
            className="my-2.5 ml-5 list-decimal space-y-1 text-sm text-[var(--text-primary)]"
          >
            {currentList.items.map((item, i) => (
              <li key={i}>{parseInline(item)}</li>
            ))}
          </ol>
        );
      }
      currentList = null;
    };

    const isTableRow = (str: string): boolean => {
      const s = str.trim();
      return s.startsWith("|") && s.endsWith("|") && s.length > 2;
    };

    const isTableDelimiter = (str: string): boolean => {
      const s = str.trim();
      return s.startsWith("|") && s.endsWith("|") && /^\|(?:\s*:?-+:?\s*\|)+$/.test(s);
    };

    const parseCells = (rowStr: string): string[] => {
      const trimmed = rowStr.trim();
      const inner =
        trimmed.startsWith("|") && trimmed.endsWith("|")
          ? trimmed.slice(1, -1)
          : trimmed;
      return inner.split("|").map((c) => c.trim());
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // Code blocks
      if (line.trim().startsWith("```")) {
        if (inCodeBlock) {
          // Close code block
          blocks.push(
            <div
              key={blocks.length}
              className="my-3 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]"
            >
              {codeLanguage && (
                <div className="border-b border-[var(--border-subtle)] bg-black/5 px-3 py-1 text-[11px] font-mono text-[var(--text-secondary)]">
                  {codeLanguage}
                </div>
              )}
              <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-[var(--text-primary)]">
                <code>{codeLines.join("\n")}</code>
              </pre>
            </div>
          );
          inCodeBlock = false;
          codeLines = [];
          codeLanguage = "";
        } else {
          flushList();
          inCodeBlock = true;
          codeLanguage = line.trim().slice(3).trim();
          codeLines = [];
        }
        continue;
      }

      if (inCodeBlock) {
        codeLines.push(line);
        continue;
      }

      // Check for Markdown table block (header + delimiter)
      if (isTableRow(line) && i + 1 < lines.length && isTableDelimiter(lines[i + 1])) {
        flushList();
        const headers = parseCells(line);
        i += 2; // skip header and delimiter row
        const rows: string[][] = [];
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(parseCells(lines[i]));
          i++;
        }
        i--; // step back since for loop will i++

        blocks.push(
          <div
            key={blocks.length}
            className="my-3.5 overflow-x-auto rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-card)]"
          >
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-[var(--border-subtle)] bg-[var(--surface-subtle)]">
                  {headers.map((h, hi) => (
                    <th key={hi} className="px-3.5 py-2.5 font-bold text-[var(--text-primary)]">
                      {parseInline(h)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-subtle)]">
                {rows.map((row, ri) => (
                  <tr key={ri} className="hover:bg-[var(--surface-subtle)]/50 transition-colors">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3.5 py-2 text-[var(--text-primary)] align-top leading-relaxed">
                        {parseInline(cell)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        );
        continue;
      }

      // Check for malformed pseudo-table line: isolated row with pipes
      if (isTableRow(line)) {
        flushList();
        const cells = parseCells(line);
        if (cells.length > 1) {
          blocks.push(
            <div
              key={blocks.length}
              className="my-2 rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)] p-3 text-sm leading-relaxed"
            >
              <strong className="font-bold text-[var(--fetch-blue-700)] block mb-0.5">
                {parseInline(cells[0])}
              </strong>
              <div className="text-[var(--text-primary)]">
                {parseInline(cells.slice(1).join(" — "))}
              </div>
            </div>
          );
        } else if (cells.length === 1 && cells[0]) {
          blocks.push(
            <p key={blocks.length} className="my-1.5 text-sm leading-relaxed text-[var(--text-primary)] break-words">
              {parseInline(cells[0])}
            </p>
          );
        }
        continue;
      }

      // Check unordered list item
      const ulMatch = line.match(/^\s*[-*•]\s+(.+)$/);
      if (ulMatch) {
        if (!currentList || currentList.type !== "ul") {
          flushList();
          currentList = { type: "ul", items: [] };
        }
        currentList.items.push(ulMatch[1]);
        continue;
      }

      // Check ordered list item
      const olMatch = line.match(/^\s*\d+\.\s+(.+)$/);
      if (olMatch) {
        if (!currentList || currentList.type !== "ol") {
          flushList();
          currentList = { type: "ol", items: [] };
        }
        currentList.items.push(olMatch[1]);
        continue;
      }

      // Not a list item
      flushList();

      const trimmed = line.trim();
      if (!trimmed) continue;

      // Headings
      if (trimmed.startsWith("### ")) {
        blocks.push(
          <h4
            key={blocks.length}
            className="mt-4 mb-1 text-sm font-bold text-[var(--text-primary)]"
          >
            {parseInline(trimmed.slice(4))}
          </h4>
        );
      } else if (trimmed.startsWith("## ")) {
        blocks.push(
          <h3
            key={blocks.length}
            className="mt-4 mb-1.5 text-base font-bold text-[var(--text-primary)]"
          >
            {parseInline(trimmed.slice(3))}
          </h3>
        );
      } else if (trimmed.startsWith("# ")) {
        blocks.push(
          <h2
            key={blocks.length}
            className="mt-5 mb-2 font-display text-lg font-bold text-[var(--text-primary)]"
          >
            {parseInline(trimmed.slice(2))}
          </h2>
        );
      } else if (trimmed.startsWith("> ")) {
        blocks.push(
          <blockquote
            key={blocks.length}
            className="my-2.5 border-l-4 border-[var(--fetch-blue-400)] bg-[var(--fetch-blue-50)]/40 py-1.5 pl-3 text-sm italic text-[var(--text-secondary)] rounded-r-lg"
          >
            {parseInline(trimmed.slice(2))}
          </blockquote>
        );
      } else {
        blocks.push(
          <p
            key={blocks.length}
            className="my-1.5 text-sm leading-relaxed text-[var(--text-primary)] break-words"
          >
            {parseInline(line)}
          </p>
        );
      }
    }

    // Handle open code block at end of stream
    if (inCodeBlock && codeLines.length > 0) {
      blocks.push(
        <div
          key={blocks.length}
          className="my-3 overflow-hidden rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-subtle)]"
        >
          <pre className="overflow-x-auto p-3.5 font-mono text-xs leading-relaxed text-[var(--text-primary)]">
            <code>{codeLines.join("\n")}</code>
          </pre>
        </div>
      );
    }

    flushList();
    return blocks;
  }, [content]);

  return <div className={`space-y-1 ${className}`}>{renderedBlocks}</div>;
}
