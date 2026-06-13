/**
 * LangSafe — HeyGen API Integration
 * Generates pronunciation avatar videos for endangered language vocabulary.
 * Server-side only (uses API key).
 */

import { getErrorMessage } from "./utils/errors";

const HEYGEN_API_KEY = process.env.HEYGEN_API_KEY || "";
const CLOUDFLARE_WORKER_URL =
  process.env.CLOUDFLARE_WORKER_URL ||
  "https://LangSafe-worker.lvalsote.workers.dev";

const HEYGEN_BASE = "https://api.heygen.com";
const CACHE_KEY_PREFIX = "heygen:";
const CACHE_TTL = 518_400; // 6 days (HeyGen URLs expire after 7)
const POLL_INTERVAL_MS = 5_000;
const POLL_TIMEOUT_MS = 300_000; // 5 min

// Minho (Korean male avatar, non-premium) + InJoon (Korean male natural voice)
const DEFAULT_AVATAR_ID = "Minho_public_3";
const DEFAULT_VOICE_ID = "9d81087c3f9a45df8c22ab91cf46ca89";

// ---------------------------------------------------------------------------
// KV Cache helpers (calls Cloudflare Worker /cache/:key endpoints)
// ---------------------------------------------------------------------------

async function kvGet(key: string): Promise<string | null> {
  try {
    const res = await fetch(
      `${CLOUDFLARE_WORKER_URL}/cache/${encodeURIComponent(key)}`
    );
    if (!res.ok) return null;
    const data = (await res.json()) as { value?: string };
    return typeof data.value === "string" ? data.value : null;
  } catch {
    return null;
  }
}

async function kvSet(key: string, value: string, ttl = CACHE_TTL): Promise<void> {
  try {
    await fetch(
      `${CLOUDFLARE_WORKER_URL}/cache/${encodeURIComponent(key)}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value, ttl }),
      }
    );
  } catch {
    // Non-critical — log but don't fail
  }
}

// ---------------------------------------------------------------------------
// HeyGen API helpers
// ---------------------------------------------------------------------------

function heygenHeaders(): Record<string, string> {
  if (!HEYGEN_API_KEY) {
    throw new Error("HEYGEN_API_KEY is not configured");
  }
  return {
    "X-Api-Key": HEYGEN_API_KEY,
    "Content-Type": "application/json",
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Voice Resolution (auto-select by language)
// ---------------------------------------------------------------------------

let voiceCache: { voices: HeyGenVoice[]; fetchedAt: number } | null = null;
const VOICE_CACHE_TTL = 3600_000; // 1 hour

async function resolveVoiceForLanguage(language?: string): Promise<string> {
  if (!language) return DEFAULT_VOICE_ID;

  // Refresh voice list if stale
  if (!voiceCache || Date.now() - voiceCache.fetchedAt > VOICE_CACHE_TTL) {
    try {
      const voices = await listVoices();
      voiceCache = { voices, fetchedAt: Date.now() };
    } catch {
      return DEFAULT_VOICE_ID;
    }
  }

  // Find a voice matching the language
  const match = voiceCache.voices.find(
    (v) => v.language.toLowerCase().includes(language.toLowerCase())
  );
  return match?.voice_id || DEFAULT_VOICE_ID;
}

// ---------------------------------------------------------------------------
// Video Generation
// ---------------------------------------------------------------------------

export interface PronunciationVideoOptions {
  audio_url?: string;
  avatar_id?: string;
  voice_id?: string;
  language?: string;  // e.g. "Korean", "Filipino" — for voice selection and cache partitioning
}

export interface PronunciationVideoResult {
  video_id: string;
  video_url: string;
  word: string;
  cached: boolean;
}

/**
 * Generate a pronunciation avatar video for a word.
 * Checks KV cache first; on miss, creates via HeyGen API and polls until done.
 */
export async function generatePronunciationVideo(
  word: string,
  options: PronunciationVideoOptions = {}
): Promise<PronunciationVideoResult> {
  const cacheKey = `${CACHE_KEY_PREFIX}${options.language || "default"}:${word}`;

  // 1. Check cache
  const cached = await kvGet(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as { video_id: string; video_url: string };
      return { ...parsed, word, cached: true };
    } catch {
      // Corrupted cache entry — regenerate
    }
  }

  // 2. Build voice config
  const avatarId = options.avatar_id || DEFAULT_AVATAR_ID;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let voice: Record<string, any>;

  if (options.audio_url) {
    voice = { type: "audio", audio_url: options.audio_url };
  } else {
    const voiceId = options.voice_id || await resolveVoiceForLanguage(options.language);
    voice = {
      type: "text",
      input_text: word,
      ...(voiceId ? { voice_id: voiceId } : {}),
    };
  }

  // 3. Create video
  const createRes = await fetch(`${HEYGEN_BASE}/v2/video/generate`, {
    method: "POST",
    headers: heygenHeaders(),
    body: JSON.stringify({
      video_inputs: [
        {
          character: { type: "avatar", avatar_id: avatarId },
          voice,
        },
      ],
      dimension: { width: 480, height: 480 },
    }),
  });

  if (!createRes.ok) {
    const err = await createRes.text();
    throw new Error(`HeyGen video creation failed (${createRes.status}): ${err}`);
  }

  const createData = (await createRes.json()) as {
    error: string | null;
    data: { video_id: string };
  };

  if (createData.error) {
    throw new Error(`HeyGen error: ${createData.error}`);
  }

  const videoId = createData.data.video_id;

  // 4. Poll for completion
  const startTime = Date.now();

  while (Date.now() - startTime < POLL_TIMEOUT_MS) {
    await sleep(POLL_INTERVAL_MS);

    const statusRes = await fetch(
      `${HEYGEN_BASE}/v1/video_status.get?video_id=${videoId}`,
      { headers: heygenHeaders() }
    );

    if (!statusRes.ok) continue;

    const statusData = (await statusRes.json()) as {
      data: {
        status: string;
        video_url?: string;
      };
    };

    const status = statusData.data.status;

    if (status === "completed" && statusData.data.video_url) {
      const videoUrl = statusData.data.video_url;

      // Cache the result
      await kvSet(
        cacheKey,
        JSON.stringify({ video_id: videoId, video_url: videoUrl })
      );

      return { video_id: videoId, video_url: videoUrl, word, cached: false };
    }

    if (status === "failed") {
      throw new Error(`HeyGen video generation failed for "${word}"`);
    }
  }

  throw new Error(
    `HeyGen video generation timed out after ${POLL_TIMEOUT_MS / 1000}s for "${word}"`
  );
}

// ---------------------------------------------------------------------------
// Batch Generation
// ---------------------------------------------------------------------------

/**
 * Generate pronunciation videos for multiple words.
 * Skips words already cached in KV. Returns a map of word → video URL.
 */
export async function batchGeneratePronunciations(
  words: string[],
  options: PronunciationVideoOptions = {}
): Promise<Map<string, string>> {
  const results = new Map<string, string>();

  for (const word of words) {
    try {
      const result = await generatePronunciationVideo(word, options);
      results.set(word, result.video_url);
      console.log(
        `[HeyGen] ${result.cached ? "cached" : "generated"}: ${word} → ${result.video_url}`
      );
    } catch (err) {
      console.error(`[HeyGen] Failed for "${word}":`, getErrorMessage(err));
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Discovery Utilities
// ---------------------------------------------------------------------------

export interface HeyGenVoice {
  voice_id: string;
  language: string;
  gender: string;
  name: string;
  preview_audio?: string;
}

export interface HeyGenAvatar {
  avatar_id: string;
  avatar_name: string;
  gender: string;
  preview_image_url?: string;
}

/** List available voices, optionally filtered by language name (e.g. "Korean", "Filipino"). */
export async function listVoices(language?: string): Promise<HeyGenVoice[]> {
  const res = await fetch(`${HEYGEN_BASE}/v2/voices`, {
    headers: heygenHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to list voices: ${res.status}`);
  }

  const data = (await res.json()) as {
    data: { voices: HeyGenVoice[] };
  };

  if (!language) return data.data.voices;
  return data.data.voices.filter(
    (v) => v.language.toLowerCase().includes(language.toLowerCase())
  );
}

/** List available avatars. Use to find the right avatar_id. */
export async function listAvatars(): Promise<HeyGenAvatar[]> {
  const res = await fetch(`${HEYGEN_BASE}/v2/avatars`, {
    headers: heygenHeaders(),
  });

  if (!res.ok) {
    throw new Error(`Failed to list avatars: ${res.status}`);
  }

  const data = (await res.json()) as {
    data: { avatars: HeyGenAvatar[] };
  };

  return data.data.avatars;
}
