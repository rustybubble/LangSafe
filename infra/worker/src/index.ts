/**
 * LangSafe — Cloudflare Worker
 * Edge processing for audio storage (R2), caching (KV), and language detection.
 */

export interface Env {
  AUDIO_BUCKET: R2Bucket;
  CACHE: KVNamespace;
  ALLOWED_ORIGINS: string;
}

// ---------------------------------------------------------------------------
// CORS
// ---------------------------------------------------------------------------

function getAllowedOrigins(env: Env): string[] {
  return env.ALLOWED_ORIGINS.split(",").map((o) => o.trim());
}

function getCorsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin") || "";
  const allowed = getAllowedOrigins(env);
  const isAllowed = allowed.includes(origin) || allowed.includes("*");

  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : allowed[0],
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, X-Filename, Authorization",
    "Access-Control-Max-Age": "86400",
  };
}

function handleOptions(request: Request, env: Env): Response {
  return new Response(null, { status: 204, headers: getCorsHeaders(request, env) });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(data: unknown, status: number, request: Request, env: Env): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...getCorsHeaders(request, env),
    },
  });
}

function matchRoute(pathname: string, pattern: string): Record<string, string> | null {
  const patternParts = pattern.split("/");
  const pathParts = pathname.split("/");

  if (patternParts.length !== pathParts.length) return null;

  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    if (patternParts[i].startsWith(":")) {
      params[patternParts[i].slice(1)] = decodeURIComponent(pathParts[i]);
    } else if (patternParts[i] !== pathParts[i]) {
      return null;
    }
  }
  return params;
}

// ---------------------------------------------------------------------------
// Route Handlers
// ---------------------------------------------------------------------------

/**
 * POST /upload
 * Upload a file to R2.
 * Headers: Content-Type, X-Filename
 * Body: binary file data
 */
async function handleUpload(request: Request, env: Env): Promise<Response> {
  const filename = request.headers.get("X-Filename") || request.headers.get("X-Key");
  if (!filename) {
    return jsonResponse({ error: "X-Filename or X-Key header is required" }, 400, request, env);
  }

  const contentType = request.headers.get("Content-Type") || "application/octet-stream";
  const body = await request.arrayBuffer();

  if (!body || body.byteLength === 0) {
    return jsonResponse({ error: "Request body is empty" }, 400, request, env);
  }

  // Use filename as-is for the R2 key (supports paths like "audio/videoId/chunk_000.wav")
  const key = filename;

  await env.AUDIO_BUCKET.put(key, body, {
    httpMetadata: { contentType },
    customMetadata: { originalFilename: filename, uploadedAt: new Date().toISOString() },
  });

  return jsonResponse(
    {
      key,
      url: `/audio/${key}`,
      size: body.byteLength,
      contentType,
    },
    200,
    request,
    env
  );
}

/**
 * GET /audio/:key
 * Serve an audio file from R2 with proper CORS and Content-Type.
 */
async function handleGetAudio(key: string, request: Request, env: Env): Promise<Response> {
  const object = await env.AUDIO_BUCKET.get(key);

  if (!object) {
    return jsonResponse({ error: "File not found" }, 404, request, env);
  }

  const headers = new Headers(getCorsHeaders(request, env));
  headers.set("Content-Type", object.httpMetadata?.contentType || "audio/mpeg");
  headers.set("Content-Length", object.size.toString());
  headers.set("Cache-Control", "public, max-age=31536000, immutable");
  headers.set("Accept-Ranges", "bytes");

  return new Response(object.body, { status: 200, headers });
}

/**
 * GET /cache/:key
 * Read a value from KV cache.
 */
async function handleCacheGet(key: string, request: Request, env: Env): Promise<Response> {
  const value = await env.CACHE.get(key);

  if (value === null) {
    return jsonResponse({ error: "Cache miss", key }, 404, request, env);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    parsed = value;
  }

  return jsonResponse({ key, value: parsed }, 200, request, env);
}

/**
 * POST /cache/:key
 * Write a value to KV cache with TTL (default 1 hour).
 * Body: { "value": any, "ttl": number (optional, seconds) }
 */
async function handleCacheSet(key: string, request: Request, env: Env): Promise<Response> {
  let body: { value: unknown; ttl?: number };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, request, env);
  }

  if (body.value === undefined) {
    return jsonResponse({ error: "\"value\" field is required" }, 400, request, env);
  }

  const ttl = body.ttl || 3600; // default 1 hour
  const serialized = typeof body.value === "string" ? body.value : JSON.stringify(body.value);

  await env.CACHE.put(key, serialized, { expirationTtl: ttl });

  return jsonResponse({ key, ttl, stored: true }, 200, request, env);
}

/**
 * POST /detect-language
 * Detect if text is English, Korean, or Jeju.
 * Body: { "text": string }
 */
async function handleDetectLanguage(request: Request, env: Env): Promise<Response> {
  let body: { text: string };

  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: "Invalid JSON body" }, 400, request, env);
  }

  if (!body.text || typeof body.text !== "string") {
    return jsonResponse({ error: "\"text\" field is required" }, 400, request, env);
  }

  const result = detectLanguage(body.text);
  return jsonResponse(result, 200, request, env);
}

/**
 * GET /runs/:language_code
 * List pipeline run artifacts from R2, newest first.
 */
async function handleListRuns(languageCode: string, request: Request, env: Env): Promise<Response> {
  const prefix = `runs/${languageCode}/`;
  const listed = await env.AUDIO_BUCKET.list({ prefix });

  const runs = listed.objects
    .map((obj) => ({
      key: obj.key,
      uploaded: obj.uploaded.toISOString(),
      size: obj.size,
    }))
    .sort((a, b) => b.uploaded.localeCompare(a.uploaded));

  return jsonResponse(runs, 200, request, env);
}

/**
 * GET /runs/:language_code/:id.json
 * Retrieve a specific pipeline run artifact from R2.
 */
async function handleGetRun(key: string, request: Request, env: Env): Promise<Response> {
  const object = await env.AUDIO_BUCKET.get(key);

  if (!object) {
    return jsonResponse({ error: "Run artifact not found" }, 404, request, env);
  }

  const headers = new Headers(getCorsHeaders(request, env));
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "public, max-age=31536000, immutable");

  return new Response(object.body, { status: 200, headers });
}

// ---------------------------------------------------------------------------
// Language Detection Heuristic
// ---------------------------------------------------------------------------

function detectLanguage(text: string): { language: string; confidence: number; details: string } {
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars === 0) {
    return { language: "en", confidence: 0, details: "Empty text" };
  }

  // Script detection patterns (checked after Hangul/Jeju for backward compat)
  const scripts: { pattern: RegExp; language: string; name: string }[] = [
    { pattern: /[\u0E00-\u0E7F]/g, language: "th", name: "Thai" },
    { pattern: /[\u0600-\u06FF\u0750-\u077F]/g, language: "ar", name: "Arabic" },
    { pattern: /[\u0900-\u097F]/g, language: "hi", name: "Devanagari" },
    { pattern: /[\u4E00-\u9FFF\u3400-\u4DBF]/g, language: "zh", name: "CJK" },
    { pattern: /[\u3040-\u309F\u30A0-\u30FF]/g, language: "ja", name: "Japanese" },
    { pattern: /[\u0400-\u04FF]/g, language: "ru", name: "Cyrillic" },
    { pattern: /[\u0B80-\u0BFF]/g, language: "ta", name: "Tamil" },
    { pattern: /[\u0980-\u09FF]/g, language: "bn", name: "Bengali" },
    { pattern: /[\u1000-\u109F]/g, language: "my", name: "Myanmar" },
    { pattern: /[\u1780-\u17FF]/g, language: "km", name: "Khmer" },
    { pattern: /[\u1200-\u137F]/g, language: "am", name: "Ethiopic" },
    { pattern: /[\u10A0-\u10FF]/g, language: "ka", name: "Georgian" },
    { pattern: /[\u0A80-\u0AFF]/g, language: "gu", name: "Gujarati" },
    { pattern: /[\u0C00-\u0C7F]/g, language: "te", name: "Telugu" },
  ];

  // Hangul detection (Korean / Jeju)
  const hangulRegex = /[\uAC00-\uD7AF]/g;
  const hangulJamoRegex = /[\u1100-\u11FF\u3130-\u318F]/g;
  const jejuAraeA = /\u119E/g;
  const jejuPatterns = /(?:하르방|할망|마씸|우다|수다|ᆞ|ㅿ|msim|하영|혼저|감수광)/g;

  const hangulMatches = text.match(hangulRegex) || [];
  const jamoMatches = text.match(hangulJamoRegex) || [];
  const koreanCharCount = hangulMatches.length + jamoMatches.length;
  const koreanRatio = koreanCharCount / totalChars;

  // Check for Jeju-specific markers within Korean text
  const araeAMatches = text.match(jejuAraeA) || [];
  const jejuMatches = text.match(jejuPatterns) || [];
  if (jejuMatches.length > 0 || araeAMatches.length > 0) {
    const jejuSignals = jejuMatches.length + araeAMatches.length;
    return {
      language: "jje",
      confidence: Math.round(Math.min(0.95, 0.6 + jejuSignals * 0.1) * 1000) / 1000,
      details: `Found ${jejuSignals} Jeju-specific marker(s) in Korean text`,
    };
  }

  // Korean text (Hangul dominant)
  if (koreanRatio > 0.3) {
    return {
      language: "ko",
      confidence: Math.round(Math.min(0.95, koreanRatio + 0.2) * 1000) / 1000,
      details: `${Math.round(koreanRatio * 100)}% Hangul characters`,
    };
  }

  // Check other scripts
  for (const { pattern, language, name } of scripts) {
    const matches = text.match(pattern) || [];
    const ratio = matches.length / totalChars;
    if (ratio > 0.3) {
      return {
        language,
        confidence: Math.round(Math.min(0.95, ratio + 0.2) * 1000) / 1000,
        details: `${Math.round(ratio * 100)}% ${name} characters`,
      };
    }
  }

  // Default: English (Latin script)
  return {
    language: "en",
    confidence: Math.round(Math.max(0.5, 1 - koreanRatio * 2) * 1000) / 1000,
    details: "Latin script or insufficient non-Latin characters",
  };
}

// ---------------------------------------------------------------------------
// Router
// ---------------------------------------------------------------------------

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return handleOptions(request, env);
    }

    const url = new URL(request.url);
    const { pathname } = url;
    const method = request.method;

    // POST /upload
    if (method === "POST" && pathname === "/upload") {
      return handleUpload(request, env);
    }

    // GET /audio/* (key can contain slashes, e.g., /audio/video_id/chunk_000.wav)
    if (method === "GET" && pathname.startsWith("/audio/")) {
      const key = decodeURIComponent(pathname.slice("/audio/".length));
      return handleGetAudio(key, request, env);
    }

    // GET /cache/:key
    const cacheGetMatch = matchRoute(pathname, "/cache/:key");
    if (method === "GET" && cacheGetMatch) {
      return handleCacheGet(cacheGetMatch.key, request, env);
    }

    // POST /cache/:key
    const cacheSetMatch = matchRoute(pathname, "/cache/:key");
    if (method === "POST" && cacheSetMatch) {
      return handleCacheSet(cacheSetMatch.key, request, env);
    }

    // GET /runs/:language_code — list pipeline run artifacts
    const runsListMatch = matchRoute(pathname, "/runs/:language_code");
    if (method === "GET" && runsListMatch) {
      return handleListRuns(runsListMatch.language_code, request, env);
    }

    // GET /runs/* — retrieve a specific run artifact
    if (method === "GET" && pathname.startsWith("/runs/") && pathname.endsWith(".json")) {
      const key = decodeURIComponent(pathname.slice(1)); // strip leading "/"
      return handleGetRun(key, request, env);
    }

    // POST /detect-language
    if (method === "POST" && pathname === "/detect-language") {
      return handleDetectLanguage(request, env);
    }

    // Health check
    if (method === "GET" && pathname === "/") {
      return jsonResponse(
        { service: "LangSafe-worker", status: "ok", version: "1.0.0" },
        200,
        request,
        env
      );
    }

    return jsonResponse({ error: "Not found" }, 404, request, env);
  },
};
