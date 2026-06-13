import * as cheerio from "cheerio";
import type { CrawlResponse } from "./dispatch";

const USER_AGENT =
  "LangSafe/1.0 (endangered language preservation research)";

/**
 * Crawls an Endangered Languages Project page to extract language
 * description, vitality info, sample words, and media links.
 *
 * Target: https://endangeredlanguages.com/lang/[iso_code]
 */
export async function crawlELP(url: string): Promise<CrawlResponse> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`ELP HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, .navbar, .footer").remove();

  const sections: string[] = [];

  // Language name
  const title =
    $("h1").first().text().trim() ||
    $("title").text().trim().replace(/ \|.*$/, "") ||
    "Endangered Language";
  sections.push(`# ${title}\n`);

  // Description / overview
  const description = $(".language-description, .field-description, .overview, .description, article p");
  if (description.length) {
    const text = description
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join("\n\n");
    if (text) sections.push(`## Description\n${text}\n`);
  }

  // Vitality / endangerment info
  const vitality = $(".vitality, .endangerment, .language-vitality, .field-vitality");
  if (vitality.length) {
    sections.push(`## Vitality\n${vitality.text().trim()}\n`);
  }

  // Speaker count
  $("dt, .field-label, th")
    .filter((_, el) => /speaker|population/i.test($(el).text()))
    .each((_, el) => {
      const value = $(el).next("dd, .field-value, td").text().trim();
      if (value) sections.push(`Speakers: ${value}`);
    });

  // Location / region
  $("dt, .field-label, th")
    .filter((_, el) => /location|region|country/i.test($(el).text()))
    .each((_, el) => {
      const value = $(el).next("dd, .field-value, td").text().trim();
      if (value) sections.push(`Location: ${value}`);
    });

  // Sample words/phrases
  const samples = $(".word-list, .vocabulary, .samples, .phrases, table");
  if (samples.length) {
    const wordEntries: string[] = [];
    samples.find("tr, li, .entry").each((_, el) => {
      const text = $(el).text().trim();
      if (text && text.length < 200) wordEntries.push(text);
    });
    if (wordEntries.length > 0) {
      sections.push(`\n## Sample Vocabulary\n${wordEntries.slice(0, 100).map((w) => `- ${w}`).join("\n")}\n`);
    }
  }

  // Media links (audio, video)
  const audioUrls: string[] = [];
  $("audio source, audio[src], a[href]").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("href") || "";
    if (/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(src)) {
      try {
        audioUrls.push(new URL(src, url).href);
      } catch { /* ignore invalid URLs */ }
    }
  });

  $("video source, video[src], iframe[src]").each((_, el) => {
    const src = $(el).attr("src") || "";
    if (src) {
      try {
        const resolved = new URL(src, url).href;
        sections.push(`Media: ${resolved}`);
      } catch { /* ignore */ }
    }
  });

  // Resource links
  const resources: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    if (
      text &&
      href &&
      !href.startsWith("#") &&
      !href.startsWith("javascript:") &&
      /resource|dictionary|grammar|archive|document|record/i.test(text + href)
    ) {
      try {
        resources.push(`${text}: ${new URL(href, url).href}`);
      } catch { /* ignore */ }
    }
  });
  if (resources.length > 0) {
    sections.push(`\n## Resources\n${resources.slice(0, 30).map((r) => `- ${r}`).join("\n")}\n`);
  }

  // Fallback: grab main content if we got too little
  if (sections.length < 3) {
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
    throw new Error("ELP: insufficient content extracted");
  }

  return {
    content,
    metadata: {
      title,
      type: "archive",
      language: "en",
      audio_urls: audioUrls.length > 0 ? audioUrls : undefined,
    },
  };
}
