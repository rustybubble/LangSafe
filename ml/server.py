"""
LangSafe — ML FastAPI Service
Exposes the audio processing pipeline over HTTP.
"""

import os
import sys

# Add project root to path for lib imports
PROJECT_ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PROJECT_ROOT)

# Load .env.local from project root
from dotenv import load_dotenv

load_dotenv(os.path.join(PROJECT_ROOT, ".env.local"))

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional

from audio_pipeline import (
    process_video,
    _runpod_request,
    RUNPOD_ENDPOINT_ID,
    RUNPOD_API_KEY,
)

app = FastAPI(title="LangSafe ML Service", version="1.0.0")

_cors_origins = [
    "http://localhost:3000",
    "http://localhost:3001",
]
if os.environ.get("FRONTEND_URL"):
    _cors_origins.append(os.environ["FRONTEND_URL"])
if os.environ.get("WS_URL"):
    _cors_origins.append(os.environ["WS_URL"])

app.add_middleware(
    CORSMiddleware,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------


class ProcessVideoRequest(BaseModel):
    video_url: str
    language: str = "en"           # legacy, ignored when contact_languages present
    chunk_seconds: int = 30
    language_name: str = "Unknown"
    language_code: str = "und"
    contact_languages: Optional[list[str]] = None
    known_vocabulary: Optional[list[str]] = None


class TranscribeRequest(BaseModel):
    audio_url: str
    language: str = "en"


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------


@app.get("/health")
async def health():
    return {
        "service": "LangSafe-ml",
        "status": "ok",
        "runpod_configured": bool(RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY),
    }


@app.post("/process-video")
async def handle_process_video(req: ProcessVideoRequest):
    try:
        result = process_video(
            video_url=req.video_url,
            language=req.language,
            chunk_seconds=req.chunk_seconds,
            known_vocabulary=req.known_vocabulary,
            language_name=req.language_name,
            language_code=req.language_code,
            contact_languages=req.contact_languages,
        )
        return result
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/transcribe")
async def handle_transcribe(req: TranscribeRequest):
    if not RUNPOD_ENDPOINT_ID or not RUNPOD_API_KEY:
        raise HTTPException(
            status_code=503,
            detail="RUNPOD_ENDPOINT_ID and RUNPOD_API_KEY must be set",
        )

    try:
        result = _runpod_request(req.audio_url, req.language)

        if result.get("status") == "FAILED":
            raise HTTPException(
                status_code=502,
                detail=result.get("error", "RunPod transcription failed"),
            )

        output = result.get("output", {})
        return {
            "text": output.get("text", ""),
            "segments": output.get("segments", []),
            "detected_language": output.get("detected_language"),
            "confidence": output.get("confidence"),
        }
    except TimeoutError:
        raise HTTPException(status_code=504, detail="Transcription timed out")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn

    port = int(os.environ.get("PORT", "3003"))
    uvicorn.run(app, host="0.0.0.0", port=port)
