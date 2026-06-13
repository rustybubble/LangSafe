import { getErrorMessage } from "../utils/errors";
import * as cheerio from "cheerio";
import { PDFParse } from "pdf-parse";
import { z } from "zod";
import { fetchViaProxy, brightDataConfigured } from "./brightdata";
import { brightdataScrapeMarkdown, brightDataMCPConfigured } from "../apis/brightdata-mcp";
import { getStagehandModelConfig } from "../apis/stagehand-model";
import { browse } from "../elastic";
import { crawlGlottolog } from "./glottolog";
import { crawlELP } from "./elp";
import { crawlWikipediaGeneric } from "./wikipedia-generic";
import { crawlELAR } from "./elar";
import { crawlTalkingDictionary } from "./talking-dictionary";
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ImageMediaType = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

export type ScanQuality = "clean" | "degraded" | "unknown";

export interface VisualContent {
  /** Raw PDF bytes as base64 for model-capable extraction paths */
  pdf_base64?: string;
  /** Individual images (from HTML or future PDF page renders) */
  images?: {
    data: string;
    media_type: ImageMediaType;
    source_label?: string;
  }[];
  /** True when text content is unreliable (scanned PDF, image-only source) */
  is_scan: boolean;
  /** Quality assessment for smart model selection */
  scan_quality?: ScanQuality;
}

export type CrawlMethod = "cheerio" | "web_unlocker" | "stagehand";

export interface CrawlResponse {
  content: string;
  visual_content?: VisualContent;
  metadata: {
    title: string;
    type: string;
    language: string;
    entries_hint?: number;
    audio_urls?: string[];
    video_id?: string;
    word_clips?: Record<string, string>;
    crawl_method?: CrawlMethod;
    brightdata_unlocked?: boolean;
    crawl_duration_ms?: number;
    content_length_bytes?: number;
    // Stagehand observability
    crawl_strategy?: PageStrategy;
    crawl_pages?: number;
    browserbase_url?: string;
    observe_findings?: string[];
  };
}

export interface CrawlError {
  error: "access_denied" | "timeout" | "parse_error";
  message: string;
}

export type CrawlOutcome = CrawlResponse | CrawlError;

export type ExtractionType =
  | "dictionary"
  | "article"
  | "video"
  | "academic"
  | "wiki"
  | "generic";

export function isCrawlError(result: CrawlOutcome): result is CrawlError {
  return "error" in result;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const CHEERIO_TIMEOUT_MS = 5_000;
const STAGEHAND_TIMEOUT_MS = 25_000;
const MIN_CONTENT_LENGTH = 200;

// Source types where JS rendering is likely needed for meaningful content
const BROWSER_FIRST_TYPES: ExtractionType[] = ["dictionary"];

const USER_AGENT =
  "LangSafe/1.0 (endangered language preservation research)";

const PDFJS_TEXT_MIN_CHARS = 500; // pdfjs-dist text must be this long to trust over vision

/**
 * Attempt better text extraction from a PDF buffer using pdfjs-dist directly.
 * pdf-parse bundles an older pdfjs version that sometimes fails on PDFs with
 * valid text layers. This function tries the latest pdfjs-dist as a second chance
 * before falling back to the expensive Vision API path.
 */
async function extractPdfTextViaPdfjs(buffer: Buffer): Promise<string | null> {
  try {
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;
    const pages: string[] = [];
    const pageCount = Math.min(doc.numPages, 30); // Cap at 30 pages

    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = (textContent.items as Array<{ str: string }>)
        .map((item) => item.str)
        .join(" ");
      pages.push(pageText);
      page.cleanup();
    }

    doc.destroy();

    const fullText = pages.join("\n\n").replace(/\s+/g, " ").trim();
    if (fullText.length >= PDFJS_TEXT_MIN_CHARS) {
      console.log(`[dispatch] pdfjs-dist recovered ${fullText.length} chars from PDF`);
      return fullText;
    }

    if (fullText.length > 0) {
      console.log(`[dispatch] pdfjs-dist found only ${fullText.length} chars (below ${PDFJS_TEXT_MIN_CHARS} threshold) — treating as scanned`);
    }
  } catch (err) {
    console.warn(`[dispatch] pdfjs-dist text extraction failed: ${getErrorMessage(err)}`);
  }

  return null;
}

/**
 * Assess scan quality to decide if Haiku can handle it or Sonnet is needed.
 * Conservative: biased toward "unknown" (→ Sonnet) when uncertain.
 */
function assessScanQuality(
  extractedText: string,
  pdfSizeBytes: number,
  sourceType: string
): ScanQuality {
  const textLen = extractedText.length;
  const pdfSizeKb = pdfSizeBytes / 1024;

  // Ratio of recognizable chars (letters, digits, punctuation, spaces) vs total
  const nonWs = extractedText.replace(/\s/g, "");
  const clean = nonWs.replace(/[^a-zA-Z0-9.,;:!?()\-'"]/g, "").length;
  const ratio = nonWs.length > 0 ? clean / nonWs.length : 0;

  // Truly unreadable: very little text or mostly garbled
  if (textLen < 50 || ratio < 0.4) return "degraded";

  // Near-threshold text layer with high quality → clean printed scan
  if (textLen >= 200 && ratio > 0.8) return "clean";

  // Small PDFs with decent text → likely vector or clean scan
  if (pdfSizeKb < 500 && textLen >= 100 && ratio > 0.7) return "clean";

  // Academic/wiki sources tend to have high-quality scans
  if ((sourceType === "academic" || sourceType === "wiki") && textLen >= 150 && ratio > 0.75) return "clean";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Domain classifier — BrightData-first for hard sites, Cheerio-first for easy
// ---------------------------------------------------------------------------

type CrawlTier = "brightdata_first" | "cheerio_first";

const BRIGHTDATA_PREFERRED_PATTERNS: RegExp[] = [
  /\.edu[./]?/i,
  /\.ac\.[a-z]{2}/i,         // .ac.uk, .ac.kr, .ac.jp
  /\.go\.[a-z]{2}/i,         // government sites (.go.kr, .go.jp)
  /\.gov\.[a-z]{2}/i,        // government sites (.gov.au)
  /\.or\.[a-z]{2}/i,         // organizations (.or.kr, .or.jp)
  /jstor\.org/i,
  /sciencedirect\.com/i,
  /springer\.com/i,
  /researchgate\.net/i,
  /academia\.edu/i,
  /namu\.wiki/i,              // Korean wiki — rate-limited
  /forvo\.com/i,              // pronunciation — heavy anti-bot
  /glosbe\.com/i,             // dictionary — sometimes CAPTCHA
];

const CHEERIO_PREFERRED_PATTERNS: RegExp[] = [
  /wikipedia\.org/i,
  /wiktionary\.org/i,
  /wikimedia\.org/i,
  /github\.com/i,
  /github\.io/i,
  /glottolog\.org/i,
  /endangeredlanguages\.com/i,
];

function classifyDomain(url: string): CrawlTier {
  if (CHEERIO_PREFERRED_PATTERNS.some((p) => p.test(url))) return "cheerio_first";
  if (BRIGHTDATA_PREFERRED_PATTERNS.some((p) => p.test(url))) return "brightdata_first";
  return "cheerio_first"; // default: try cheap first
}

// ---------------------------------------------------------------------------
// URL Router
// ---------------------------------------------------------------------------

interface CrawlerRoute {
  pattern: RegExp;
  name: string;
  handler: (url: string) => Promise<CrawlResponse>;
}

const ROUTES: CrawlerRoute[] = [
  // --- Universal linguistic resource crawlers ---
  {
    pattern: /glottolog\.org/i,
    name: "glottolog",
    handler: crawlGlottolog,
  },
  {
    pattern: /endangeredlanguages\.com/i,
    name: "elp",
    handler: crawlELP,
  },
  {
    pattern: /elar\.soas\.ac\.uk/i,
    name: "elar",
    handler: crawlELAR,
  },
  {
    pattern: /talkingdictionary/i,
    name: "talking-dictionary",
    handler: crawlTalkingDictionary,
  },
  // --- Site-specific crawlers ---
  {
    // UH Mānoa hosts several endangered language dictionaries
    pattern: /hawaii\.edu/i,
    name: "uh-dictionary",
    handler: crawlUHDictionaryLite,
  },
  {
    pattern: /wikipedia\.org/i,
    name: "wikipedia",
    handler: crawlWikipediaGeneric,
  },
  {
    pattern: /youtube\.com|youtu\.be/i,
    name: "youtube",
    handler: crawlYouTubeLite,
  },
  {
    pattern: /namu\.wiki/i,
    name: "namu-wiki",
    handler: crawlNamuWiki,
  },
];

// ---------------------------------------------------------------------------
// In-memory crawl cache (TTL: 24 hours, resets on server restart)
// ---------------------------------------------------------------------------

interface CrawlCacheEntry {
  result: CrawlResponse;
  timestamp: number;
}

const CRAWL_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const crawlCache = new Map<string, CrawlCacheEntry>();

function getCachedCrawl(url: string): CrawlResponse | undefined {
  const entry = crawlCache.get(url);
  if (!entry) return undefined;

  if (Date.now() - entry.timestamp > CRAWL_CACHE_TTL_MS) {
    crawlCache.delete(url);
    return undefined;
  }

  return entry.result;
}

function setCachedCrawl(url: string, result: CrawlResponse): void {
  // Strip visual_content from cache — too large to hold in memory
  const { visual_content: _, ...cacheable } = result;
  crawlCache.set(url, { result: cacheable, timestamp: Date.now() });
}

// ---------------------------------------------------------------------------
// Main Dispatch
// ---------------------------------------------------------------------------

export interface CrawlLanguageContext {
  language_code?: string;
  language_name?: string;
  contact_languages?: string[];
  countries?: string[];
}

export async function dispatchCrawl(
  url: string,
  extractionType: ExtractionType,
  languageContext?: CrawlLanguageContext
): Promise<CrawlOutcome> {
  // Check cache first
  const cached = getCachedCrawl(url);
  if (cached) {
    console.log(`[dispatch] Cache hit for ${url}`);
    return cached;
  }

  const route = ROUTES.find((r) => r.pattern.test(url));

  const dispatchStartMs = Date.now();

  // Try site-specific handler first
  if (route) {
    try {
      // YouTube handler needs language context for the ML transcription pipeline
      const result = route.name === "youtube"
        ? await crawlYouTubeLite(url, languageContext)
        : await route.handler(url);
      // Video metadata (oEmbed) is inherently short — skip length check
      if (result.content.length >= MIN_CONTENT_LENGTH || result.metadata.type === "video") {
        result.metadata.crawl_method = "cheerio";
        result.metadata.crawl_duration_ms = Date.now() - dispatchStartMs;
        setCachedCrawl(url, result);
        return result;
      }
      console.warn(
        `[dispatch] ${route.name} returned only ${result.content.length} chars for ${url}, trying generic...`
      );
    } catch (err) {
      console.warn(
        `[dispatch] ${route.name} handler failed for ${url}: ${getErrorMessage(err)}, trying generic...`
      );
    }
  }

  // Generic path (or fallback from failed site-specific)
  try {
    const result = await crawlGeneric(url, extractionType, languageContext);
    if (!isCrawlError(result)) {
      setCachedCrawl(url, result);
    }
    return result;
  } catch (err) {
    return {
      error: "access_denied",
      message: `Site not accessible: ${getErrorMessage(err)}`,
    };
  }
}

// ---------------------------------------------------------------------------
// Site-Specific Handlers
// ---------------------------------------------------------------------------

async function crawlWikipediaLite(url: string): Promise<CrawlResponse> {
  const res = await fetchWithTimeout(url, CHEERIO_TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove noise
  $(
    ".mw-editsection, .reference, .reflist, .navbox, .sidebar, .mbox-small, " +
      "#toc, .catlinks, .noprint, .mw-empty-elt, .sistersitebox"
  ).remove();

  const title = $("#firstHeading").text().trim();

  const contentParts: string[] = [];

  // Use .find() instead of .children() so we reach inside <section> wrappers
  // (Korean Wikipedia and some other editions wrap content in <section> tags)
  $(".mw-parser-output")
    .find("h1, h2, h3, h4, h5, h6, p, ul, ol, dl, table.wikitable")
    .each((_, el) => {
      if (el.type !== "tag") return;
      const $el = $(el);
      const tag = el.tagName;

      if (/^h[1-6]$/.test(tag)) {
        contentParts.push(
          `\n## ${$el.text().replace(/\[edit\]/g, "").trim()}\n`
        );
      } else if (tag === "table") {
        $el.find("tr").each((__, row) => {
          const cells = $(row)
            .find("th, td")
            .map((___, cell) => $(cell).text().trim())
            .get();
          if (cells.length > 0) contentParts.push(cells.join(" | "));
        });
      } else {
        const text = $el.text().trim();
        if (text) contentParts.push(text);
      }
    });

  const content = contentParts.filter(Boolean).join("\n");
  const langMatch = url.match(/\/\/(\w+)\.wikipedia\.org/);
  const audioUrls = extractAudioUrls($, url);

  return {
    content,
    metadata: {
      title: title || "Wikipedia Article",
      type: "wiki",
      language: langMatch?.[1] || "en",
      ...(audioUrls.length > 0 && { audio_urls: audioUrls }),
    },
  };
}

async function crawlUHDictionaryLite(url: string): Promise<CrawlResponse> {
  const res = await fetchWithTimeout(url, CHEERIO_TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const title = $("title").text().trim();
  $("script, style, nav, header, footer").remove();

  // Google Sites uses various content containers
  const content = $(
    "div[role='main'], .sites-canvas-main, #sites-canvas-main-content, body"
  )
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();

  const audioUrls = extractAudioUrls($, url);

  return {
    content,
    metadata: {
      title: title || "UH Dictionary Resource",
      type: "dictionary",
      language: "en",
      ...(audioUrls.length > 0 && { audio_urls: audioUrls }),
    },
  };
}

const ML_SERVICE_URL = process.env.ML_SERVICE_URL || "http://localhost:3003";
const ML_PROCESS_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes for full video pipeline

async function checkMLHealth(): Promise<boolean> {
  try {
    const res = await fetch(`${ML_SERVICE_URL}/health`, {
      signal: AbortSignal.timeout(3_000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Fetch YouTube auto-captions directly from the video page HTML.
 * No API key or ML service needed — works for any language YouTube supports.
 */
async function fetchYouTubeCaptions(
  videoId: string
): Promise<{ transcript: string; language: string } | null> {
  try {
    const pageUrl = `https://www.youtube.com/watch?v=${videoId}`;
    const res = await fetchWithTimeout(pageUrl, 10_000);
    if (!res.ok) return null;

    const html = await res.text();

    // Extract ytInitialPlayerResponse JSON from the page script
    const match = html.match(
      /ytInitialPlayerResponse\s*=\s*(\{[\s\S]+?\})\s*;/
    );
    if (!match) return null;

    let playerResponse: Record<string, unknown>;
    try {
      playerResponse = JSON.parse(match[1]);
    } catch {
      return null;
    }

    const captionTracks = (
      playerResponse as {
        captions?: {
          playerCaptionsTracklistRenderer?: {
            captionTracks?: {
              baseUrl: string;
              languageCode: string;
              kind?: string;
              name?: { simpleText?: string };
            }[];
          };
        };
      }
    ).captions?.playerCaptionsTracklistRenderer?.captionTracks;

    if (!captionTracks || captionTracks.length === 0) return null;

    // Prefer manual captions over auto-generated (kind !== "asr")
    const manualTrack = captionTracks.find((t) => t.kind !== "asr");
    const track = manualTrack || captionTracks[0];

    // Fetch the caption track XML
    const captionRes = await fetchWithTimeout(track.baseUrl, 5_000);
    if (!captionRes.ok) return null;

    const xml = await captionRes.text();

    // Parse <text> elements from the XML transcript
    const textSegments = [...xml.matchAll(/<text[^>]*>([\s\S]*?)<\/text>/g)]
      .map((m) =>
        m[1]
          .replace(/&amp;/g, "&")
          .replace(/&lt;/g, "<")
          .replace(/&gt;/g, ">")
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'")
          .replace(/\n/g, " ")
          .trim()
      )
      .filter(Boolean);

    if (textSegments.length === 0) return null;

    return {
      transcript: textSegments.join(" "),
      language: track.languageCode || "en",
    };
  } catch {
    return null;
  }
}

async function crawlYouTubeLite(url: string, languageContext?: CrawlLanguageContext): Promise<CrawlResponse> {
  const videoIdMatch = url.match(
    /(?:v=|youtu\.be\/|\/embed\/|\/shorts\/)([A-Za-z0-9_-]{11})/
  );
  if (!videoIdMatch) throw new Error("Could not parse YouTube video ID");

  const videoId = videoIdMatch[1];

  // Try ML pipeline first — produces rich transcripts for extraction
  try {
    const mlHealthy = await checkMLHealth();
    if (mlHealthy) {
      // Fetch known vocabulary for this language to guide transcription correction
      let knownVocabulary: string[] = [];
      if (languageContext?.language_code) {
        try {
          const { entries } = await browse({ language_code: languageContext.language_code, limit: 100 });
          knownVocabulary = entries
            .map(e => e.headword_native || e.headword_romanized)
            .filter((h): h is string => Boolean(h));
        } catch { /* non-critical — vocabulary guidance is optional */ }
      }

      const res = await fetch(`${ML_SERVICE_URL}/process-video`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          video_url: url,
          language_name: languageContext?.language_name || "Unknown",
          language_code: languageContext?.language_code || "und",
          contact_languages: languageContext?.contact_languages || null,
          known_vocabulary: knownVocabulary.length > 0 ? knownVocabulary : null,
        }),
        signal: AbortSignal.timeout(ML_PROCESS_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(
          (errData as { detail?: string }).detail ||
            `ML service error ${res.status}`
        );
      }

      const result = (await res.json()) as {
        video_url: string;
        video_id: string;
        transcript: string;
        corrected_transcript: string;
        audio_urls: string[];
        segments: { start: number; end: number; text: string }[];
        duration_seconds: number;
        word_clips?: Record<string, string>;
      };

      const content = [
        `Title: YouTube Video ${result.video_id}`,
        `URL: ${url}`,
        `Duration: ${result.duration_seconds}s`,
        "",
        `--- Corrected ${languageContext?.language_name || ""}Transcript ---`,
        "",
        result.corrected_transcript || result.transcript,
        "",
        "--- Raw Transcript ---",
        "",
        result.transcript,
      ].join("\n");

      return {
        content,
        metadata: {
          title: `YouTube: ${result.video_id}`,
          type: "video",
          language: languageContext?.language_code || "en",
          audio_urls: result.audio_urls,
          video_id: result.video_id,
          ...(result.word_clips && Object.keys(result.word_clips).length > 0 && {
            word_clips: result.word_clips,
          }),
        },
      };
    }
  } catch (err) {
    console.warn(
      `[dispatch] ML pipeline failed for ${url}: ${getErrorMessage(err)}, trying captions fallback...`
    );
  }

  // Tier 2: Fetch YouTube auto-captions directly (no ML service needed)
  // Works for all languages — YouTube auto-generates captions in many languages
  try {
    const captions = await fetchYouTubeCaptions(videoId);
    if (captions && captions.transcript.length >= MIN_CONTENT_LENGTH) {
      // Fetch oEmbed for the title
      let title = `YouTube Video ${videoId}`;
      try {
        const oRes = await fetchWithTimeout(
          `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`,
          CHEERIO_TIMEOUT_MS
        );
        if (oRes.ok) {
          const oData = (await oRes.json()) as { title: string };
          title = oData.title;
        }
      } catch { /* use default title */ }

      const content = [
        `Title: ${title}`,
        `URL: ${url}`,
        "",
        "--- YouTube Captions Transcript ---",
        "",
        captions.transcript,
      ].join("\n");

      return {
        content,
        metadata: {
          title,
          type: "video",
          language: captions.language,
          video_id: videoId,
        },
      };
    }
  } catch (err) {
    console.warn(
      `[dispatch] Captions fallback failed for ${url}: ${getErrorMessage(err)}, trying oEmbed...`
    );
  }

  // Tier 3: oEmbed only (no transcript, minimal metadata — last resort)
  const oembedUrl = `https://www.youtube.com/oembed?url=https://www.youtube.com/watch?v=${videoId}&format=json`;
  const res = await fetchWithTimeout(oembedUrl, CHEERIO_TIMEOUT_MS);

  if (!res.ok) throw new Error(`YouTube oEmbed failed: ${res.status}`);

  const data = (await res.json()) as {
    title: string;
    author_name: string;
    author_url: string;
  };

  const content = [
    `Title: ${data.title}`,
    `Channel: ${data.author_name}`,
    `URL: https://www.youtube.com/watch?v=${videoId}`,
    `Channel URL: ${data.author_url}`,
  ].join("\n");

  return {
    content,
    metadata: {
      title: data.title,
      type: "video",
      language: detectLanguage(data.title, languageContext?.language_code),
    },
  };
}

async function crawlNamuWiki(url: string): Promise<CrawlResponse> {
  const res = await fetchWithTimeout(url, CHEERIO_TIMEOUT_MS);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const title =
    $(".wiki-article h1").first().text().trim() ||
    $("title").text().trim() ||
    url;

  // Remove noise
  $(".wiki-fn-content, .wiki-edit-section, .wiki-toc").remove();

  const content = $(".wiki-paragraph, .wiki-heading-content, .wiki-table")
    .map((_, el) => $(el).text().trim())
    .get()
    .filter(Boolean)
    .join("\n");

  return {
    content,
    metadata: {
      title,
      type: "wiki",
      language: "ko",
    },
  };
}

// ---------------------------------------------------------------------------
// Stagehand helpers (agentic browsing)
// ---------------------------------------------------------------------------

type PageStrategy = "PAGINATED" | "SEARCHABLE" | "SCROLLABLE" | "SIMPLE";

const STAGEHAND_MAX_PAGES = 10;
const STAGEHAND_MAX_SCROLLS = 8;

const PageContentSchema = z.object({
  title: z.string().describe("The page title or main heading"),
  content: z
    .string()
    .describe(
      "All text content from the page, including headings, paragraphs, tables, and list items"
    ),
  language: z
    .string()
    .describe("Primary language code of the content: en, ko, ja, etc."),
  audio_urls: z
    .array(z.string())
    .optional()
    .describe(
      "URLs of audio files found on the page — from <audio> elements, <source> tags, or links to .mp3/.wav/.ogg files"
    ),
});

/** Returns true if the error indicates the browser session has been closed */
function isSessionClosed(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return (
    msg.includes("CDP transport closed") ||
    msg.includes("no page available") ||
    msg.includes("Session closed") ||
    msg.includes("Target closed") ||
    msg.includes("Protocol error")
  );
}

function buildCrawlResponse(
  result: z.infer<typeof PageContentSchema>,
  url: string,
  extractionType: ExtractionType
): CrawlResponse {
  const audioUrls = result.audio_urls?.filter((u) => u && u.startsWith("http")) ?? [];
  return {
    content: result.content,
    metadata: {
      title: result.title || url,
      type: mapExtractionType(extractionType),
      language: result.language || "en",
      ...(audioUrls.length > 0 && { audio_urls: audioUrls }),
    },
  };
}

// ---------------------------------------------------------------------------
// Generic Crawler (two-tier)
// ---------------------------------------------------------------------------

async function crawlGeneric(
  url: string,
  extractionType: ExtractionType,
  languageContext?: CrawlLanguageContext
): Promise<CrawlResponse> {
  // For dictionary/interactive sources, try Stagehand first — these sites
  // typically render content client-side and cheerio gets an empty shell.
  if (BROWSER_FIRST_TYPES.includes(extractionType)) {
    try {
      return await crawlWithStagehand(url, extractionType);
    } catch (err) {
      console.warn(
        `[dispatch] Stagehand failed for ${url}: ${getErrorMessage(err)}, falling back to HTTP...`
      );
      // Fall through to HTTP-based tiers
    }
  }

  // Tier 0: PDF detection — try Stagehand first, then pdf-parse fallback
  const isPdfUrl = url.endsWith(".pdf") || url.includes(".pdf?");
  if (isPdfUrl) {
    // Stagehand renders PDFs in a real browser — better for complex layouts
    try {
      const result = await crawlWithStagehand(url, extractionType);
      if (result.content.length >= MIN_CONTENT_LENGTH) {
        return result;
      }
      console.warn(
        `[dispatch] Stagehand PDF returned only ${result.content.length} chars for ${url}, trying pdf-parse...`
      );
    } catch (err) {
      console.warn(
        `[dispatch] Stagehand PDF failed for ${url}: ${getErrorMessage(err)}, trying pdf-parse...`
      );
    }
  }

  try {
    const headRes = isPdfUrl
      ? null
      : await fetchWithTimeout(url, CHEERIO_TIMEOUT_MS);
    const contentType = headRes?.headers.get("content-type") || "";
    const isPdf =
      isPdfUrl ||
      contentType.includes("application/pdf");

    if (isPdf) {
      const pdfRes = headRes?.ok ? headRes : await fetchWithTimeout(url, 15_000);
      if (!pdfRes.ok) throw new Error(`HTTP ${pdfRes.status}`);

      const buffer = Buffer.from(await pdfRes.arrayBuffer());
      const pdf = new PDFParse({ data: new Uint8Array(buffer) });
      const textResult = await pdf.getText();
      const content = textResult.text
        .replace(/\s+/g, " ")
        .trim();

      if (content.length >= MIN_CONTENT_LENGTH) {
        // Extract title from PDF metadata or first line
        let title = url;
        try {
          const info = await pdf.getInfo();
          title = info.info?.Title || title;
        } catch { /* metadata optional */ }
        if (title === url) {
          title = content.slice(0, 200).split(/\n|\. /)[0].trim() || url;
        }

        await pdf.destroy();
        return {
          content,
          metadata: {
            title,
            type: mapExtractionType(extractionType),
            language: detectLanguage(content, languageContext?.language_code),
          },
        };
      }
      // pdf-parse failed — try pdfjs-dist before falling back to Vision API
      const pdfjsText = await extractPdfTextViaPdfjs(buffer);
      if (pdfjsText) {
        let title = url;
        try {
          const info = await pdf.getInfo();
          title = info.info?.Title || title;
        } catch { /* metadata optional */ }
        if (title === url) {
          title = pdfjsText.slice(0, 200).split(/\n|\. /)[0].trim() || url;
        }

        await pdf.destroy();
        return {
          content: pdfjsText,
          metadata: {
            title,
            type: mapExtractionType(extractionType),
            language: detectLanguage(pdfjsText, languageContext?.language_code),
          },
        };
      }

      // Scanned PDF fallback — both pdf-parse and pdfjs-dist failed, use Vision API
      const MAX_VISION_PDF_SIZE = 25 * 1024 * 1024; // 25MB
      if (buffer.length <= MAX_VISION_PDF_SIZE) {
        let title = url;
        try {
          const info = await pdf.getInfo();
          title = info.info?.Title || title;
        } catch { /* metadata optional */ }
        if (title === url && content.length > 0) {
          title = content.slice(0, 200).split(/\n|\. /)[0].trim() || url;
        }

        await pdf.destroy();
        const quality = assessScanQuality(content, buffer.length, mapExtractionType(extractionType));
        console.log(
          `[dispatch] Scanned PDF detected for ${url} (${content.length} text chars, ${Math.round(buffer.length / 1024)}KB, quality=${quality}) — using Vision API`
        );
        return {
          content: content || `[Scanned document: ${title}]`,
          visual_content: {
            pdf_base64: buffer.toString("base64"),
            is_scan: true,
            scan_quality: quality,
          },
          metadata: {
            title,
            type: mapExtractionType(extractionType),
            language: detectLanguage(content, languageContext?.language_code),
          },
        };
      }

      await pdf.destroy();
      // PDF too large for vision — fall through
    }
  } catch (err) {
    console.warn(`[dispatch] PDF extraction failed for ${url}: ${getErrorMessage(err)}, trying HTML...`);
    // Fall through to HTML parsing
  }

  // ── Tiered crawl: domain-aware strategy with BrightData attribution ──

  const triage = { markdown: null as string | null };
  const tierStartMs = Date.now();

  const tagResult = (
    result: CrawlResponse,
    method: CrawlMethod,
    unlocked: boolean
  ): CrawlResponse => ({
    ...result,
    metadata: {
      ...result.metadata,
      crawl_method: method,
      brightdata_unlocked: unlocked,
      crawl_duration_ms: Date.now() - tierStartMs,
      content_length_bytes: result.content.length,
    },
  });

  const parseMarkdown = (markdown: string): CrawlResponse => {
    if (!markdown || markdown.trim().length < MIN_CONTENT_LENGTH) {
      throw new Error(`Markdown content too short: ${markdown?.length ?? 0} chars`);
    }

    // Extract title from first heading or first line
    const titleMatch = markdown.match(/^#{1,3}\s+(.+)$/m);
    const title = titleMatch?.[1]?.trim() || markdown.split("\n")[0].slice(0, 200).trim() || url;

    return {
      content: markdown.trim(),
      metadata: {
        title,
        type: mapExtractionType(extractionType),
        language: detectLanguage(markdown, languageContext?.language_code),
      },
    };
  };

  const parseHtml = (html: string): CrawlResponse => {
    if (html.startsWith("%PDF") || /[\x00-\x08\x0E-\x1F]{10,}/.test(html.slice(0, 1000))) {
      throw new Error("Binary content detected in response body");
    }

    const $ = cheerio.load(html);

    // Extract audio URLs before stripping elements
    const audioUrls = extractAudioUrls($, url);

    $("script, style, nav, footer, aside, header, .ad, .sidebar, .cookie-banner, noscript").remove();

    const title =
      $("title").text().trim() || $("h1").first().text().trim() || url;

    const content = $("article, main, .content, #content, [role='main'], body")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();

    if (content.length < MIN_CONTENT_LENGTH) {
      throw new Error(`Content too short: ${content.length} chars`);
    }

    return {
      content,
      metadata: {
        title,
        type: mapExtractionType(extractionType),
        language: detectLanguage(content, languageContext?.language_code),
        ...(audioUrls.length > 0 && { audio_urls: audioUrls }),
      },
    };
  };

  const tier = classifyDomain(url);
  const hasBDMCP = brightDataMCPConfigured();
  const hasBDProxy = brightDataConfigured();
  let cheerioFailed = false;

  if (tier === "brightdata_first" && hasBDMCP) {
    // BrightData-first: academic, geo-restricted, anti-bot sites
    try {
      const md = await brightdataScrapeMarkdown(url, languageContext?.countries?.[0]);
      triage.markdown = md;
      return tagResult(parseMarkdown(md), "web_unlocker", false);
    } catch {
      // BrightData failed — try Cheerio fallback
    }

    try {
      const res = await fetchWithTimeout(url, CHEERIO_TIMEOUT_MS);
      if (res.ok) return tagResult(parseHtml(await res.text()), "cheerio", false);
    } catch { /* fall through to Stagehand */ }
  } else {
    // Cheerio-first: easy sites (Wikipedia, Wiktionary, etc.) or unknown domains
    try {
      const res = await fetchWithTimeout(url, CHEERIO_TIMEOUT_MS);
      if (res.ok) return tagResult(parseHtml(await res.text()), "cheerio", false);
    } catch {
      cheerioFailed = true;
    }

    // BrightData MCP fallback — Cheerio failed, BrightData may unlock this source
    if (hasBDMCP) {
      try {
        const md = await brightdataScrapeMarkdown(url, languageContext?.countries?.[0]);
        triage.markdown = md;
        return tagResult(parseMarkdown(md), "web_unlocker", true); // unlocked!
      } catch { /* fall through */ }
    } else if (hasBDProxy) {
      // Legacy proxy fallback
      try {
        const html = await fetchViaProxy(url);
        return tagResult(parseHtml(html), "web_unlocker", true); // unlocked!
      } catch { /* fall through */ }
    }
  }

  // Source triage: if BrightData returned content but it was too short,
  // check if it's worth launching an expensive Stagehand session.
  if (triage.markdown !== null && triage.markdown.trim().length < 50) {
    throw new Error(`Source appears inaccessible (triage: ${triage.markdown.trim().length} chars)`);
  }

  // Tier 2: Stagehand (expensive, last resort)
  const stagehandResult = await crawlWithStagehand(url, extractionType, languageContext);
  return tagResult(stagehandResult, "stagehand", cheerioFailed);
}

// ---------------------------------------------------------------------------
// Agentic browsing — observe → classify → execute
// ---------------------------------------------------------------------------

interface PageClassification {
  strategy: PageStrategy;
  findings: string[];
}

async function classifyPage(stagehand: InstanceType<typeof import("@browserbasehq/stagehand").Stagehand>): Promise<PageClassification> {
  const observations = await stagehand.observe(
    "Analyze this page's structure. Look for: " +
    "1) Pagination controls (next/prev buttons, page numbers) " +
    "2) Search bars or filter inputs " +
    "3) Infinite scroll or 'load more' buttons " +
    "4) Static content that fits on one screen"
  );

  const findings = observations
    .map((o: { description: string }) => o.description)
    .filter(Boolean)
    .slice(0, 5);
  const text = findings.join(" ").toLowerCase();

  let strategy: PageStrategy = "SIMPLE";
  if (/pagination|page\s*\d|next\s*page|previous|»|›/.test(text)) strategy = "PAGINATED";
  else if (/search|filter|query|find/.test(text)) strategy = "SEARCHABLE";
  else if (/scroll|load\s*more|infinite|show\s*more/.test(text)) strategy = "SCROLLABLE";

  return { strategy, findings };
}

async function observeContent(
  stagehand: InstanceType<typeof import("@browserbasehq/stagehand").Stagehand>,
  extractionType: ExtractionType
): Promise<string[]> {
  const prompt = extractionType === "dictionary"
    ? "Analyze the content on this page. Describe what you see: " +
      "vocabulary tables, word lists, dictionary entries, definition sections, " +
      "audio/pronunciation buttons, example sentences, part-of-speech labels, " +
      "translation pairs, and any navigation to more entries."
    : "Analyze the content on this page. Describe what you see: " +
      "article sections, data tables, vocabulary lists, embedded media, " +
      "downloadable files, linguistic examples, and structured data.";

  const observations = await stagehand.observe(prompt);
  return observations
    .map((o: { description: string }) => o.description)
    .filter(Boolean)
    .slice(0, 8);
}

function buildExtractionPrompt(
  basePrompt: string,
  contentFindings: string[]
): string {
  if (contentFindings.length === 0) return basePrompt;
  const context = contentFindings.join("; ");
  return (
    `Page structure analysis found: ${context}. ` +
    `Use this understanding to extract more thoroughly. ${basePrompt}`
  );
}

async function executeSimple(
  stagehand: InstanceType<typeof import("@browserbasehq/stagehand").Stagehand>,
  url: string,
  extractionType: ExtractionType,
  contentHints?: string[]
): Promise<CrawlResponse> {
  const prompt = buildExtractionPrompt(
    "Extract all text content from this page. Include headings, paragraphs, table data, list items, and any vocabulary or dictionary entries. Preserve structure as plain text. Also find any audio file URLs on the page.",
    contentHints ?? []
  );
  const result = await withTimeout(
    stagehand.extract(prompt, PageContentSchema),
    STAGEHAND_TIMEOUT_MS,
    "simple extraction"
  );
  const response = buildCrawlResponse(result, url, extractionType);
  response.metadata.crawl_pages = 1;
  return response;
}

async function executePaginated(
  stagehand: InstanceType<typeof import("@browserbasehq/stagehand").Stagehand>,
  url: string,
  extractionType: ExtractionType,
  contentHints?: string[]
): Promise<CrawlResponse> {
  const page = stagehand.context.pages()[0];
  const allContent: string[] = [];
  let title = "";
  let language = "en";
  let consecutiveEmpty = 0;
  let sessionAlive = true;
  const prompt = buildExtractionPrompt(
    "Extract all text content from the current page view. Include headings, paragraphs, table data, list items, and any vocabulary or dictionary entries.",
    contentHints ?? []
  );

  for (let pageNum = 0; pageNum < STAGEHAND_MAX_PAGES && consecutiveEmpty < 3 && sessionAlive; pageNum++) {
    try {
      const result = await withTimeout(
        stagehand.extract(prompt, PageContentSchema),
        STAGEHAND_TIMEOUT_MS,
        `page ${pageNum + 1} extraction`
      );
      if (!title) title = result.title;
      if (result.language) language = result.language;

      if (result.content && result.content.length > 50) {
        allContent.push(result.content);
        consecutiveEmpty = 0;
      } else {
        consecutiveEmpty++;
      }
    } catch (err) {
      if (isSessionClosed(err)) { sessionAlive = false; break; }
      consecutiveEmpty++;
    }

    // Navigate to next page
    if (sessionAlive && consecutiveEmpty < 3 && pageNum < STAGEHAND_MAX_PAGES - 1) {
      try {
        await stagehand.act("Click the next page button or navigate to the next page of results");
        await page.waitForTimeout(2000);
      } catch (err) {
        if (isSessionClosed(err)) { sessionAlive = false; }
        break; // No more pages
      }
    }
  }

  if (allContent.length === 0) throw new Error("No content extracted across pages");
  return {
    content: allContent.join("\n\n---\n\n"),
    metadata: {
      title: title || url,
      type: mapExtractionType(extractionType),
      language,
      crawl_pages: allContent.length,
    },
  };
}

async function executeScrollable(
  stagehand: InstanceType<typeof import("@browserbasehq/stagehand").Stagehand>,
  url: string,
  extractionType: ExtractionType,
  contentHints?: string[]
): Promise<CrawlResponse> {
  const page = stagehand.context.pages()[0];
  const seenChunks = new Set<string>();
  const allContent: string[] = [];
  let title = "";
  let language = "en";
  let consecutiveEmpty = 0;
  let sessionAlive = true;
  const prompt = buildExtractionPrompt(
    "Extract all text content visible in the current viewport. Include headings, paragraphs, table data, list items, and any vocabulary or dictionary entries.",
    contentHints ?? []
  );

  for (let scroll = 0; scroll < STAGEHAND_MAX_SCROLLS && consecutiveEmpty < 3 && sessionAlive; scroll++) {
    try {
      const result = await withTimeout(
        stagehand.extract(prompt, PageContentSchema),
        STAGEHAND_TIMEOUT_MS,
        `scroll ${scroll + 1} extraction`
      );
      if (!title) title = result.title;
      if (result.language) language = result.language;

      const chunk = result.content?.trim() || "";
      const chunkKey = chunk.slice(0, 200);
      if (chunk.length > 50 && !seenChunks.has(chunkKey)) {
        seenChunks.add(chunkKey);
        allContent.push(chunk);
        consecutiveEmpty = 0;
      } else {
        consecutiveEmpty++;
      }
    } catch (err) {
      if (isSessionClosed(err)) { sessionAlive = false; break; }
      consecutiveEmpty++;
    }

    // Scroll down
    if (sessionAlive && consecutiveEmpty < 3) {
      try {
        await stagehand.act("Scroll down to reveal more content. If there is a 'Load More' or 'Show More' button, click it.");
        await page.waitForTimeout(2000);
      } catch (err) {
        if (isSessionClosed(err)) { sessionAlive = false; break; }
        try {
          await page.keyPress("PageDown");
          await page.waitForTimeout(1500);
        } catch (kErr) {
          if (isSessionClosed(kErr)) { sessionAlive = false; break; }
        }
      }
    }
  }

  if (allContent.length === 0) throw new Error("No content extracted after scrolling");
  return {
    content: allContent.join("\n\n"),
    metadata: {
      title: title || url,
      type: mapExtractionType(extractionType),
      language,
      crawl_pages: allContent.length,
    },
  };
}

async function executeSearchable(
  stagehand: InstanceType<typeof import("@browserbasehq/stagehand").Stagehand>,
  url: string,
  extractionType: ExtractionType,
  languageContext?: CrawlLanguageContext,
  contentHints?: string[]
): Promise<CrawlResponse> {
  const page = stagehand.context.pages()[0];
  const searchTerm = languageContext?.language_name || "";

  if (searchTerm) {
    try {
      await stagehand.act(`Type "${searchTerm}" into the search bar and submit the search`);
      await page.waitForTimeout(3000);
    } catch {
      // Search failed — fall through to extract what's visible
    }
  }

  return executeSimple(stagehand, url, extractionType, contentHints);
}

async function crawlWithStagehand(
  url: string,
  extractionType: ExtractionType,
  languageContext?: CrawlLanguageContext
): Promise<CrawlResponse> {
  const { Stagehand } = await import("@browserbasehq/stagehand");

  // Suppress Stagehand's internal CDP errors from crashing the process
  const rejectionHandler = (reason: unknown) => {
    const msg = reason instanceof Error ? reason.message : String(reason);
    if (msg.includes("CDP") || msg.includes("socket-close") || msg.includes("transport")) {
      // Suppress known Stagehand CDP disconnect errors
    }
  };
  process.on("unhandledRejection", rejectionHandler);

  const stagehand = new Stagehand({
    env: "BROWSERBASE",
    apiKey: process.env.BROWSERBASE_API_KEY,
    projectId: process.env.BROWSERBASE_PROJECT_ID,
    model: getStagehandModelConfig(),
    verbose: 0,
    browserbaseSessionCreateParams: { timeout: 120 },
  });

  let sessionId: string | undefined;
  try {
    await stagehand.init();
    const sessionUrl = stagehand.browserbaseSessionURL;
    sessionId = stagehand.browserbaseSessionID;

    // Fire-and-forget: emit live debug URL for real-time browser view
    if (sessionId) {
      (async () => {
        try {
          const debugRes = await fetch(
            `https://www.browserbase.com/v1/sessions/${sessionId}/debug`,
            { headers: { "x-bb-api-key": process.env.BROWSERBASE_API_KEY! } }
          );
          const { debuggerFullscreenUrl } = await debugRes.json() as { debuggerFullscreenUrl: string };
          if (debuggerFullscreenUrl) {
            const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
            await fetch(`${wsUrl}/emit`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agent: "orchestrator",
                action: "stagehand_live",
                status: "running",
                data: {
                  url,
                  live_debug_url: debuggerFullscreenUrl,
                  message: `Live browser session for ${url}`,
                },
              }),
              signal: AbortSignal.timeout(3_000),
            });
          }
        } catch { /* fire and forget */ }
      })();
    }
    const page = stagehand.context.pages()[0];
    await page.goto(url, { waitUntil: "domcontentloaded", timeoutMs: 15_000 });
    await page.waitForTimeout(2_000);

    // Classify page type using observe()
    let strategy: PageStrategy = "SIMPLE";
    let findings: string[] = [];
    try {
      const classification = await withTimeout(classifyPage(stagehand), 10_000, "page classification");
      strategy = classification.strategy;
      findings = classification.findings;
      console.log(`[dispatch] Stagehand classified ${url} as ${strategy} (${findings.length} observations)`);
    } catch {
      console.log(`[dispatch] Page classification timed out for ${url}, using SIMPLE`);
    }

    // Content-focused observation — maps page content for smarter extraction
    let contentHints: string[] = [];
    try {
      contentHints = await withTimeout(
        observeContent(stagehand, extractionType),
        10_000,
        "content observation"
      );
      console.log(`[dispatch] Stagehand content observation: ${contentHints.length} findings`);
    } catch {
      // Non-fatal — extraction still works without content hints
    }

    // Execute the appropriate browsing strategy
    let response: CrawlResponse;
    switch (strategy) {
      case "PAGINATED":
        response = await executePaginated(stagehand, url, extractionType, contentHints);
        break;
      case "SEARCHABLE":
        response = await executeSearchable(stagehand, url, extractionType, languageContext, contentHints);
        break;
      case "SCROLLABLE":
        response = await executeScrollable(stagehand, url, extractionType, contentHints);
        break;
      case "SIMPLE":
      default:
        response = await executeSimple(stagehand, url, extractionType, contentHints);
        break;
    }

    // Stamp Stagehand observability metadata
    response.metadata.crawl_strategy = strategy;
    if (sessionUrl) response.metadata.browserbase_url = sessionUrl;
    const allFindings = [...findings, ...contentHints];
    if (allFindings.length > 0) response.metadata.observe_findings = allFindings;

    return response;
  } finally {
    try { await stagehand.close(); } catch { /* ignore cleanup errors */ }
    process.removeListener("unhandledRejection", rejectionHandler);
    // Signal that the live session has ended
    if (sessionId) {
      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || "http://localhost:3001";
      fetch(`${wsUrl}/emit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          agent: "orchestrator",
          action: "stagehand_ended",
          status: "complete",
          data: { url, message: "Browser session ended" },
        }),
        signal: AbortSignal.timeout(3_000),
      }).catch(() => {});
    }
  }
}

// ---------------------------------------------------------------------------
// Audio URL extraction from HTML
// ---------------------------------------------------------------------------

const AUDIO_EXTENSIONS = /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i;

function extractAudioUrls($: cheerio.CheerioAPI, baseUrl: string): string[] {
  const urls = new Set<string>();

  const resolve = (src: string): string | null => {
    try {
      return new URL(src, baseUrl).href;
    } catch {
      return null;
    }
  };

  // <audio src="..."> and <audio><source src="...">
  $("audio").each((_, el) => {
    const src = $(el).attr("src");
    if (src) { const u = resolve(src); if (u) urls.add(u); }
    $(el).find("source").each((__, source) => {
      const s = $(source).attr("src");
      if (s) { const u = resolve(s); if (u) urls.add(u); }
    });
  });

  // <a href="*.mp3|*.wav|...">
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href");
    if (href && AUDIO_EXTENSIONS.test(href)) {
      const u = resolve(href);
      if (u) urls.add(u);
    }
  });

  return [...urls];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(
  url: string,
  timeoutMs: number
): Promise<Response> {
  return fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept:
        "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9,ko;q=0.8",
    },
    signal: AbortSignal.timeout(timeoutMs),
  });
}

function mapExtractionType(type: ExtractionType): string {
  const mapping: Record<ExtractionType, string> = {
    dictionary: "dictionary",
    article: "archive",
    video: "video",
    academic: "academic",
    wiki: "wiki",
    generic: "archive",
  };
  return mapping[type] || "archive";
}

function detectLanguage(text: string, hint?: string): string {
  if (hint) return hint;
  const sample = text.slice(0, 1000);
  const len = sample.replace(/\s/g, "").length;
  if (len === 0) return "en";

  const count = (regex: RegExp) => (sample.match(regex) || []).length;
  const threshold = len * 0.15;

  const hangul = count(/[\uAC00-\uD7AF\u1100-\u11FF\u3130-\u318F]/g);
  if (hangul > threshold) return "ko";
  const arabic = count(/[\u0600-\u06FF\u0750-\u077F]/g);
  if (arabic > threshold) return "ar";
  const devanagari = count(/[\u0900-\u097F]/g);
  if (devanagari > threshold) return "hi";
  const thai = count(/[\u0E00-\u0E7F]/g);
  if (thai > threshold) return "th";
  const cjk = count(/[\u4E00-\u9FFF\u3400-\u4DBF]/g);
  if (cjk > threshold) return "zh";
  const cyrillic = count(/[\u0400-\u04FF]/g);
  if (cyrillic > threshold) return "ru";
  const bengali = count(/[\u0980-\u09FF]/g);
  if (bengali > threshold) return "bn";
  const tamil = count(/[\u0B80-\u0BFF]/g);
  if (tamil > threshold) return "ta";
  const myanmar = count(/[\u1000-\u109F]/g);
  if (myanmar > threshold) return "my";
  const khmer = count(/[\u1780-\u17FF]/g);
  if (khmer > threshold) return "km";
  const ethiopic = count(/[\u1200-\u137F]/g);
  if (ethiopic > threshold) return "am";

  return "en";
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string
): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs)
    ),
  ]);
}
