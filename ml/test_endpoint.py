"""
LangSafe — Test script for the RunPod Whisper endpoint.

Usage:
    python test_endpoint.py --endpoint-id <ID> --api-key <KEY>
    python test_endpoint.py --endpoint-id <ID> --api-key <KEY> --audio-url <URL>

Environment variables (alternative to CLI args):
    RUNPOD_ENDPOINT_ID
    RUNPOD_API_KEY
"""

import argparse
import json
import os
import sys
import time
import requests

RUNPOD_BASE = "https://api.runpod.ai/v2"
POLL_INTERVAL = 2  # seconds


def run_sync(endpoint_id: str, api_key: str, payload: dict) -> dict:
    """Send a synchronous request to the RunPod endpoint."""
    url = f"{RUNPOD_BASE}/{endpoint_id}/runsync"
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }

    print(f"POST {url}")
    print(f"Payload: {json.dumps(payload, indent=2)}\n")

    resp = requests.post(url, json=payload, headers=headers, timeout=300)
    resp.raise_for_status()
    data = resp.json()

    # If the job completed synchronously
    if data.get("status") == "COMPLETED":
        return data

    # Otherwise poll for completion
    job_id = data.get("id")
    if not job_id:
        return data

    print(f"Job queued: {job_id}. Polling for completion...")
    return poll_status(endpoint_id, api_key, job_id)


def poll_status(endpoint_id: str, api_key: str, job_id: str) -> dict:
    """Poll the RunPod endpoint until the job completes."""
    url = f"{RUNPOD_BASE}/{endpoint_id}/status/{job_id}"
    headers = {"Authorization": f"Bearer {api_key}"}

    while True:
        resp = requests.get(url, headers=headers, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        status = data.get("status")

        if status == "COMPLETED":
            return data
        elif status == "FAILED":
            print("Job FAILED.")
            return data
        else:
            print(f"  Status: {status} — waiting {POLL_INTERVAL}s...")
            time.sleep(POLL_INTERVAL)


def main():
    parser = argparse.ArgumentParser(description="Test LangSafe Whisper endpoint")
    parser.add_argument(
        "--endpoint-id",
        default=os.environ.get("RUNPOD_ENDPOINT_ID"),
        help="RunPod endpoint ID (or set RUNPOD_ENDPOINT_ID)",
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("RUNPOD_API_KEY"),
        help="RunPod API key (or set RUNPOD_API_KEY)",
    )
    parser.add_argument(
        "--audio-url",
        default="https://upload.wikimedia.org/wikipedia/commons/a/a9/Ko-Jeju_dialect_sample.ogg",
        help="URL of audio file to transcribe",
    )
    parser.add_argument(
        "--language",
        default="ko",
        help="Language code (default: ko)",
    )
    parser.add_argument(
        "--task",
        default="transcribe",
        choices=["transcribe", "translate"],
        help="Task: transcribe or translate (default: transcribe)",
    )

    args = parser.parse_args()

    if not args.endpoint_id:
        print("Error: --endpoint-id or RUNPOD_ENDPOINT_ID required", file=sys.stderr)
        sys.exit(1)
    if not args.api_key:
        print("Error: --api-key or RUNPOD_API_KEY required", file=sys.stderr)
        sys.exit(1)

    payload = {
        "input": {
            "audio_url": args.audio_url,
            "language": args.language,
            "task": args.task,
        }
    }

    result = run_sync(args.endpoint_id, args.api_key, payload)

    print("\n" + "=" * 60)
    print("RESULT")
    print("=" * 60)
    print(json.dumps(result, indent=2, ensure_ascii=False))

    # Print summary if successful
    output = result.get("output", {})
    if "text" in output:
        print(f"\n--- Transcription ---")
        print(output["text"])
        print(f"\nLanguage: {output.get('detected_language')} "
              f"(confidence: {output.get('confidence', 0):.2%})")
        print(f"Segments: {len(output.get('segments', []))}")
        if output.get("warning"):
            print(f"Warning: {output['warning']}")
    elif "error" in output:
        print(f"\nError: {output['error']}")


if __name__ == "__main__":
    main()
