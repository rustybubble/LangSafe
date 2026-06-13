// ─── Types ───────────────────────────────────────────────────────────────────

export interface CitationReference {
  /** 1-indexed citation number matching [N] in text */
  index: number;
  /** Resolved URL from the citations array */
  url: string;
  /** The sentence(s) containing this citation */
  claim_text: string;
}

export interface ParsedCitationText {
  /** Prose with [N] markers stripped */
  cleaned_text: string;
  /** Resolved citation references */
  citation_references: CitationReference[];
}

// ─── Sentence extraction ─────────────────────────────────────────────────────

/**
 * Extract the sentence containing a citation marker.
 * Splits on sentence boundaries (. ! ?) and returns the sentence that
 * contains the marker position. Falls back to ±100 chars if no sentence
 * boundary is found.
 */
function extractSentence(text: string, markerStart: number): string {
  // Find sentence boundaries
  const sentenceBreaks = /[.!?]\s+/g;
  let sentenceStart = 0;
  let sentenceEnd = text.length;
  let match: RegExpExecArray | null;

  while ((match = sentenceBreaks.exec(text)) !== null) {
    const breakEnd = match.index + match[0].length;
    if (breakEnd <= markerStart) {
      sentenceStart = breakEnd;
    } else if (match.index >= markerStart) {
      sentenceEnd = match.index + 1; // include the punctuation
      break;
    }
  }

  const sentence = text.slice(sentenceStart, sentenceEnd).trim();

  // If the "sentence" is too long (no boundaries found), truncate around marker
  if (sentence.length > 300) {
    const contextStart = Math.max(0, markerStart - 100);
    const contextEnd = Math.min(text.length, markerStart + 100);
    return text.slice(contextStart, contextEnd).trim();
  }

  return sentence;
}

// ─── Main parser ─────────────────────────────────────────────────────────────

/**
 * Parse model prose to extract and resolve [N] citation references.
 *
 * @param text    - Raw prose from a model/search response (may contain [1], [2], etc.)
 * @param citations - URL array from the model/search response (0-indexed)
 * @returns Cleaned text with [N] stripped, plus resolved citation references
 */
export function parseCitations(
  text: string,
  citations: string[]
): ParsedCitationText {
  if (!text || citations.length === 0) {
    return {
      cleaned_text: text || "",
      citation_references: [],
    };
  }

  const refs: CitationReference[] = [];
  const seenUrls = new Map<string, CitationReference>();

  // Find all [N] references (handles [1], [12], consecutive [1][2], etc.)
  const refPattern = /\[(\d+)\]/g;
  let match: RegExpExecArray | null;

  while ((match = refPattern.exec(text)) !== null) {
    const citationNumber = parseInt(match[1], 10);
    const citationIndex = citationNumber - 1; // 1-indexed → 0-indexed

    // Skip out-of-range references
    if (citationIndex < 0 || citationIndex >= citations.length) {
      continue;
    }

    const url = citations[citationIndex];
    const sentence = extractSentence(text, match.index);

    // Strip [N] markers from the claim text itself
    const cleanSentence = sentence.replace(/\[\d+\]/g, "").replace(/\s{2,}/g, " ").trim();

    if (!cleanSentence) continue;

    // Merge if same URL cited multiple times
    const existing = seenUrls.get(url);
    if (existing) {
      // Append new claim if it's a different sentence
      if (!existing.claim_text.includes(cleanSentence)) {
        existing.claim_text += ` ${cleanSentence}`;
      }
    } else {
      const ref: CitationReference = {
        index: citationNumber,
        url,
        claim_text: cleanSentence,
      };
      seenUrls.set(url, ref);
      refs.push(ref);
    }
  }

  // Strip all [N] markers from the text
  const cleaned = text
    .replace(/\[\d+\]/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return {
    cleaned_text: cleaned,
    citation_references: refs,
  };
}
