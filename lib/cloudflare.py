"""
LangSafe — Cloudflare helper functions.
Python client for the Cloudflare Worker API (R2 upload, KV cache).
"""

import os
import json
import mimetypes
from typing import Optional
import requests

WORKER_URL = os.environ.get("CLOUDFLARE_WORKER_URL", "http://localhost:8787")


def upload_to_r2(file_path: str, key: Optional[str] = None) -> str:
    """
    Upload a file to R2 via the Cloudflare Worker.

    Args:
        file_path: Local path to the file to upload.
        key: Optional filename/key. Defaults to the file's basename.

    Returns:
        The relative URL path to the uploaded file (e.g., "/audio/1234-file.mp3").
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")

    filename = key or os.path.basename(file_path)
    content_type = mimetypes.guess_type(file_path)[0] or "application/octet-stream"

    with open(file_path, "rb") as f:
        response = requests.post(
            f"{WORKER_URL}/upload",
            data=f,
            headers={
                "Content-Type": content_type,
                "X-Filename": filename,
            },
            timeout=120,
        )

    response.raise_for_status()
    data = response.json()
    return data["url"]


def get_from_cache(key: str) -> Optional[str]:
    """
    Read a value from KV cache via the Cloudflare Worker.

    Args:
        key: The cache key to look up.

    Returns:
        The cached value, or None if not found.
    """
    response = requests.get(f"{WORKER_URL}/cache/{key}", timeout=10)

    if response.status_code == 404:
        return None

    response.raise_for_status()
    data = response.json()
    value = data.get("value")

    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value


def set_cache(key: str, value: str, ttl: int = 3600) -> bool:
    """
    Write a value to KV cache via the Cloudflare Worker.

    Args:
        key: The cache key.
        value: The value to store.
        ttl: Time-to-live in seconds (default: 3600 = 1 hour).

    Returns:
        True if the value was stored successfully.
    """
    # Try to parse as JSON to store structured data
    try:
        parsed = json.loads(value)
    except (json.JSONDecodeError, TypeError):
        parsed = value

    response = requests.post(
        f"{WORKER_URL}/cache/{key}",
        json={"value": parsed, "ttl": ttl},
        headers={"Content-Type": "application/json"},
        timeout=10,
    )

    response.raise_for_status()
    return response.json().get("stored", False)


def detect_language(text: str) -> dict:
    """
    Detect the language of text via the Cloudflare Worker.

    Supports script-based detection for multiple writing systems
    (Hangul, Arabic, Devanagari, CJK, Cyrillic, Thai, Tamil, Bengali, Latin).

    Args:
        text: The text to analyze.

    Returns:
        Dict with "language" (ISO 639 code), "confidence", and "details".
    """
    response = requests.post(
        f"{WORKER_URL}/detect-language",
        json={"text": text},
        headers={"Content-Type": "application/json"},
        timeout=10,
    )

    response.raise_for_status()
    return response.json()
