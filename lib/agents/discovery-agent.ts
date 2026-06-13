import { getErrorMessage } from "../utils/errors";
import Anthropic from "@anthropic-ai/sdk";
import { searchSonar, generateSearchQueries, classifySourceType, DOMAIN_DENYLIST } from "../apis/perplexity.js";
import { getPrioritySources, type PrioritySource } from "./priority-sources.js";
import { brightdataSearch, brightdataScrapeMarkdown, brightDataMCPConfigured } from "../apis/brightdata-mcp.js";
import type { SourceType, LanguageMetadata } from "../types.js";

// ─── Types ───────────────────────────────────────────────────────────────────

export type DiscoveryVia = "perplexity" | "serp_api" | "priority";

export interface DiscoverySource {
  url: string;
  title: string;
  type: SourceType;
  description: string;
  discovered_via: DiscoveryVia;
}

export interface DiscoveryResult {
  sources: DiscoverySource[];
  total_searches: number;
  total_reported: number;
  serp_api_searches: number;
  perplexity_searches: number;
  web_unlocker_scrapes: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MODEL = "claude-haiku-4-5-20251001";
const MAX_TURNS = 12;
const DISCOVERY_TIMEOUT_MS = 150_000; // 2.5 minutes — allows link-following

const SYSTEM_PROMPT_BASE = `You are a linguistic resource discovery agent. Your mission is to find digital resources that contain ACTUAL VOCABULARY DATA (words, definitions, translations, example sentences) for the specified endangered language.

For each resource you find, report it immediately. Include the URL, a descriptive title, the type of resource (dictionary, academic, video, archive, wiki), and a brief description of what linguistic data it likely contains.

PRIORITIZE these source types (most to least valuable):
1. **Online dictionaries** — word lists with definitions and translations (highest value)
2. **University linguistic resource pages** — vocabulary databases, phrasebooks, word lists
3. **Academic papers/PDFs** — dictionaries, wordlists, grammar sketches with vocabulary tables
4. **Community-created word lists** — blogs, social media posts with vocabulary, phrasebooks
5. **Video/audio resources** — YouTube videos with native speakers, podcasts, Forvo pronunciations, audio archives (these are critical for preservation — always report YouTube links and pages with downloadable audio files)
6. **Wiki articles** — Wikipedia, Namu Wiki pages about the language with vocabulary tables

DEPRIORITIZE these (they rarely contain extractable vocabulary):
- News articles *about* the language (e.g., "language is dying" articles)
- Metadata/classification pages (Glottolog, Ethnologue — they list languages, not words)
- Paywalled journal articles without accessible content
- Pages about the *region* rather than the *language*

Search strategy:
1. Search for dictionaries and word lists in English and the language's contact language
2. Search for vocabulary databases and phrasebooks
3. Check university linguistics departments for digital resources
4. Search for community-created learning materials
5. Look for audio/video resources with transcribed content
6. Check academic databases for papers with vocabulary appendices
7. When you find a promising resource with paginated content (dictionaries, word lists), use fetch_page_links to discover sub-pages

Be creative in your searches. Try different spellings, alternative names, and related terms.

IMPORTANT:
- For each promising resource found, call report_source immediately — do not batch them.
- Use fetch_page_links on index pages, dictionaries, or sites with pagination to discover more sub-pages.
- Avoid reporting the same URL twice.
- After exhausting your search strategies, stop calling tools and provide a final summary.`;

function buildSystemPrompt(meta: LanguageMetadata): string {
  const hasBD = brightDataMCPConfigured();
  const hasCountries = hasBD && meta.countries && meta.countries.length > 0;

  if (hasCountries) {
    const country = meta.countries![0];
    return `${SYSTEM_PROMPT_BASE}

TOOL SELECTION — GEO-TARGETED MODE (BrightData SERP API + Web Unlocker available):
- **serp_api_search** (BrightData SERP API): PRIMARY search tool. Use this for your first searches — it searches from inside ${country}, surfacing local university archives, government digitization projects, and regional forums that global search engines miss. Always pass the country parameter ("${country}").
- **search_web** (Perplexity): SECONDARY. Use after SERP API searches to supplement with English-language academic and international linguistic results.
- **web_unlocker_scrape** (BrightData Web Unlocker): Use to verify a page contains vocabulary data before reporting it, or when a page is CAPTCHA-protected or geo-blocked.

Start with serp_api_search using geo-targeted queries in the contact language, then broaden with search_web.`;
  }

  if (hasBD) {
    return `${SYSTEM_PROMPT_BASE}

TOOL SELECTION (BrightData SERP API + Web Unlocker available):
- **search_web** (Perplexity): Default for English-language academic and linguistic searches.
- **serp_api_search** (BrightData SERP API): Use for non-English queries (e.g., in the contact language), geo-targeted searches, or when search_web returns poor results. Supports country targeting.
- **web_unlocker_scrape** (BrightData Web Unlocker): Use to preview a page's content before reporting it (helps verify it actually contains vocabulary data), or when a page might be CAPTCHA-protected or geo-blocked.`;
  }

  return `${SYSTEM_PROMPT_BASE}

Use search_web to run search queries. Review the results carefully and report_source for each promising result.`;
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const BASE_TOOLS: Anthropic.Tool[] = [
  {
    name: "search_web",
    description:
      "Search the web for resources related to an endangered language. Returns a list of URLs, titles, and descriptions found.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description:
            "The search query. Be specific — include the language name, relevant keywords, and try different angles (dictionaries, audio, academic papers, etc.)",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "report_source",
    description:
      "Report a discovered resource. Call this for each promising URL you find. This emits a real-time event to the dashboard and adds the URL to the processing queue.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The direct URL to the resource",
        },
        title: {
          type: "string",
          description: "A descriptive title for the resource",
        },
        type: {
          type: "string",
          enum: ["dictionary", "academic", "video", "archive", "wiki"],
          description: "The type of resource",
        },
        description: {
          type: "string",
          description:
            "Brief description of what linguistic data this resource likely contains",
        },
      },
      required: ["url", "title", "type", "description"],
    },
  },
  {
    name: "fetch_page_links",
    cache_control: { type: "ephemeral" as const },
    description:
      "Fetch a web page and extract all links from it. Use this to explore index pages, follow pagination, or discover sub-pages of a resource you've already found.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "The URL of the page to fetch links from",
        },
        filter: {
          type: "string",
          description:
            "Optional keyword filter — only return links whose text or URL contains this keyword (e.g., 'dictionary', 'word', 'vocab')",
        },
      },
      required: ["url"],
    },
  },
];

const BRIGHTDATA_TOOLS: Anthropic.Tool[] = [
  {
    name: "serp_api_search",
    description:
      "Search the web using BrightData's SERP API with CAPTCHA bypass and geo-targeting. Use for non-English queries (e.g., in the contact language), geo-targeted searches, or when search_web returns poor results.",
    input_schema: {
      type: "object" as const,
      properties: {
        query: {
          type: "string",
          description: "Search query in any language",
        },
        country: {
          type: "string",
          description:
            "Optional 2-letter country code for geo-targeted results (e.g., 'KR', 'JP', 'PG')",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "web_unlocker_scrape",
    cache_control: { type: "ephemeral" as const },
    description:
      "Scrape a web page using BrightData's Web Unlocker as clean markdown with automatic CAPTCHA solving and anti-bot bypass. Use to preview a source's content before reporting it, or when a page might be geo-blocked or CAPTCHA-protected.",
    input_schema: {
      type: "object" as const,
      properties: {
        url: {
          type: "string",
          description: "URL to scrape",
        },
      },
      required: ["url"],
    },
  },
];

function getTools(meta: LanguageMetadata): Anthropic.Tool[] {
  if (brightDataMCPConfigured()) {
    const bdTools = BRIGHTDATA_TOOLS.map((t) => ({ ...t }));
    // Hint the recommended country code in the tool description
    if (meta.countries?.length) {
      bdTools[0] = {
        ...bdTools[0],
        description:
          bdTools[0].description +
          ` Recommended country code for this language: "${meta.countries[0]}".`,
      };
    }
    console.log("[DiscoveryAgent] BrightData MCP tools enabled (geo-targeted:", !!meta.countries?.length, ")");
    return [...BASE_TOOLS, ...bdTools];
  }
  return BASE_TOOLS;
}

// ─── Link extraction helper ─────────────────────────────────────────────────

const FETCH_LINKS_TIMEOUT_MS = 10_000;
const MAX_LINKS = 50;

async function fetchPageLinks(
  url: string,
  filter?: string,
  signal?: AbortSignal
): Promise<{ url: string; text: string }[]> {
  const fetchSignal = signal
    ? AbortSignal.any([AbortSignal.timeout(FETCH_LINKS_TIMEOUT_MS), signal])
    : AbortSignal.timeout(FETCH_LINKS_TIMEOUT_MS);

  const res = await fetch(url, {
    signal: fetchSignal,
    headers: { "User-Agent": "LangSafe/1.0 (language preservation bot)" },
  });

  if (!res.ok) throw new Error(`HTTP ${res.status}`);

  const html = await res.text();

  // Extract <a href="...">text</a> pairs
  const linkRegex = /<a\s[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const seen = new Set<string>();
  const links: { url: string; text: string }[] = [];

  let match;
  while ((match = linkRegex.exec(html)) !== null) {
    let href = match[1];
    const text = match[2].replace(/<[^>]+>/g, "").trim();

    // Skip anchors, javascript, mailto
    if (href.startsWith("#") || href.startsWith("javascript:") || href.startsWith("mailto:")) continue;

    // Resolve relative URLs
    try {
      href = new URL(href, url).href;
    } catch {
      continue;
    }

    if (seen.has(href)) continue;
    seen.add(href);

    // Apply keyword filter
    if (filter) {
      const lowerFilter = filter.toLowerCase();
      if (!href.toLowerCase().includes(lowerFilter) && !text.toLowerCase().includes(lowerFilter)) {
        continue;
      }
    }

    links.push({ url: href, text: text || href });

    if (links.length >= MAX_LINKS) break;
  }

  return links;
}

// ─── Valid source types ──────────────────────────────────────────────────────

const VALID_TYPES = new Set<string>(["dictionary", "academic", "video", "archive", "wiki"]);

function normalizeType(type: string, url: string, description: string): SourceType {
  if (VALID_TYPES.has(type)) return type as SourceType;
  return classifySourceType(url, description);
}

// ─── User prompt builder ─────────────────────────────────────────────────────

function buildUserPrompt(
  meta: LanguageMetadata,
  seedQueries: string[],
  prioritySources: PrioritySource[],
  preSearchSources: DiscoverySource[] = []
): string {
  const parts: string[] = [];

  // Header
  parts.push(
    `Find all digital resources for the endangered language: **${meta.language_name}** (ISO 639-3: ${meta.language_code}).`
  );

  // Optional metadata lines — gives Claude context for smarter searching
  if (meta.native_name) {
    parts.push(`Native name: ${meta.native_name}.`);
  }
  if (meta.glottocode) {
    parts.push(`Glottolog code: ${meta.glottocode}.`);
  }
  if (meta.alternate_names?.length) {
    parts.push(`Also known as: ${meta.alternate_names.join(", ")}.`);
  }
  if (meta.language_family) {
    parts.push(`Language family: ${meta.language_family}.`);
  }
  if (meta.countries?.length) {
    parts.push(`Spoken in: ${meta.countries.join(", ")}.`);
  }
  if (meta.contact_languages?.length) {
    parts.push(`Contact/dominant languages: ${meta.contact_languages.join(", ")}. Search in these languages too.`);
  }
  if (meta.endangerment_status) {
    const label = meta.endangerment_status.replace(/_/g, " ");
    parts.push(`UNESCO status: ${label}.`);
  }
  if (meta.speaker_count != null) {
    parts.push(`Estimated speakers: ~${meta.speaker_count.toLocaleString()}.`);
  }

  // Seed queries
  const seedList = seedQueries.map((q, i) => `${i + 1}. "${q}"`).join("\n");
  parts.push(
    `\nHere are suggested search queries to start with (but create your own too):\n${seedList}`
  );

  // Already-reported sources (priority + SERP API pre-search)
  const alreadyReported = [
    ...prioritySources.map((s) => s.url),
    ...preSearchSources.map((s) => s.url),
  ];
  if (alreadyReported.length > 0) {
    parts.push(
      `\nThe following ${alreadyReported.length} sources have already been reported (do NOT report these again):\n${alreadyReported.map((u) => `- ${u}`).join("\n")}`
    );
  }

  parts.push(
    "\nBegin your systematic search now. Use search_web for each query, then report_source for each NEW promising result you find."
  );

  return parts.join("\n");
}

// ─── Agent runner ────────────────────────────────────────────────────────────

export async function runDiscoveryAgent(
  meta: LanguageMetadata,
  onSourceFound: (source: DiscoverySource) => void,
  externalSignal?: AbortSignal
): Promise<DiscoveryResult> {
  const client = new Anthropic({ maxRetries: 3 });
  const tools = getTools(meta);
  const systemPrompt = buildSystemPrompt(meta);
  const reportedUrls = new Set<string>();
  const sources: DiscoverySource[] = [];
  let searchCount = 0;
  let serpApiSearchCount = 0;
  let perplexitySearchCount = 0;
  let webUnlockerScrapeCount = 0;
  let lastSearchTool: DiscoveryVia = "perplexity";

  // Self-managed timeout: discovery gets 90s max, then returns what it has
  const ac = new AbortController();
  const discoveryTimeout = setTimeout(() => ac.abort(), DISCOVERY_TIMEOUT_MS);
  if (externalSignal) {
    externalSignal.addEventListener("abort", () => ac.abort(), { once: true });
  }
  const signal = ac.signal;

  try {
    // ── Phase 1: Report priority sources instantly ──
    const prioritySources = getPrioritySources(meta);
    for (const ps of prioritySources) {
      const source: DiscoverySource = {
        url: ps.url,
        title: ps.title,
        type: ps.type,
        description: ps.description,
        discovered_via: "priority",
      };
      reportedUrls.add(ps.url);
      sources.push(source);
      onSourceFound(source);
    }

    // ── Phase 1.5: SERP API pre-search (guaranteed BrightData participation) ──
    const seedQueries = generateSearchQueries(meta);

    if (brightDataMCPConfigured() && !signal.aborted) {
      const country = meta.countries?.[0];
      const preSearchQueries = seedQueries.slice(0, 4);

      for (const query of preSearchQueries) {
        if (signal.aborted) break;
        serpApiSearchCount++;
        searchCount++;

        try {
          const resultText = await brightdataSearch(query, country);
          if (!resultText || resultText.trim().length === 0) continue;

          // Extract URLs from SERP results
          const urlMatches = resultText.match(/https?:\/\/[^\s\])<>"]+/g) || [];
          const uniqueUrls = [...new Set(urlMatches)]
            .filter(u => !reportedUrls.has(u) && !DOMAIN_DENYLIST.some(d => u.includes(d)));

          for (const url of uniqueUrls.slice(0, 3)) {
            const type = classifySourceType(url, "");
            const title = url.replace(/^https?:\/\/(www\.)?/, "").split("/")[0];
            const source: DiscoverySource = {
              url,
              title: `[SERP API] ${title}`,
              type,
              description: `Discovered via BrightData SERP API geo-targeted search (${country || "global"})`,
              discovered_via: "serp_api",
            };
            reportedUrls.add(url);
            sources.push(source);
            onSourceFound(source);
          }
        } catch {
          // SERP API failed for this query — continue with next
        }
      }
    }

    // ── Phase 2: Build Claude prompt with metadata context ──
    const userPrompt = buildUserPrompt(meta, seedQueries, prioritySources, sources);

    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: userPrompt },
    ];

    for (let turn = 0; turn < MAX_TURNS; turn++) {
      if (signal.aborted) {
        console.log(`[DiscoveryAgent] Timeout reached after ${turn} turns, returning ${sources.length} sources`);
        break;
      }

      let response: Anthropic.Message;
      try {
        response = await client.messages.create({
          model: MODEL,
          max_tokens: 4096,
          system: [{ type: "text" as const, text: systemPrompt, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
        }, { signal });
      } catch (err) {
        if (signal.aborted) {
          console.log(`[DiscoveryAgent] Timeout during Claude API call, returning ${sources.length} sources`);
          break;
        }
        console.error(`[DiscoveryAgent] Claude API error on turn ${turn}: ${getErrorMessage(err)}`);
        break;
      }

      // Check if Claude is done (no tool calls)
      const hasToolUse = response.content.some((block) => block.type === "tool_use");
      if (!hasToolUse || response.stop_reason === "end_turn") {
        break;
      }

      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        if (signal.aborted) break;

        const input = block.input as Record<string, unknown>;

        if (block.name === "search_web") {
          const query = input.query as string;
          searchCount++;
          perplexitySearchCount++;
          lastSearchTool = "perplexity";

          let resultText: string;
          try {
            const result = await searchSonar(query, signal, DOMAIN_DENYLIST);
            if (result.sources.length === 0) {
              resultText = "No results found for this query. Try a different search.";
            } else {
              // Build a URL→claim lookup from citation references
              const citationByUrl = new Map(
                result.citation_references.map((cr) => [cr.url, cr.claim_text])
              );

              resultText = result.sources
                .map((s, i) => {
                  const citedFor = citationByUrl.get(s.url);
                  const base = `${i + 1}. ${s.title}\n   URL: ${s.url}\n   Type: ${s.source_type}\n   ${s.description}`;
                  return citedFor
                    ? `${base}\n   Cited for: "${citedFor.length > 200 ? citedFor.slice(0, 197) + "..." : citedFor}"`
                    : base;
                })
                .join("\n\n");
            }
          } catch (err) {
            if (signal.aborted) break;
            resultText = `Search failed: ${getErrorMessage(err)}. Try a different query.`;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultText,
          });
        } else if (block.name === "report_source") {
          const url = input.url as string;
          const title = input.title as string;
          const rawType = input.type as string;
          const description = input.description as string;

          if (reportedUrls.has(url)) {
            toolResults.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: `Already reported: "${url}". Skip duplicates.`,
            });
            continue;
          }

          reportedUrls.add(url);
          const source: DiscoverySource = {
            url,
            title,
            type: normalizeType(rawType, url, description),
            description,
            discovered_via: lastSearchTool,
          };

          sources.push(source);
          onSourceFound(source);

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: `Reported: "${title}" (${source.type}). ${sources.length} sources discovered so far.`,
          });
        } else if (block.name === "fetch_page_links") {
          const targetUrl = input.url as string;
          const filter = input.filter as string | undefined;

          let resultText: string;
          try {
            const links = await fetchPageLinks(targetUrl, filter, signal);
            if (links.length === 0) {
              resultText = filter
                ? `No links matching "${filter}" found on ${targetUrl}.`
                : `No links found on ${targetUrl}.`;
            } else {
              resultText = links
                .map((l, i) => `${i + 1}. ${l.text}\n   URL: ${l.url}`)
                .join("\n\n");
            }
          } catch (err) {
            if (signal.aborted) break;
            resultText = `Failed to fetch links from ${targetUrl}: ${getErrorMessage(err)}`;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultText,
          });
        } else if (block.name === "serp_api_search") {
          const query = input.query as string;
          const country = input.country as string | undefined;
          searchCount++;
          serpApiSearchCount++;
          lastSearchTool = "serp_api";

          let resultText: string;
          try {
            resultText = await brightdataSearch(query, country);
            if (!resultText || resultText.trim().length === 0) {
              resultText = "No results found. Try a different query or use search_web instead.";
            }
          } catch (err) {
            if (signal.aborted) break;
            resultText = `BrightData search failed: ${getErrorMessage(err)}. Try search_web instead.`;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultText,
          });
        } else if (block.name === "web_unlocker_scrape") {
          const targetUrl = input.url as string;
          webUnlockerScrapeCount++;

          let resultText: string;
          try {
            const markdown = await brightdataScrapeMarkdown(targetUrl);
            // Truncate for preview — full content will be crawled later by the orchestrator
            const MAX_PREVIEW = 3000;
            if (markdown.length > MAX_PREVIEW) {
              resultText = `${markdown.slice(0, MAX_PREVIEW)}\n\n... (${markdown.length} chars total, truncated for preview)`;
            } else {
              resultText = markdown || "Page returned empty content.";
            }
          } catch (err) {
            if (signal.aborted) break;
            resultText = `Failed to scrape ${targetUrl}: ${getErrorMessage(err)}`;
          }

          toolResults.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: resultText,
          });
        }
      }

      if (signal.aborted) break;

      // Append assistant turn + tool results for the next iteration
      messages.push({ role: "assistant", content: response.content });
      messages.push({ role: "user", content: toolResults });
    }
  } finally {
    clearTimeout(discoveryTimeout);
  }

  return {
    sources,
    total_searches: searchCount,
    total_reported: sources.length,
    serp_api_searches: serpApiSearchCount,
    perplexity_searches: perplexitySearchCount,
    web_unlocker_scrapes: webUnlockerScrapeCount,
  };
}
