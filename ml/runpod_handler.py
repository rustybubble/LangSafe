"""
LangSafe — RunPod Serverless Whisper Handler
Transcribes endangered language audio (Jeju/Korean) using faster-whisper large-v3.
"""

import os
import sys
import uuid
import subprocess
import json

print("--- LangSafe Whisper Handler Starting ---", flush=True)
print(f"Python: {sys.version}", flush=True)
print(f"CWD: {os.getcwd()}", flush=True)

import requests
print("Imported requests", flush=True)

import runpod
print("Imported runpod", flush=True)

from faster_whisper import WhisperModel
print("Imported faster_whisper", flush=True)

# ---------------------------------------------------------------------------
# Lazy Model Loading (loads on first request, not at import time)
# ---------------------------------------------------------------------------
MODEL_PATH = os.environ.get("MODEL_PATH", "/app/models/large-v3")
print(f"MODEL_PATH: {MODEL_PATH}", flush=True)
print(f"Model dir exists: {os.path.exists(MODEL_PATH)}", flush=True)
if os.path.exists(MODEL_PATH):
    print(f"Model dir contents: {os.listdir(MODEL_PATH)}", flush=True)

model = None


def get_model():
    global model
    if model is None:
        print("Loading Whisper model...", flush=True)
        model = WhisperModel(MODEL_PATH, device="cuda", compute_type="float16")
        print("Model loaded successfully!", flush=True)
    return model

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
MAX_DOWNLOAD_BYTES = 500 * 1024 * 1024  # 500 MB
DOWNLOAD_TIMEOUT = 120  # seconds
MAX_DURATION_SECONDS = 600  # 10 minutes
TMP_DIR = "/tmp"


def download_audio(url: str) -> str:
    """Download audio from URL to a temp file. Returns the file path."""
    ext = os.path.splitext(url.split("?")[0])[-1] or ".audio"
    tmp_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}{ext}")

    headers = {"User-Agent": "LangSafe/1.0 (endangered-language-preservation)"}
    response = requests.get(url, stream=True, timeout=DOWNLOAD_TIMEOUT, headers=headers)
    response.raise_for_status()

    downloaded = 0
    with open(tmp_path, "wb") as f:
        for chunk in response.iter_content(chunk_size=8192):
            downloaded += len(chunk)
            if downloaded > MAX_DOWNLOAD_BYTES:
                f.close()
                os.remove(tmp_path)
                raise ValueError(
                    f"File exceeds maximum size of {MAX_DOWNLOAD_BYTES // (1024*1024)} MB"
                )
            f.write(chunk)

    return tmp_path


def get_audio_duration(file_path: str) -> float:
    """Get audio duration in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "quiet",
        "-print_format", "json",
        "-show_format",
        file_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        raise ValueError(f"ffprobe failed: {result.stderr.strip()}")

    info = json.loads(result.stdout)
    duration = float(info["format"]["duration"])
    return duration


def truncate_audio(file_path: str, max_seconds: int) -> str:
    """Truncate audio to max_seconds using ffmpeg. Returns path to truncated file."""
    truncated_path = os.path.join(TMP_DIR, f"{uuid.uuid4().hex}_truncated.wav")
    cmd = [
        "ffmpeg",
        "-y",
        "-i", file_path,
        "-t", str(max_seconds),
        "-ar", "16000",
        "-ac", "1",
        "-c:a", "pcm_s16le",
        truncated_path,
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    if result.returncode != 0:
        raise ValueError(f"ffmpeg truncation failed: {result.stderr.strip()}")
    return truncated_path


def handler(job: dict) -> dict:
    """
    RunPod serverless handler for Whisper transcription.

    Input:
        audio_url (str):  URL to an audio file (R2, direct link, etc.)
        language  (str):  Language code, default "en" (English)
        task      (str):  "transcribe" or "translate", default "transcribe"

    Output:
        text              (str):   Full transcription text
        segments          (list):  [{start, end, text}, ...]
        detected_language (str):   ISO language code
        confidence        (float): Language detection confidence
    """
    job_input = job.get("input", {})

    # --- Validate input ---
    audio_url = job_input.get("audio_url")
    if not audio_url:
        return {"error": "audio_url is required"}

    language = job_input.get("language", "en")
    task = job_input.get("task", "transcribe")

    if task not in ("transcribe", "translate"):
        return {"error": f"Invalid task '{task}'. Must be 'transcribe' or 'translate'."}

    audio_path = None
    truncated_path = None

    try:
        # --- Download audio ---
        try:
            audio_path = download_audio(audio_url)
        except requests.exceptions.Timeout:
            return {"error": f"Download timed out after {DOWNLOAD_TIMEOUT}s"}
        except requests.exceptions.HTTPError as e:
            return {"error": f"Failed to download audio: HTTP {e.response.status_code}"}
        except requests.exceptions.ConnectionError:
            return {"error": "Failed to download audio: connection error"}
        except ValueError as e:
            return {"error": str(e)}

        # --- Check duration and truncate if needed ---
        transcribe_path = audio_path
        was_truncated = False

        try:
            duration = get_audio_duration(audio_path)
            if duration > MAX_DURATION_SECONDS:
                truncated_path = truncate_audio(audio_path, MAX_DURATION_SECONDS)
                transcribe_path = truncated_path
                was_truncated = True
        except ValueError:
            # ffprobe failed — file may not be a valid audio format
            # Attempt transcription anyway; faster-whisper/ffmpeg will catch it
            pass
        except Exception:
            pass

        # --- Transcribe ---
        try:
            segments_gen, info = get_model().transcribe(
                transcribe_path,
                language=language,
                task=task,
                beam_size=5,
                word_timestamps=True,
                vad_filter=True,
                vad_parameters={
                    "threshold": 0.5,
                    "min_speech_duration_ms": 250,
                    "min_silence_duration_ms": 2000,
                },
            )

            segments = []
            full_text_parts = []

            for seg in segments_gen:
                seg_data = {
                    "start": round(seg.start, 2),
                    "end": round(seg.end, 2),
                    "text": seg.text.strip(),
                }
                if seg.words:
                    seg_data["words"] = [
                        {
                            "word": w.word.strip(),
                            "start": round(w.start, 2),
                            "end": round(w.end, 2),
                            "probability": round(w.probability, 3),
                        }
                        for w in seg.words
                    ]
                segments.append(seg_data)
                full_text_parts.append(seg.text.strip())

        except Exception as e:
            return {"error": f"Transcription failed: {str(e)}"}

        # --- Build response ---
        result = {
            "text": " ".join(full_text_parts),
            "segments": segments,
            "detected_language": info.language,
            "confidence": round(info.language_probability, 4),
        }

        if was_truncated:
            result["warning"] = (
                f"Audio was truncated from {duration:.0f}s to {MAX_DURATION_SECONDS}s"
            )

        return result

    finally:
        # --- Cleanup temp files ---
        for path in [audio_path, truncated_path]:
            if path and os.path.exists(path):
                try:
                    os.remove(path)
                except OSError:
                    pass


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------
runpod.serverless.start({"handler": handler})
