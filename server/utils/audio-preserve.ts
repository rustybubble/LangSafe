/**
 * Download external audio files and re-host them on Cloudflare R2
 * for long-term preservation. Matches the R2 Worker upload API
 * used by the Python client (lib/cloudflare.py).
 */

import { getErrorMessage } from "../../lib/utils/errors.js";
import { createHash } from "crypto";
import path from "path";

const R2_WORKER_URL =
  process.env.CLOUDFLARE_WORKER_URL ||
  "https://LangSafe-worker.lvalsote.workers.dev";

const AUDIO_DOWNLOAD_TIMEOUT_MS = 30_000;
const MAX_AUDIO_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

const AUDIO_CONTENT_TYPES = new Set([
  "audio/mpeg",
  "audio/wav",
  "audio/ogg",
  "audio/mp4",
  "audio/aac",
  "audio/flac",
  "audio/webm",
  "audio/x-wav",
  "audio/x-m4a",
]);

/**
 * Download an external audio file and upload it to R2.
 * Returns the R2 URL on success, or null if the download/upload fails.
 * Uses a deterministic key (hash of URL) so re-processing the same source
 * doesn't create duplicates.
 */
export async function preserveAudioToR2(
  externalUrl: string,
  languageCode?: string
): Promise<string | null> {
  // Skip URLs that are already on our R2 worker
  if (externalUrl.includes("LangSafe-worker")) return externalUrl;

  try {
    const res = await fetch(externalUrl, {
      headers: { "User-Agent": "LangSafe/1.0 (language preservation)" },
      signal: AbortSignal.timeout(AUDIO_DOWNLOAD_TIMEOUT_MS),
    });

    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    const isAudio =
      AUDIO_CONTENT_TYPES.has(contentType.split(";")[0].trim()) ||
      /\.(mp3|wav|ogg|m4a|aac|flac|webm)$/i.test(externalUrl);

    if (!isAudio) return null;

    // Check content-length header first (avoid downloading huge files)
    const contentLength = res.headers.get("content-length");
    if (contentLength && parseInt(contentLength) > MAX_AUDIO_SIZE_BYTES) {
      console.warn(`[AudioPreserve] Skipping ${externalUrl}: too large (${contentLength} bytes)`);
      return null;
    }

    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_AUDIO_SIZE_BYTES) {
      console.warn(`[AudioPreserve] Skipping ${externalUrl}: too large (${buffer.length} bytes)`);
      return null;
    }

    // Deterministic R2 key from URL hash to avoid duplicates
    const hash = createHash("sha256").update(externalUrl).digest("hex").slice(0, 12);
    const ext = path.extname(new URL(externalUrl).pathname) || ".mp3";
    const r2Key = languageCode
      ? `preserved/${languageCode}/${hash}${ext}`
      : `preserved/${hash}${ext}`;

    // Upload binary to R2 Worker (same API as Python client in lib/cloudflare.py)
    const uploadRes = await fetch(`${R2_WORKER_URL}/upload`, {
      method: "POST",
      headers: {
        "Content-Type": contentType || "audio/mpeg",
        "X-Filename": r2Key,
      },
      body: buffer,
      signal: AbortSignal.timeout(30_000),
    });

    if (!uploadRes.ok) {
      console.warn(`[AudioPreserve] R2 upload failed for ${externalUrl}: ${uploadRes.status}`);
      return null;
    }

    const uploadData = (await uploadRes.json()) as { url?: string };
    const r2Url = `${R2_WORKER_URL}${uploadData.url || `/audio/${r2Key}`}`;

    console.log(`[AudioPreserve] Preserved ${externalUrl} → ${r2Url}`);
    return r2Url;
  } catch (err) {
    console.warn(`[AudioPreserve] Failed for ${externalUrl}: ${getErrorMessage(err)}`);
    return null;
  }
}
