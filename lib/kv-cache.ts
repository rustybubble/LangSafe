/**
 * Shared KV cache helpers for multi-language support.
 * Uses the Cloudflare Worker's generic /cache/:key endpoints.
 */

import { createHash } from "crypto";

const CLOUDFLARE_WORKER_URL = process.env.CLOUDFLARE_WORKER_URL;

// ─── TTL Constants (seconds) ────────────────────────────────────────────────

export const TTL = {
  LANGUAGE: 3600,   // 1 hour — individual language metadata
  SEARCH: 1800,     // 30 min — search results
  STATS: 300,       // 5 min  — preservation / global stats
  GEO: 600,         // 10 min — geo viewport results
  OVERVIEW: 86400,  // 24 hours — AI-generated language overviews
  DISCOVERY: 86400,  // 24 hours — AI source discovery responses
} as const;

// ─── Cache Key Builders ─────────────────────────────────────────────────────

export const cacheKeys = {
  /** Language metadata by glottocode */
  language: (glottocode: string) => `lang:${glottocode}`,

  /** Search results by language code + query hash */
  search: (langCode: string, queryHash: string) =>
    `search:${langCode}:${queryHash}`,

  /** Preservation stats — per-language or global */
  stats: (langCode?: string) =>
    langCode ? `stats:${langCode}` : "stats:global",

  /** AI-generated language overview by glottocode */
  overview: (glottocode: string) => `overview:${glottocode}`,

  /** Geo viewport — coords rounded to 1 decimal */
  geo: (north: number, south: number, east: number, west: number) =>
    `geo:${north.toFixed(1)}:${south.toFixed(1)}:${east.toFixed(1)}:${west.toFixed(1)}`,

  /** AI source discovery response by query hash */
  discovery: (queryHash: string) => `discovery:${queryHash}`,

  /** Grammar pattern stats — per-language or global */
  grammarStats: (langCode?: string) =>
    langCode ? `grammar-stats:${langCode}` : "grammar-stats:global",

  /** Significant terms / insights by query hash */
  insights: (queryHash: string) => `insights:${queryHash}`,

  /** Source list — per-language or global */
  sources: (langCode?: string) =>
    langCode ? `sources:${langCode}` : "sources:global",
};

// ─── Query Hash ─────────────────────────────────────────────────────────────

/**
 * Create a short hash from query/filter parameters for use as a cache key.
 * Sorts keys for determinism.
 */
export function hashQuery(params: Record<string, string | undefined>): string {
  const sorted = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== "")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`)
    .join("&");

  return createHash("sha256").update(sorted).digest("hex").slice(0, 12);
}

// ─── KV Get / Set ───────────────────────────────────────────────────────────

/**
 * Read a value from KV cache via the Cloudflare Worker.
 * Returns null on cache miss or if the worker is unavailable.
 */
export async function kvGet<T>(key: string): Promise<T | null> {
  if (!CLOUDFLARE_WORKER_URL) return null;

  try {
    const res = await fetch(
      `${CLOUDFLARE_WORKER_URL}/cache/${encodeURIComponent(key)}`,
      { signal: AbortSignal.timeout(3_000) }
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: T };
    return data.value ?? null;
  } catch {
    return null;
  }
}

/**
 * Write a value to KV cache via the Cloudflare Worker.
 * Non-critical — silently fails if the worker is unavailable.
 */
export async function kvSet(
  key: string,
  value: unknown,
  ttl: number
): Promise<void> {
  if (!CLOUDFLARE_WORKER_URL) return;

  try {
    await fetch(
      `${CLOUDFLARE_WORKER_URL}/cache/${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, ttl }),
        signal: AbortSignal.timeout(3_000),
      }
    );
  } catch {
    // Non-critical — cache write failure doesn't affect correctness
  }
}
