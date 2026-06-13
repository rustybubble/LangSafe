import * as cheerio from "cheerio";
import type { CrawlResponse } from "./dispatch";

const USER_AGENT =
  "LangSafe/1.0 (endangered language preservation research)";

/**
 * Crawls ELAR (Endangered Languages Archive) pages to extract
 * collection descriptions, language metadata, and available resources.
 *
 * Target: https://www.elar.soas.ac.uk/Collection/[id]
 *   or any elar.soas.ac.uk page
 */
export async function crawlELAR(url: string): Promise<CrawlResponse> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`ELAR HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  // Remove noise
  $("script, style, nav, footer, .navbar, .footer, .breadcrumb").remove();

  const sections: string[] = [];

  // Title
  const title =
    $("h1").first().text().trim() ||
    $("title").text().trim().replace(/ \|.*$/, "") ||
    "ELAR Archive";
  sections.push(`# ${title}\n`);

  // Collection/deposit description
  const description = $(
    ".collection-description, .deposit-description, " +
    ".field-description, .abstract, .description, " +
    "article p, .content p"
  );
  if (description.length) {
    const text = description
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean)
      .join("\n\n");
    if (text) sections.push(`## Description\n${text}\n`);
  }

  // Language metadata
  const metaFields = [
    "language",
    "region",
    "country",
    "depositor",
    "date",
    "access",
    "subject",
    "content type",
    "format",
  ];
  const metadata: string[] = [];
  $("dt, th, .field-label, label").each((_, el) => {
    const label = $(el).text().trim().toLowerCase();
    if (metaFields.some((f) => label.includes(f))) {
      const value = $(el).next("dd, td, .field-value, span").text().trim();
      if (value) metadata.push(`${$(el).text().trim()}: ${value}`);
    }
  });
  if (metadata.length > 0) {
    sections.push(`## Metadata\n${metadata.join("\n")}\n`);
  }

  // Available resources / recordings / documents
  const resources: string[] = [];
  $(
    ".resource-list li, .file-list li, .bundle-list li, " +
    "table.files tr, .deposit-contents li, .items li"
  ).each((_, el) => {
    const text = $(el).text().trim().slice(0, 200);
    if (text) resources.push(text);
  });
  if (resources.length > 0) {
    sections.push(
      `\n## Available Resources (${resources.length})\n` +
      resources.slice(0, 100).map((r) => `- ${r}`).join("\n") + "\n"
    );
  }

  // Audio/media files
  const audioUrls: string[] = [];
  $("audio source, audio[src], a[href]").each((_, el) => {
    const src = $(el).attr("src") || $(el).attr("href") || "";
    if (/\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(src)) {
      try {
        audioUrls.push(new URL(src, url).href);
      } catch { /* ignore */ }
    }
  });

  // Related collections / links
  const links: string[] = [];
  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    const text = $(el).text().trim();
    if (
      text &&
      href &&
      !href.startsWith("#") &&
      !href.startsWith("javascript:") &&
      /collection|deposit|language|bundle/i.test(href)
    ) {
      try {
        links.push(`${text}: ${new URL(href, url).href}`);
      } catch { /* ignore */ }
    }
  });
  if (links.length > 0) {
    sections.push(
      `\n## Related Links\n${links.slice(0, 20).map((l) => `- ${l}`).join("\n")}\n`
    );
  }

  // Fallback content
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
    throw new Error("ELAR: insufficient content extracted");
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
