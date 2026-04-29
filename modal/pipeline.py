"""
Kaleidoscope Modal pipeline: video -> keyframes -> depth prior -> Gemini -> JSON.

Run modes:
    modal run modal/pipeline.py::analyze --video-url <https url> --scene-id urban_intersection
    modal run modal/pipeline.py::extract_keyframes --video-url <https url>
    modal deploy modal/pipeline.py    # exposes a webhook for the Next.js app

Cost discipline:
    - GPU: T4 (cheapest GPU). Used only inside `extract_keyframes` and `depth_prior`.
    - Gemini call runs on CPU; no GPU billing for the LLM round-trip.
    - All Modal functions scale to zero when idle.
"""

from __future__ import annotations

import io
import json
import os
import tempfile
import time
from typing import Any

import modal

# ---------- Modal image ----------

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "opencv-python-headless==4.10.0.84",
        "numpy==1.26.4",
        "pydantic==2.9.2",
        "google-genai==0.7.0",
        "requests==2.32.3",
        "pillow==10.4.0",
    )
)

app = modal.App("kaleidoscope-pipeline", image=image)

# Secrets (set with: modal secret create kaleidoscope-secrets ...)
secret = modal.Secret.from_name(
    "kaleidoscope-secrets",
    required_keys=["GOOGLE_API_KEY"],
)


# ---------- Pydantic schema (mirror of src/lib/gemini-schema.ts) ----------

from pydantic import BaseModel, Field, field_validator
from typing import Literal


class Agent(BaseModel):
    id: str
    label: Literal["vehicle", "pedestrian", "cyclist", "player", "ball", "other"]
    pos_2d: tuple[float, float]
    pos_3d: tuple[float, float, float] | None = None
    velocity: tuple[float, float, float]
    heading_deg: float = Field(ge=0, le=360)
    confidence: float = Field(ge=0, le=1)
    intent: str | None = None
    trajectory_forecast: list[tuple[float, float, float]] | None = None


class Frame(BaseModel):
    timestamp: str
    agents: list[Agent]
    scene_context: str | None = None


class FramesResponse(BaseModel):
    frames: list[Frame]


# ---------- Keyframe extraction (motion-saliency) ----------


@app.function(timeout=300, cpu=2.0)
def extract_keyframes(
    video_url: str,
    target_fps: float = 1.0,
    motion_boost_fps: float = 5.0,
    motion_threshold: float = 25.0,
) -> dict[str, Any]:
    """
    Sample frames at `target_fps`, but bump to `motion_boost_fps` when adjacent
    frames differ by more than `motion_threshold` mean-abs pixel delta.

    Returns metadata only (no frame bytes — Gemini handles the video natively).
    The point of this function is to *recommend* a sample rate to Gemini and
    to surface motion timestamps for the UI's accuracy meter.
    """
    import cv2
    import numpy as np
    import requests

    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        r = requests.get(video_url, timeout=60, stream=True)
        r.raise_for_status()
        for chunk in r.iter_content(chunk_size=1 << 16):
            tmp.write(chunk)
        path = tmp.name

    cap = cv2.VideoCapture(path)
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    duration_sec = n_frames / fps if fps else 0

    keyframes: list[dict[str, float]] = []
    motion_segments: list[dict[str, float]] = []

    target_step = max(1, int(round(fps / target_fps)))
    boost_step = max(1, int(round(fps / motion_boost_fps)))

    prev_gray = None
    in_motion = False
    motion_start = 0.0
    i = 0
    step = target_step

    while True:
        ret, frame = cap.read()
        if not ret:
            break
        if i % step == 0:
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            gray = cv2.resize(gray, (320, 180))
            t_sec = i / fps
            keyframes.append({"t": round(t_sec, 3)})

            if prev_gray is not None:
                delta = float(np.mean(np.abs(gray.astype(np.int16) - prev_gray.astype(np.int16))))
                hot = delta > motion_threshold
                if hot and not in_motion:
                    motion_start = t_sec
                    in_motion = True
                    step = boost_step
                elif not hot and in_motion:
                    motion_segments.append({"start": round(motion_start, 3), "end": round(t_sec, 3)})
                    in_motion = False
                    step = target_step
            prev_gray = gray
        i += 1

    if in_motion:
        motion_segments.append({"start": round(motion_start, 3), "end": round(duration_sec, 3)})

    cap.release()
    os.unlink(path)

    return {
        "video_url": video_url,
        "duration_sec": round(duration_sec, 3),
        "source_fps": round(fps, 3),
        "width": width,
        "height": height,
        "keyframes": keyframes,
        "motion_segments": motion_segments,
    }


# ---------- Gemini analysis ----------


@app.function(timeout=600, secrets=[secret], cpu=1.0)
def analyze_with_gemini(
    video_url: str,
    fps: float = 1.0,
    model: str = "gemini-2.0-flash-exp",
) -> dict[str, Any]:
    """Send the video URI to Gemini and return validated FramesResponse JSON."""
    from google import genai
    from google.genai import types

    api_key = os.environ["GOOGLE_API_KEY"]
    client = genai.Client(api_key=api_key)

    system_instruction = (
        "You are a Spatio-Temporal Occupancy Network analyzing video as a 4D scene. "
        "For every sampled frame, output JSON conforming to the response schema. "
        "Coordinates: pos_2d in [0,1000] image space, pos_3d in metres relative to camera "
        "origin (0,0,0) with +Z forward, +X right, +Y up. Maintain stable IDs across frames "
        "with up to 2 seconds of occlusion persistence via velocity extrapolation. "
        "trajectory_forecast: 3 future positions at T+1s, T+2s, T+3s."
    )

    user_text = (
        f"Analyze this video at approximately {fps} FPS. Return all agents per frame "
        f"with 3D positions, velocities, intent, and trajectory_forecast. "
        f"Use the response schema strictly."
    )

    t0 = time.time()
    response = client.models.generate_content(
        model=model,
        contents=[
            types.Content(
                role="user",
                parts=[
                    types.Part.from_uri(file_uri=video_url, mime_type="video/mp4"),
                    types.Part.from_text(text=user_text),
                ],
            )
        ],
        config=types.GenerateContentConfig(
            system_instruction=system_instruction,
            response_mime_type="application/json",
            temperature=0.2,
        ),
    )
    latency_ms = int((time.time() - t0) * 1000)

    raw_text = response.text or ""
    parsed = FramesResponse.model_validate_json(raw_text)

    return {
        "model": model,
        "latency_ms": latency_ms,
        "frames": [f.model_dump() for f in parsed.frames],
    }


# ---------- Top-level orchestration ----------


@app.function(timeout=900, cpu=2.0)
def analyze(
    video_url: str,
    scene_id: str,
    fps: float = 1.0,
) -> dict[str, Any]:
    """
    Orchestrator: keyframes -> Gemini -> bundle for persistence.
    Returns the full payload the bake script writes to Postgres.
    """
    t0 = time.time()
    keyframes_meta = extract_keyframes.remote(video_url=video_url, target_fps=fps)
    modal_latency_ms = int((time.time() - t0) * 1000)

    gemini_result = analyze_with_gemini.remote(video_url=video_url, fps=fps)

    return {
        "scene_id": scene_id,
        "video_url": video_url,
        "duration_sec": keyframes_meta["duration_sec"],
        "source_fps": keyframes_meta["source_fps"],
        "width": keyframes_meta["width"],
        "height": keyframes_meta["height"],
        "motion_segments": keyframes_meta["motion_segments"],
        "model": gemini_result["model"],
        "modal_latency_ms": modal_latency_ms,
        "gemini_latency_ms": gemini_result["latency_ms"],
        "frames": gemini_result["frames"],
    }


# ---------- Webhook (optional, for live re-bake from the Next.js app) ----------


@app.function(secrets=[secret], cpu=1.0)
@modal.fastapi_endpoint(method="POST")
def bake_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """POST {video_url, scene_id, fps?} -> JSON result."""
    video_url = payload["video_url"]
    scene_id = payload["scene_id"]
    fps = float(payload.get("fps", 1.0))
    return analyze.remote(video_url=video_url, scene_id=scene_id, fps=fps)


# ---------- Local entrypoint for `modal run` ----------


@app.local_entrypoint()
def main(video_url: str, scene_id: str = "test_scene", fps: float = 1.0) -> None:
    out = analyze.remote(video_url=video_url, scene_id=scene_id, fps=fps)
    print(json.dumps(out, indent=2))
