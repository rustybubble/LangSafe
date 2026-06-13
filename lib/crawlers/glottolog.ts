import * as cheerio from "cheerio";
import type { CrawlResponse } from "./dispatch";

const USER_AGENT =
  "LangSafe/1.0 (endangered language preservation research)";

/**
 * Crawls a Glottolog languoid page to extract language metadata,
 * classification, endangerment info, and reference links.
 *
 * Target: https://glottolog.org/resource/languoid/id/[glottocode]
 */
export async function crawlGlottolog(
  url: string
): Promise<CrawlResponse> {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Glottolog HTTP ${res.status}`);

  const html = await res.text();
  const $ = cheerio.load(html);

  const sections: string[] = [];

  // Language name from page title
  const title =
    $("h2").first().text().trim() ||
    $("title").text().trim().replace(" - Glottolog", "") ||
    "Glottolog Language";
  sections.push(`# ${title}\n`);

  // Classification / family tree
  const classification = $("#classification, .classification");
  if (classification.length) {
    sections.push("## Classification");
    classification.find("li, a").each((_, el) => {
      const text = $(el).text().trim();
      if (text) sections.push(`- ${text}`);
    });
    sections.push("");
  }

  // Breadcrumb-based classification (alternative structure)
  const breadcrumb = $(".breadcrumb, ol.breadcrumb");
  if (breadcrumb.length) {
    const path = breadcrumb
      .find("li, a")
      .map((_, el) => $(el).text().trim())
      .get()
      .filter(Boolean);
    if (path.length > 0) {
      sections.push(`## Language Family Path\n${path.join(" > ")}\n`);
    }
  }

  // Alternative names
  const names: string[] = [];
  $("dt")
    .filter((_, el) => /name/i.test($(el).text()))
    .each((_, el) => {
      const dd = $(el).next("dd");
      if (dd.length) names.push(dd.text().trim());
    });
  if (names.length > 0) {
    sections.push(`## Alternative Names\n${names.join(", ")}\n`);
  }

  // ISO 639-3 code
  $("dt")
    .filter((_, el) => /iso\s*639/i.test($(el).text()))
    .each((_, el) => {
      const dd = $(el).next("dd");
      if (dd.length) sections.push(`ISO 639-3: ${dd.text().trim()}`);
    });

  // Endangerment status (AES)
  const aesSection = $("dt")
    .filter((_, el) => /endangerment|aes/i.test($(el).text()));
  if (aesSection.length) {
    const dd = aesSection.first().next("dd");
    if (dd.length) {
      sections.push(`\n## Endangerment Status\n${dd.text().trim()}\n`);
    }
  }

  // Location / coordinates
  $("dt")
    .filter((_, el) => /latitude|longitude|location/i.test($(el).text()))
    .each((_, el) => {
      const dd = $(el).next("dd");
      if (dd.length) sections.push(`${$(el).text().trim()}: ${dd.text().trim()}`);
    });

  // References (links to grammars, dictionaries, resources)
  const refs: string[] = [];
  $("#refs, .references, .ref_bibs")
    .find("li, .reference, .bibentry")
    .each((_, el) => {
      const text = $(el).text().trim().slice(0, 300);
      if (text) refs.push(text);
    });

  // Also grab any links in description lists
  $("dd a[href]").each((_, el) => {
    const href = $(el).attr("href");
    const text = $(el).text().trim();
    if (href && text && !href.startsWith("#")) {
      refs.push(`${text}: ${href}`);
    }
  });

  if (refs.length > 0) {
    sections.push(`\n## References\n${refs.slice(0, 50).map((r) => `- ${r}`).join("\n")}\n`);
  }

  // General page content as fallback
  const mainContent = $("main, .container, #main-body, article")
    .first()
    .text()
    .replace(/\s+/g, " ")
    .trim();
  if (mainContent && sections.length < 4) {
    sections.push(`\n## Page Content\n${mainContent.slice(0, 5000)}\n`);
  }

  const content = sections.join("\n");
  if (content.length < 100) {
    throw new Error("Glottolog: insufficient content extracted");
  }

  return {
    content,
    metadata: {
      title,
      type: "archive",
      language: "en",
    },
  };
}
