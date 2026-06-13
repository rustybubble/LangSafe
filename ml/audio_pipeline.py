"""
LangSafe — Audio Processing Pipeline
Downloads YouTube audio, chunks it, uploads to R2, transcribes via RunPod Whisper,
and corrects transcription for endangered languages using Claude.
"""

import os
import sys
import re
import json
import time
import uuid
import hashlib
import shutil
import logging
import argparse
import tempfile
from typing import Optional
from concurrent.futures import ThreadPoolExecutor, as_completed

import requests

# Add project root to path for lib imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

from lib.cloudflare import upload_to_r2, set_cache

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("audio_pipeline")

# ---------------------------------------------------------------------------
# Configuration (from environment variables)
# ---------------------------------------------------------------------------
RUNPOD_ENDPOINT_ID = os.environ.get("RUNPOD_ENDPOINT_ID", "")
RUNPOD_API_KEY = os.environ.get("RUNPOD_API_KEY", "")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
CLOUDFLARE_WORKER_URL = os.environ.get(
    "CLOUDFLARE_WORKER_URL", "https://LangSafe-worker.lvalsote.workers.dev"
)
WS_URL = os.environ.get("WS_URL", "http://localhost:3001")

RUNPOD_BASE = "https://api.runpod.ai/v2"
RUNPOD_POLL_INTERVAL = 2  # seconds
RUNPOD_TIMEOUT = 300  # 5 min per chunk max

# ---------------------------------------------------------------------------
# Contact Language → Whisper Language Code Mapping
# Whisper uses ISO 639-1 codes; endangered languages aren't supported directly,
# so we transcribe using the dominant contact language as a proxy.
# ---------------------------------------------------------------------------

CONTACT_LANG_TO_WHISPER: dict[str, str] = {
    "Korean": "ko", "Japanese": "ja", "Mandarin Chinese": "zh",
    "Thai": "th", "Vietnamese": "vi", "Khmer": "km",
    "Burmese": "my", "Malay": "ms", "Indonesian": "id",
    "Filipino": "tl", "Hindi": "hi", "Bengali": "bn",
    "Tamil": "ta", "Nepali": "ne", "Sinhala": "si",
    "Russian": "ru", "Arabic": "ar", "Persian": "fa",
    "Turkish": "tr", "French": "fr", "Spanish": "es",
    "Portuguese": "pt", "English": "en", "German": "de",
    "Italian": "it", "Dutch": "nl", "Polish": "pl",
    "Swedish": "sv", "Norwegian": "no", "Danish": "da",
    "Finnish": "fi", "Greek": "el", "Hebrew": "he",
    "Swahili": "sw", "Amharic": "am", "Hausa": "ha",
    "Yoruba": "yo", "Zulu": "zu", "Afrikaans": "af",
    "Urdu": "ur", "Gujarati": "gu", "Marathi": "mr",
    "Telugu": "te", "Kannada": "kn", "Malayalam": "ml",
    "Punjabi": "pa", "Lao": "lo", "Georgian": "ka",
    "Armenian": "hy", "Azerbaijani": "az", "Kazakh": "kk",
    "Uzbek": "uz", "Mongolian": "mn", "Maori": "mi",
    "Welsh": "cy", "Catalan": "ca", "Galician": "gl",
    "Basque": "eu", "Irish": "ga", "Icelandic": "is",
    "Estonian": "et", "Latvian": "lv", "Lithuanian": "lt",
    "Czech": "cs", "Slovak": "sk", "Slovenian": "sl",
    "Croatian": "hr", "Serbian": "sr", "Bosnian": "bs",
    "Bulgarian": "bg", "Romanian": "ro", "Ukrainian": "uk",
    "Belarusian": "be", "Hungarian": "hu", "Albanian": "sq",
    "Macedonian": "mk", "Maltese": "mt",
}


def resolve_whisper_language(contact_languages: Optional[list] = None, language_code: str = "en") -> str:
    """Derive the best Whisper language code from contact languages."""
    if contact_languages:
        for lang in contact_languages:
            code = CONTACT_LANG_TO_WHISPER.get(lang)
            if code:
                return code
    # Fallback: if the language_code itself is a 2-letter code Whisper knows, use it
    # Otherwise default to "en"
    return language_code if len(language_code) == 2 else "en"


# ---------------------------------------------------------------------------
# WebSocket Event Emitter
# ---------------------------------------------------------------------------

def emit_event(agent: str, action: str, status: str, data: Optional[dict] = None):
    """Emit an AgentEvent to the WebSocket server for frontend display."""
    event = {
        "id": str(uuid.uuid4()),
        "agent": agent,
        "action": action,
        "status": status,
        "data": data or {},
        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    try:
        requests.post(f"{WS_URL}/emit", json=event, timeout=5)
    except Exception:
        # Don't fail the pipeline if event emission fails
        logger.debug(f"Failed to emit event: {action}")


# ---------------------------------------------------------------------------
# Function 1: Download YouTube Audio
# ---------------------------------------------------------------------------

def extract_video_id(url: str) -> str:
    """Extract video ID from a YouTube URL."""
    patterns = [
        r"(?:v=|/v/|youtu\.be/)([a-zA-Z0-9_-]{11})",
        r"(?:embed/)([a-zA-Z0-9_-]{11})",
        r"(?:shorts/)([a-zA-Z0-9_-]{11})",
    ]
    for pattern in patterns:
        match = re.search(pattern, url)
        if match:
            return match.group(1)
    raise ValueError(f"Could not extract video ID from URL: {url}")


def download_youtube_audio(video_url: str, output_dir: str) -> str:
    """
    Download audio from a YouTube video and convert to 16kHz mono WAV.

    Args:
        video_url: YouTube video URL.
        output_dir: Directory to save the downloaded audio.

    Returns:
        Path to the downloaded WAV file.

    Raises:
        ValueError: If video ID cannot be extracted.
        RuntimeError: If download fails (private, age-restricted, unavailable).
    """
    import yt_dlp

    video_id = extract_video_id(video_url)
    output_path = os.path.join(output_dir, f"{video_id}.wav")

    logger.info(f"Downloading audio from {video_url} (ID: {video_id})")

    ydl_opts = {
        "format": "bestaudio/best",
        "outtmpl": os.path.join(output_dir, f"{video_id}.%(ext)s"),
        "postprocessors": [
            {
                "key": "FFmpegExtractAudio",
                "preferredcodec": "wav",
                "preferredquality": "0",
            }
        ],
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            ydl.download([video_url])
    except yt_dlp.utils.DownloadError as e:
        error_msg = str(e).lower()
        if "private" in error_msg:
            raise RuntimeError(f"Video is private: {video_url}")
        elif "age" in error_msg:
            raise RuntimeError(f"Video is age-restricted: {video_url}")
        elif "unavailable" in error_msg or "not available" in error_msg:
            raise RuntimeError(f"Video is unavailable: {video_url}")
        else:
            raise RuntimeError(f"Failed to download video: {e}")

    if not os.path.exists(output_path):
        # yt-dlp might have saved with a different extension
        for ext in ["wav", "webm", "m4a", "mp3", "opus"]:
            candidate = os.path.join(output_dir, f"{video_id}.{ext}")
            if os.path.exists(candidate):
                output_path = candidate
                break
        else:
            raise RuntimeError(f"Downloaded file not found in {output_dir}")

    # Convert to 16kHz mono WAV for Whisper
    from pydub import AudioSegment

    logger.info("Converting to 16kHz mono WAV")
    audio = AudioSegment.from_file(output_path)
    audio = audio.set_frame_rate(16000).set_channels(1).set_sample_width(2)

    final_path = os.path.join(output_dir, f"{video_id}_16k.wav")
    audio.export(final_path, format="wav")

    # Clean up original if different
    if output_path != final_path and os.path.exists(output_path):
        os.remove(output_path)

    logger.info(f"Audio saved: {final_path} ({audio.duration_seconds:.1f}s)")
    return final_path


# ---------------------------------------------------------------------------
# Function 2: Chunk Audio
# ---------------------------------------------------------------------------

def chunk_audio(file_path: str, chunk_seconds: int = 30) -> list:
    """
    Split an audio file into fixed-length chunks.

    Args:
        file_path: Path to the WAV file.
        chunk_seconds: Length of each chunk in seconds.

    Returns:
        List of file paths to the chunk files.
    """
    from pydub import AudioSegment

    logger.info(f"Chunking {file_path} into {chunk_seconds}s segments")

    audio = AudioSegment.from_file(file_path)
    chunk_ms = chunk_seconds * 1000
    total_ms = len(audio)

    output_dir = os.path.dirname(file_path)
    basename = os.path.splitext(os.path.basename(file_path))[0]

    chunk_paths = []
    i = 0
    offset = 0

    while offset < total_ms:
        chunk = audio[offset : offset + chunk_ms]
        chunk_path = os.path.join(output_dir, f"{basename}_chunk_{i:03d}.wav")
        chunk.export(chunk_path, format="wav")
        chunk_paths.append(chunk_path)
        offset += chunk_ms
        i += 1

    logger.info(f"Created {len(chunk_paths)} chunks")
    return chunk_paths


# ---------------------------------------------------------------------------
# Function 3: Upload Chunks to R2
# ---------------------------------------------------------------------------

def upload_chunks_to_r2(chunk_paths: list, video_id: str) -> list:
    """
    Upload audio chunks to Cloudflare R2.

    Args:
        chunk_paths: List of local file paths to upload.
        video_id: YouTube video ID (used for key prefix).

    Returns:
        List of R2 URLs for each uploaded chunk.
    """
    logger.info(f"Uploading {len(chunk_paths)} chunks to R2")

    r2_urls = []
    for i, path in enumerate(chunk_paths):
        key = f"{video_id}/chunk_{i:03d}.wav"
        try:
            relative_url = upload_to_r2(path, key)
            full_url = f"{CLOUDFLARE_WORKER_URL}{relative_url}"
            r2_urls.append(full_url)
            logger.info(f"  Uploaded chunk {i}: {key}")
        except Exception as e:
            logger.error(f"  Failed to upload chunk {i}: {e}")
            raise RuntimeError(f"R2 upload failed for chunk {i}: {e}")

    return r2_urls


# ---------------------------------------------------------------------------
# Function 4: Transcribe Chunks via RunPod
# ---------------------------------------------------------------------------

def _runpod_request(audio_url: str, language: str = "en") -> dict:
    """Send a single synchronous transcription request to RunPod (used by /transcribe endpoint)."""
    url = f"{RUNPOD_BASE}/{RUNPOD_ENDPOINT_ID}/runsync"
    headers = {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "input": {
            "audio_url": audio_url,
            "language": language,
            "task": "transcribe",
        }
    }

    resp = requests.post(url, json=payload, headers=headers, timeout=RUNPOD_TIMEOUT)
    resp.raise_for_status()
    data = resp.json()

    # If completed synchronously
    if data.get("status") == "COMPLETED":
        return data

    # Otherwise poll
    job_id = data.get("id")
    if not job_id:
        return data

    status_url = f"{RUNPOD_BASE}/{RUNPOD_ENDPOINT_ID}/status/{job_id}"
    start_time = time.time()

    while time.time() - start_time < RUNPOD_TIMEOUT:
        resp = requests.get(status_url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") == "COMPLETED":
            return data
        elif data.get("status") == "FAILED":
            return data

        time.sleep(RUNPOD_POLL_INTERVAL)

    raise TimeoutError(f"RunPod job {job_id} timed out after {RUNPOD_TIMEOUT}s")


def _submit_runpod_job(audio_url: str, language: str = "en") -> str:
    """Submit a transcription job to RunPod /run (async). Returns job_id."""
    url = f"{RUNPOD_BASE}/{RUNPOD_ENDPOINT_ID}/run"
    headers = {
        "Authorization": f"Bearer {RUNPOD_API_KEY}",
        "Content-Type": "application/json",
    }
    payload = {
        "input": {
            "audio_url": audio_url,
            "language": language,
            "task": "transcribe",
        }
    }
    resp = requests.post(url, json=payload, headers=headers, timeout=30)
    resp.raise_for_status()
    data = resp.json()
    job_id = data.get("id")
    if not job_id:
        raise RuntimeError(f"RunPod /run did not return a job ID: {data}")
    return job_id


def _poll_runpod_job(job_id: str) -> dict:
    """Poll a RunPod job until COMPLETED or FAILED. Returns result dict."""
    status_url = f"{RUNPOD_BASE}/{RUNPOD_ENDPOINT_ID}/status/{job_id}"
    headers = {"Authorization": f"Bearer {RUNPOD_API_KEY}"}
    start = time.time()

    while time.time() - start < RUNPOD_TIMEOUT:
        resp = requests.get(status_url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()

        if data.get("status") in ("COMPLETED", "FAILED"):
            return data

        time.sleep(RUNPOD_POLL_INTERVAL)

    raise TimeoutError(f"RunPod job {job_id} timed out after {RUNPOD_TIMEOUT}s")


def transcribe_chunks(
    r2_urls: list, language: str = "en", chunk_seconds: int = 30
) -> list:
    """
    Transcribe audio chunks via RunPod Whisper in parallel.

    Submits all chunks to RunPod /run endpoint simultaneously, then polls
    all jobs concurrently using ThreadPoolExecutor.

    Args:
        r2_urls: List of R2 URLs for audio chunks.
        language: Language code for transcription.
        chunk_seconds: Duration of each chunk (for timestamp offsetting).

    Returns:
        List of segments: [{"start": float, "end": float, "text": str, "words"?: [...]}]
    """
    if not RUNPOD_ENDPOINT_ID or not RUNPOD_API_KEY:
        raise RuntimeError("RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY must be set")

    logger.info(f"Transcribing {len(r2_urls)} chunks via RunPod Whisper (parallel)")

    # Phase 1: Submit all jobs (fast, sequential — each returns immediately)
    jobs = []  # [(chunk_index, job_id)]
    for i, url in enumerate(r2_urls):
        try:
            job_id = _submit_runpod_job(url, language)
            jobs.append((i, job_id))
            logger.info(f"  Submitted chunk {i} → job {job_id[:12]}...")
        except Exception as e:
            logger.error(f"  Failed to submit chunk {i}: {e}")

    if not jobs:
        logger.warning("No chunks were submitted successfully")
        return []

    emit_event("extraction", "Transcribing chunks in parallel", "running", {
        "count": len(jobs),
        "message": f"Submitted {len(jobs)}/{len(r2_urls)} jobs to RunPod, polling...",
    })

    # Phase 2: Poll all jobs concurrently
    all_segments = []
    completed = 0
    failed_chunks = []  # [(chunk_index, r2_url)] for retry

    def _process_result(chunk_index, result):
        """Extract segments from a successful result. Returns segments list or None."""
        if result.get("status") == "FAILED":
            error = result.get("error", "Unknown error")
            logger.error(f"  Chunk {chunk_index} failed: {error}")
            return None

        output = result.get("output", {})
        if "error" in output:
            logger.error(f"  Chunk {chunk_index} handler error: {output['error']}")
            return None

        return output.get("segments", [])

    with ThreadPoolExecutor(max_workers=len(jobs)) as executor:
        futures = {
            executor.submit(_poll_runpod_job, job_id): (chunk_index, job_id)
            for chunk_index, job_id in jobs
        }

        for future in as_completed(futures):
            chunk_index, job_id = futures[future]
            offset = chunk_index * chunk_seconds

            try:
                result = future.result()
            except TimeoutError:
                logger.error(f"  Chunk {chunk_index} timed out")
                failed_chunks.append((chunk_index, r2_urls[chunk_index]))
                continue
            except Exception as e:
                logger.error(f"  Chunk {chunk_index} failed: {e}")
                failed_chunks.append((chunk_index, r2_urls[chunk_index]))
                continue

            segments = _process_result(chunk_index, result)
            if segments is None:
                failed_chunks.append((chunk_index, r2_urls[chunk_index]))
                continue

            for seg in segments:
                entry = {
                    "start": round(seg["start"] + offset, 2),
                    "end": round(seg["end"] + offset, 2),
                    "text": seg["text"],
                }
                if "words" in seg:
                    entry["words"] = [
                        {
                            "word": w["word"],
                            "start": round(w["start"] + offset, 2),
                            "end": round(w["end"] + offset, 2),
                            "probability": w.get("probability"),
                        }
                        for w in seg["words"]
                    ]
                all_segments.append(entry)

            completed += 1
            emit_event("extraction", f"Chunk {chunk_index} transcribed", "running", {
                "message": f"{completed}/{len(jobs)} chunks complete",
            })

    # Phase 3: Retry failed chunks once (may land on a healthy worker)
    if failed_chunks:
        logger.info(f"Retrying {len(failed_chunks)} failed chunks...")
        retry_jobs = []
        for chunk_index, url in failed_chunks:
            try:
                job_id = _submit_runpod_job(url, language)
                retry_jobs.append((chunk_index, job_id))
                logger.info(f"  Retry chunk {chunk_index} → job {job_id[:12]}...")
            except Exception as e:
                logger.error(f"  Retry submit failed for chunk {chunk_index}: {e}")

        if retry_jobs:
            with ThreadPoolExecutor(max_workers=len(retry_jobs)) as executor:
                futures = {
                    executor.submit(_poll_runpod_job, job_id): (chunk_index, job_id)
                    for chunk_index, job_id in retry_jobs
                }
                for future in as_completed(futures):
                    chunk_index, job_id = futures[future]
                    offset = chunk_index * chunk_seconds
                    try:
                        result = future.result()
                    except Exception as e:
                        logger.error(f"  Retry chunk {chunk_index} failed again: {e}")
                        continue

                    segments = _process_result(chunk_index, result)
                    if segments is None:
                        logger.error(f"  Retry chunk {chunk_index} failed again")
                        continue

                    for seg in segments:
                        entry = {
                            "start": round(seg["start"] + offset, 2),
                            "end": round(seg["end"] + offset, 2),
                            "text": seg["text"],
                        }
                        if "words" in seg:
                            entry["words"] = [
                                {
                                    "word": w["word"],
                                    "start": round(w["start"] + offset, 2),
                                    "end": round(w["end"] + offset, 2),
                                    "probability": w.get("probability"),
                                }
                                for w in seg["words"]
                            ]
                        all_segments.append(entry)

                    completed += 1
                    logger.info(f"  Retry chunk {chunk_index} succeeded")

    all_segments.sort(key=lambda s: s["start"])
    full_text = " ".join(s["text"] for s in all_segments)
    logger.info(f"Transcription complete: {len(all_segments)} segments, {len(full_text)} chars")

    return all_segments


# ---------------------------------------------------------------------------
# Function 5: Correct Transcription via Claude (language-generic)
# ---------------------------------------------------------------------------


def correct_transcription(
    transcript: str,
    language_name: str,
    contact_language: str,
    known_vocabulary: Optional[list] = None,
) -> str:
    """
    Use Claude to correct a proxy-language transcription to the actual target language.

    Whisper transcribes endangered language speech using the closest major language
    (the contact language). This function identifies and corrects target-language-specific
    vocabulary and grammar.

    Args:
        transcript: Raw transcription from Whisper (in the contact language).
        language_name: Name of the target endangered language.
        contact_language: Name of the contact/proxy language used by Whisper.
        known_vocabulary: Optional list of known target-language words to guide correction.

    Returns:
        Corrected transcript with target-language-specific annotations.
    """
    if not ANTHROPIC_API_KEY:
        logger.warning("ANTHROPIC_API_KEY not set, skipping transcription correction")
        return transcript

    import anthropic

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    vocab_section = ""
    if known_vocabulary:
        vocab_list = ", ".join(known_vocabulary[:100])
        vocab_section = f"\n\nKnown {language_name} vocabulary that may appear: {vocab_list}"

    system_prompt = (
        f"You are an expert linguist specializing in the {language_name} language. "
        f"{language_name} is an endangered language that is distinct from {contact_language}. "
        f"Whisper (a speech recognition model) transcribed audio of {language_name} speech "
        f"using {contact_language} as the closest available language model. "
        f"Your task is to identify words and phrases that are likely {language_name}-specific "
        f"(not {contact_language}) and correct the transcription accordingly."
    )

    user_prompt = (
        f"The following is a transcription of speech in {language_name}, "
        f"but it was transcribed using a {contact_language} speech recognition model. "
        f"The transcription likely contains {contact_language} words where "
        f"{language_name}-specific vocabulary or grammar should be used.\n\n"
        f"Please:\n"
        f"1. Identify words/phrases that are likely {language_name}-specific vs {contact_language}\n"
        f"2. Correct the transcription to use proper {language_name} vocabulary and grammar where applicable\n"
        f"3. Mark {language_name}-specific words with 【brackets】\n\n"
        f"Transcription:\n{transcript}{vocab_section}\n\n"
        f"Return the corrected transcription with {language_name} words marked in 【brackets】. "
        f"After the corrected text, add a brief section listing each {language_name} word found "
        f"with its {contact_language} equivalent."
    )

    logger.info(f"Sending transcript to Claude for {language_name} correction (proxy: {contact_language})")

    response = client.messages.create(
        model="claude-sonnet-4-5-20250929",
        max_tokens=4096,
        system=system_prompt,
        messages=[{"role": "user", "content": user_prompt}],
    )

    corrected = response.content[0].text
    logger.info(f"{language_name} correction complete ({len(corrected)} chars)")
    return corrected


# ---------------------------------------------------------------------------
# Function 6: Clip Word Pronunciations from Chunks
# ---------------------------------------------------------------------------

def clip_and_upload_words(
    segments: list, chunk_paths: list, video_id: str, chunk_seconds: int = 30
) -> dict:
    """
    Clip unique words from audio chunks and upload to R2.

    Extracts individual word pronunciations using word-level timestamps from
    Whisper, clips them from the corresponding chunk audio using pydub, and
    uploads each clip to R2 for per-entry pronunciation audio.

    Args:
        segments: Transcription segments with word-level timestamps.
        chunk_paths: Local file paths to audio chunks.
        video_id: YouTube video ID (for R2 key prefix).
        chunk_seconds: Duration of each chunk in seconds.

    Returns:
        Dict mapping word text to R2 URL: {"word_text": "https://..."}
    """
    from pydub import AudioSegment as PydubSegment

    # Collect unique words (first occurrence, >200ms duration, >1 char)
    seen: dict[str, dict] = {}
    for seg in segments:
        for w in seg.get("words", []):
            text = w["word"].strip()
            duration = w["end"] - w["start"]
            if text and len(text) > 1 and duration >= 0.2 and text not in seen:
                seen[text] = w

    if not seen:
        logger.info("No words to clip (no word-level timestamps found)")
        return {}

    logger.info(f"Clipping {len(seen)} unique words from {len(chunk_paths)} chunks")

    # Cache loaded chunks to avoid re-reading the same file
    chunk_cache: dict[int, PydubSegment] = {}
    word_clips: dict[str, str] = {}
    clip_tasks: list[tuple[str, str]] = []  # (local_path, r2_key) for parallel upload

    for text, w in seen.items():
        try:
            chunk_idx = min(int(w["start"] // chunk_seconds), len(chunk_paths) - 1)
            local_start = w["start"] - (chunk_idx * chunk_seconds)
            local_end = w["end"] - (chunk_idx * chunk_seconds)

            # Load chunk audio (cached)
            if chunk_idx not in chunk_cache:
                chunk_cache[chunk_idx] = PydubSegment.from_file(chunk_paths[chunk_idx])
            audio = chunk_cache[chunk_idx]

            clip = audio[int(local_start * 1000):int(local_end * 1000)]

            # Pad very short clips with 50ms silence on each side for cleaner playback
            if len(clip) < 300:
                silence = PydubSegment.silent(duration=50, frame_rate=16000)
                clip = silence + clip + silence

            # Save to temp file
            clip_hash = hashlib.sha256(f"{text}:{w['start']}".encode()).hexdigest()[:12]
            clip_path = os.path.join(tempfile.gettempdir(), f"word_{clip_hash}.wav")
            clip.export(clip_path, format="wav")

            r2_key = f"words/{video_id}/{clip_hash}.wav"
            clip_tasks.append((clip_path, r2_key))
            word_clips[text] = r2_key  # placeholder, will be replaced with full URL

        except Exception as e:
            logger.debug(f"  Failed to clip word '{text}': {e}")

    # Upload clips in parallel
    def upload_clip(args):
        clip_path, r2_key = args
        try:
            relative_url = upload_to_r2(clip_path, r2_key)
            full_url = f"{CLOUDFLARE_WORKER_URL}{relative_url}"
            return r2_key, full_url
        except Exception as e:
            logger.debug(f"  Failed to upload {r2_key}: {e}")
            return r2_key, None
        finally:
            if os.path.exists(clip_path):
                os.remove(clip_path)

    uploaded = 0
    with ThreadPoolExecutor(max_workers=8) as executor:
        for r2_key, full_url in executor.map(upload_clip, clip_tasks):
            if full_url:
                # Find the word text for this r2_key and update with full URL
                for text, key in word_clips.items():
                    if key == r2_key:
                        word_clips[text] = full_url
                        uploaded += 1
                        break

    # Remove entries that failed to upload
    word_clips = {k: v for k, v in word_clips.items() if v.startswith("http")}

    logger.info(f"Clipped and uploaded {uploaded}/{len(seen)} word pronunciations")
    return word_clips


# ---------------------------------------------------------------------------
# Function 7: Full Pipeline Orchestrator
# ---------------------------------------------------------------------------

def process_video(
    video_url: str,
    language: str = "en",
    chunk_seconds: int = 30,
    known_vocabulary: Optional[list] = None,
    language_name: str = "Unknown",
    language_code: str = "und",
    contact_languages: Optional[list] = None,
) -> dict:
    """
    Run the complete audio processing pipeline for a YouTube video.

    Flow: download → chunk → upload to R2 → transcribe → correct

    Args:
        video_url: YouTube video URL.
        language: Language code for Whisper transcription (legacy, ignored when contact_languages present).
        chunk_seconds: Audio chunk length in seconds.
        known_vocabulary: Optional list of known words to guide correction.
        language_name: Human-readable language name for event messages.
        language_code: ISO 639-3 code (e.g., "jje" for Jejueo).
        contact_languages: List of contact language names (e.g., ["Korean"]) for Whisper language resolution.

    Returns:
        Dict with video_url, video_id, transcript, corrected_transcript,
        audio_urls, segments, and duration_seconds.
    """
    video_id = extract_video_id(video_url)
    work_dir = tempfile.mkdtemp(prefix=f"tk_{video_id}_")

    logger.info(f"=== Processing video: {video_url} ===")
    logger.info(f"Work directory: {work_dir}")

    try:
        # Step 1: Download
        emit_event("extraction", "Downloading audio from YouTube", "running", {
            "url": video_url, "title": f"Video {video_id}",
        })
        audio_path = download_youtube_audio(video_url, work_dir)

        from pydub import AudioSegment
        duration_seconds = AudioSegment.from_file(audio_path).duration_seconds

        # Step 2: Chunk
        emit_event("extraction", "Chunking audio into segments", "running", {
            "message": f"Splitting {duration_seconds:.0f}s audio into {chunk_seconds}s chunks",
        })
        chunk_paths = chunk_audio(audio_path, chunk_seconds)

        # Step 3: Upload to R2
        emit_event("extraction", "Uploading chunks to R2", "running", {
            "count": len(chunk_paths),
            "message": f"Uploading {len(chunk_paths)} chunks to Cloudflare R2",
        })
        r2_urls = upload_chunks_to_r2(chunk_paths, video_id)

        # Step 4: Transcribe (using contact language as Whisper proxy)
        whisper_lang = resolve_whisper_language(contact_languages, language_code)
        emit_event("extraction", "Transcribing audio with Whisper", "running", {
            "count": len(r2_urls),
            "message": f"Sending {len(r2_urls)} chunks to RunPod Whisper (large-v3, lang={whisper_lang})",
        })
        segments = transcribe_chunks(r2_urls, whisper_lang, chunk_seconds)
        transcript = " ".join(s["text"] for s in segments)

        # Step 4.5: Clip individual word pronunciations and upload to R2
        word_clips = {}
        if segments and chunk_paths:
            emit_event("extraction", "Clipping word pronunciations", "running", {
                "message": f"Extracting individual words from {len(chunk_paths)} chunks",
            })
            word_clips = clip_and_upload_words(segments, chunk_paths, video_id, chunk_seconds)

        # Step 5: Correct transcription from contact language → target language
        corrected_transcript = transcript
        contact_lang_name = (contact_languages[0] if contact_languages else "English")
        if transcript.strip():
            emit_event("cross_reference", f"Correcting transcription for {language_name}", "running", {
                "message": f"Analyzing {len(transcript)} chars — correcting {contact_lang_name} → {language_name}",
            })
            corrected_transcript = correct_transcription(
                transcript, language_name, contact_lang_name, known_vocabulary
            )

        # Cache the full transcript data for frontend retrieval
        cache_key = f"transcript:{video_id}"
        try:
            set_cache(cache_key, json.dumps({
                "transcript": transcript,
                "corrected": corrected_transcript,
                "segments": segments,
                "word_clips": word_clips,
                "audio_urls": r2_urls,
                "duration_seconds": round(duration_seconds, 2),
                "language_name": language_name,
                "video_url": video_url,
            }))
        except Exception:
            logger.debug("Failed to cache result (non-critical)")

        # Step 6: Complete
        result = {
            "video_url": video_url,
            "video_id": video_id,
            "transcript": transcript,
            "corrected_transcript": corrected_transcript,
            "audio_urls": r2_urls,
            "segments": segments,
            "duration_seconds": round(duration_seconds, 2),
            "word_clips": word_clips,
        }

        emit_event("extraction", "Audio pipeline complete", "complete", {
            "url": video_url,
            "title": f"Video {video_id}",
            "count": len(segments),
            "message": f"Processed {duration_seconds:.0f}s of audio → {len(segments)} segments, {len(word_clips)} word clips",
        })

        logger.info(f"=== Pipeline complete for {video_id} ===")
        return result

    except Exception as e:
        emit_event("extraction", f"Pipeline failed: {str(e)[:100]}", "error", {
            "url": video_url, "message": str(e),
        })
        logger.error(f"Pipeline failed: {e}")
        raise

    finally:
        # Clean up temp files
        if os.path.exists(work_dir):
            shutil.rmtree(work_dir, ignore_errors=True)
            logger.debug(f"Cleaned up {work_dir}")


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="LangSafe Audio Pipeline — Process YouTube videos for endangered language preservation"
    )
    parser.add_argument("video_url", help="YouTube video URL to process")
    parser.add_argument("--language", default="en", help="Whisper language code (default: en)")
    parser.add_argument("--language-name", default="Unknown", help="Human-readable language name")
    parser.add_argument("--language-code", default="und", help="ISO 639-3 language code")
    parser.add_argument(
        "--contact-languages", nargs="*", default=None,
        help="Contact language names (e.g., Korean Filipino) for Whisper proxy",
    )
    parser.add_argument(
        "--chunk-seconds", type=int, default=30, help="Chunk length in seconds (default: 30)"
    )
    parser.add_argument(
        "--vocabulary", nargs="*", default=None,
        help="Known vocabulary words for correction guidance",
    )
    parser.add_argument(
        "--skip-correction", action="store_true", help="Skip Claude transcription correction step"
    )

    args = parser.parse_args()

    # Validate required env vars
    missing = []
    if not RUNPOD_ENDPOINT_ID:
        missing.append("RUNPOD_ENDPOINT_ID")
    if not RUNPOD_API_KEY:
        missing.append("RUNPOD_API_KEY")
    if missing:
        print(f"Error: Missing environment variables: {', '.join(missing)}", file=sys.stderr)
        print("Set them with: export RUNPOD_ENDPOINT_ID=... RUNPOD_API_KEY=...", file=sys.stderr)
        sys.exit(1)

    vocab = None if args.skip_correction else args.vocabulary

    result = process_video(
        video_url=args.video_url,
        language=args.language,
        chunk_seconds=args.chunk_seconds,
        known_vocabulary=vocab,
        language_name=args.language_name,
        language_code=args.language_code,
        contact_languages=args.contact_languages,
    )

    print("\n" + "=" * 60)
    print("PIPELINE RESULT")
    print("=" * 60)
    print(json.dumps(result, indent=2, ensure_ascii=False))
