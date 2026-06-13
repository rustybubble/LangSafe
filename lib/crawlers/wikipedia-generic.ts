import * as cheerio from "cheerio";
import type { CrawlResponse } from "./dispatch";

const USER_AGENT =
  "LangSafe/1.0 (endangered language preservation research)";

/**
 * Generic Wikipedia language article crawler.
 * Extracts text content, vocabulary tables, phonology, and grammar sections
 * from any language's Wikipedia article.
 *
 * Target: https://en.wikipedia.org/wiki/[Name]_language
 */
export async function crawlWikipediaGeneric(
  url: string
): Promise<CrawlResponse> {
  const res = await fetch(url, {
    headers: {
      "User-Agent": USER_AGENT,
      Accept: "text/html,application/xhtml+xml",
    },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove noise elements
  $(
    ".mw-editsection, .reference, .reflist, .navbox, .sisternote, " +
    ".metadata, .ambox, .sidebar, .infobox, .toc, .mw-empty-elt, " +
    "script, style, .noprint, .mw-jump-link"
  ).remove();

  const sections: string[] = [];

  // Title
  const title = $("#firstHeading").text().trim() || $("title").text().replace(" - Wikipedia", "").trim();
  sections.push(`# ${title}\n`);

  // Detect language from URL
  const langMatch = url.match(/\/\/(\w+)\.wikipedia\.org/);
  const wikiLang = langMatch?.[1] || "en";

  // Extract content by section
  const content$ = $(".mw-parser-output");
  let vocabTableCount = 0;

  content$.children().each((_, el) => {
    const tag = (el as any).tagName as string;
    const $el = $(el);

    // Headings
    if (/^h[1-6]$/.test(tag)) {
      const headingText = $el.text().replace(/\[edit\]/g, "").trim();
      if (headingText) {
        const level = parseInt(tag[1]);
        sections.push(`\n${"#".repeat(level)} ${headingText}\n`);
      }
      return;
    }

    // Paragraphs
    if (tag === "p") {
      const text = $el.text().trim();
      if (text) sections.push(text + "\n");
      return;
    }

    // Lists
    if (tag === "ul" || tag === "ol") {
      $el.children("li").each((__, li) => {
        const text = $(li).text().trim();
        if (text) sections.push(`- ${text}`);
      });
      sections.push("");
      return;
    }

    // Tables — especially vocabulary/word lists
    if (tag === "table" && $el.hasClass("wikitable")) {
      const headers = $el
        .find("th")
        .map((__, th) => $(th).text().trim())
        .get();

      // Check if this looks like a vocabulary/word table
      const isVocabTable = headers.some((h) =>
        /word|meaning|english|gloss|translation|term|lexicon|cognate|phonem|vowel|consonant/i.test(h)
      );

      const rows: string[] = [];
      rows.push(`| ${headers.join(" | ")} |`);
      rows.push(`| ${headers.map(() => "---").join(" | ")} |`);

      $el.find("tbody tr, tr").each((__, tr) => {
        const cells = $(tr)
          .find("td")
          .map((___, td) => $(td).text().trim().replace(/\n/g, " "))
          .get();
        if (cells.length > 0) {
          rows.push(`| ${cells.join(" | ")} |`);
        }
      });

      if (rows.length > 2) {
        sections.push(rows.join("\n") + "\n");
        if (isVocabTable) vocabTableCount++;
      }
      return;
    }

    // Definition lists (often used for linguistic data)
    if (tag === "dl") {
      $el.children().each((__, child) => {
        const childTag = (child as any).tagName as string;
        const text = $(child).text().trim();
        if (childTag === "dt" && text) sections.push(`**${text}**`);
        if (childTag === "dd" && text) sections.push(`  ${text}`);
      });
      sections.push("");
    }
  });

  // Extract audio URLs
  const audioUrls: string[] = [];
  $("audio source, audio[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      try {
        audioUrls.push(new URL(src, url).href);
      } catch { /* ignore */ }
    }
  });
  // Also check for audio file links (common on Wikipedia for pronunciation)
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (/\.(ogg|mp3|wav|flac)$/i.test(href)) {
      try {
        audioUrls.push(new URL(href, url).href);
      } catch { /* ignore */ }
    }
  });

  const fullContent = sections.join("\n");
  if (fullContent.length < 200) {
    throw new Error("Wikipedia: insufficient content extracted");
  }

  return {
    content: fullContent,
    metadata: {
      title,
      type: "wiki",
      language: wikiLang,
      entries_hint: vocabTableCount > 0 ? vocabTableCount * 20 : undefined,
      audio_urls: audioUrls.length > 0 ? audioUrls : undefined,
    },
  };
}
