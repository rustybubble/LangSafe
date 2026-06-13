import * as cheerio from "cheerio";
import type { CrawlResponse } from "./dispatch";

const USER_AGENT =
  "LangSafe/1.0 (endangered language preservation research)";

/**
 * Crawls Living Tongues Talking Dictionary pages to extract
 * vocabulary entries with audio.
 *
 * Target: https://talkingdictionary.swarthmore.edu/[language]/
 *   or search results pages
 */
export async function crawlTalkingDictionary(
  url: string
): Promise<CrawlResponse> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(15_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`Talking Dictionary HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, .navbar, .footer").remove();

  const sections: string[] = [];
  const audioUrls: string[] = [];

  // Title / language name
  const title =
    $("h1").first().text().trim() ||
    $("title").text().trim().replace(/ \|.*$/, "") ||
    "Talking Dictionary";
  sections.push(`# ${title}\n`);

  // Language description/overview
  const intro = $(".language-description, .intro, .about, .overview, header p");
  if (intro.length) {
    const text = intro
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join("\n");
    if (text) sections.push(`## About\n${text}\n`);
  }

  // Dictionary entries — look for structured word entries
  const entries: string[] = [];
  const entrySelectors = [
    ".entry",
    ".word-entry",
    ".dictionary-entry",
    ".vocab-entry",
    "tr",
    "li",
    ".result",
  ];

  for (const selector of entrySelectors) {
    $(selector).each((_, el) => {
      const $el = $(el);
      const text = $el.text().trim();

      // Skip if too short or too long (likely not a dictionary entry)
      if (text.length < 3 || text.length > 500) return;

      // Check for audio within this entry
      $el.find("audio source, audio[src], a[href]").each((__, audioEl) => {
        const src = $(audioEl).attr("src") || $(audioEl).attr("href") || "";
        if (/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(src)) {
          try {
            audioUrls.push(new URL(src, url).href);
          } catch { /* ignore */ }
        }
      });

      // Try to extract structured data from the entry
      const word =
        $el.find(".word, .headword, .term, .native, td:first-child").first().text().trim();
      const definition =
        $el.find(".definition, .meaning, .gloss, .translation, td:nth-child(2)").first().text().trim();
      const pos =
        $el.find(".pos, .part-of-speech, .category").first().text().trim();

      if (word && definition) {
        const entry = pos
          ? `${word} (${pos}) — ${definition}`
          : `${word} — ${definition}`;
        entries.push(entry);
      } else if (text && !entries.includes(text)) {
        // Check if the text looks like "word - definition" pattern
        const match = text.match(/^(.+?)\s*[-–—:]\s*(.+)$/);
        if (match && match[1].length < 50) {
          entries.push(`${match[1].trim()} — ${match[2].trim()}`);
        }
      }
    });

    // If we found entries with this selector, don't try others
    if (entries.length > 5) break;
  }

  if (entries.length > 0) {
    sections.push(
      `\n## Dictionary Entries (${entries.length})\n` +
      entries.slice(0, 500).map((e) => `- ${e}`).join("\n") + "\n"
    );
  }

  // Also extract audio URLs from the page globally
  $("audio source, audio[src]").each((_, el) => {
    const src = $(el).attr("src");
    if (src) {
      try {
        const resolved = new URL(src, url).href;
        if (!audioUrls.includes(resolved)) audioUrls.push(resolved);
      } catch { /* ignore */ }
    }
  });
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(href)) {
      try {
        const resolved = new URL(href, url).href;
        if (!audioUrls.includes(resolved)) audioUrls.push(resolved);
      } catch { /* ignore */ }
    }
  });

  // Word categories/topics
  const categories: string[] = [];
  $(".category, .topic, .word-category, .semantic-domain").each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length < 100) categories.push(text);
  });
  if (categories.length > 0) {
    sections.push(`\n## Categories\n${categories.join(", ")}\n`);
  }

  // Fallback content
  if (sections.length < 3 && entries.length === 0) {
    const mainContent = $("main, .content, #content, article, body")
      .first()
      .text()
      .replace(/\s+/g, " ")
      .trim();
    if (mainContent) {
      sections.push(`\n## Page Content\n${mainContent.slice(0, 5000)}\n`);
    }
  }

  const content = sections.join("\n");
  if (content.length < 100) {
    throw new Error("Talking Dictionary: insufficient content extracted");
  }

  return {
    content,
    metadata: {
      title,
      type: "dictionary",
      language: "en",
      entries_hint: entries.length > 0 ? entries.length : undefined,
      audio_urls: audioUrls.length > 0 ? audioUrls : undefined,
    },
  };
}
