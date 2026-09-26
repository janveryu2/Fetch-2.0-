/**
 * Flashcard answer normalization and grading algorithm
 * Follows contract B4:
 * - Unicode NFKC normalization
 * - Case-fold / lowercase
 * - Trim
 * - Collapsed whitespace
 * - Conservative edge punctuation removal (quotes, trailing periods/question marks)
 * - Preserves meaningful internal punctuation, units, accents, and numbers
 */

export function normalizeFlashcardAnswer(text: string): string {
  if (!text) return "";

  return text
    // 1. Unicode NFKC normalization
    .normalize("NFKC")
    // 2. Normalize smart quotes, hyphens, and whitespace characters
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u00A0\u1680\u2000-\u200A\u2028\u2029\u202F\u205F\u3000]/g, " ")
    .replace(/[“”„‟]/g, '"')
    .replace(/[‘’‚‛`]/g, "'")
    .replace(/[—–−]/g, "-")
    // 3. Trim and collapse internal whitespace
    .trim()
    .replace(/\s+/g, " ")
    // 4. Lowercase
    .toLowerCase()
    // 5. Strip surrounding quote marks
    .replace(/^["']+|["']+$/g, "")
    // 6. Strip trailing sentence punctuation (. ? ! ;)
    .replace(/[.?!;:]+$/, "")
    .trim();
}

export interface FlashcardGradeResult {
  isCorrect: boolean;
  normalizedSubmitted: string;
  normalizedExpected: string;
  matchedAnswer?: string;
}

export function gradeFlashcardAnswer(
  submitted: string,
  canonicalBack: string,
  aliases: string[] = []
): FlashcardGradeResult {
  const normSubmitted = normalizeFlashcardAnswer(submitted);
  const normCanonical = normalizeFlashcardAnswer(canonicalBack);

  if (!normSubmitted) {
    return {
      isCorrect: false,
      normalizedSubmitted: "",
      normalizedExpected: normCanonical,
    };
  }

  // Check against canonical back
  if (normSubmitted === normCanonical) {
    return {
      isCorrect: true,
      normalizedSubmitted: normSubmitted,
      normalizedExpected: normCanonical,
      matchedAnswer: canonicalBack,
    };
  }

  // Check against all authorized aliases
  for (const alias of aliases) {
    const normAlias = normalizeFlashcardAnswer(alias);
    if (normSubmitted === normAlias) {
      return {
        isCorrect: true,
        normalizedSubmitted: normSubmitted,
        normalizedExpected: normCanonical,
        matchedAnswer: alias,
      };
    }
  }

  return {
    isCorrect: false,
    normalizedSubmitted: normSubmitted,
    normalizedExpected: normCanonical,
  };
}
