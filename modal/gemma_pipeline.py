"""
Kaleidoscope Gemma pipeline: open-weights alternative to Gemini API.

Hosts Gemma vision-language models on Modal GPUs. Same JSON contract as
modal/pipeline.py (FramesResponse) so callers can swap backends transparently.

Run modes:
    modal run modal/gemma_pipeline.py::analyze --video-url <url> --scene-id urban_intersection
    modal deploy modal/gemma_pipeline.py    # exposes a webhook

Why a separate file:
    - Different deps (torch, transformers) and a GPU image — keeps the Gemini
      pipeline lean and CPU-only.
    - Different cost model (GPU-seconds, not API tokens) — separate budget ledger.

Default model: Gemma 4 E4B (April 2026 release, ~4B activated params, A10G-friendly).
Override via GEMMA_MODEL_ID. Confirm exact HF path on huggingface.co/google before deploy.
"""

from __future__ import annotations

import os
import tempfile
import time
from typing import Any, Literal

import modal

# ---------- Modal image (GPU + transformers) ----------

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0")
    .pip_install(
        "torch==2.5.1",
        # Gemma 4 architecture lands in transformers >= 5.5.0 (see vllm-project/llm-compressor#2562).
        "transformers>=5.5.0",
        "accelerate==1.2.1",
        "pillow==10.4.0",
        "opencv-python-headless==4.10.0.84",
        "numpy==1.26.4",
        "requests==2.32.3",
        "pydantic==2.9.2",
    )
)

app = modal.App("kaleidoscope-gemma", image=image)

# Persistent HF model cache so we don't re-download Gemma weights on every cold start.
hf_cache = modal.Volume.from_name("kaleidoscope-hf-cache", create_if_missing=True)

# Secret bundle. HF_TOKEN is required (Gemma is gated on Hugging Face).
# Add it with:  modal secret create kaleidoscope-secrets HF_TOKEN=hf_xxx GOOGLE_API_KEY=...
secret = modal.Secret.from_name("kaleidoscope-secrets")

# Persistent ledger for Modal GPU spend (independent of the Gemini API ledger).
modal_budget_ledger = modal.Dict.from_name(
    "kaleidoscope-modal-budget-ledger", create_if_missing=True
)


# ---------- Pydantic schema (mirror of src/lib/gemini-schema.ts and pipeline.py) ----------

from pydantic import BaseModel, Field


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


# ---------- Modal GPU budget enforcement ----------
#
# Base GPU rates (USD/sec) verified against modal.com/pricing in April 2026.
# Modal applies multipliers on top of these:
#   - Region selection: 1.25x – 2.5x
#   - Non-preemptible execution: 3x
# We default MODAL_PRICE_MULTIPLIER to 1.25 (typical region default). Bump to
# 3.75 (1.25 * 3) if you run non-preemptible workloads.

GPU_USD_PER_SEC_BASE: dict[str, float] = {
    "T4": 0.000164,
    "L4": 0.000222,
    "L40S": 0.000542,
    "A100": 0.000583,        # 40 GB
    "A100-80GB": 0.000694,
    "H100": 0.001097,
    "H200": 0.001261,
    "B200": 0.001736,
}

DEFAULT_MODAL_BUDGET_USD = 10.0
DEFAULT_PRICE_MULTIPLIER = 1.25

# Note: A10G was removed from Modal's public pricing page; L4 is the modern
# equivalent (newer architecture, similar VRAM, ~30% cheaper). Default accordingly.
GEMMA_GPU = os.environ.get("GEMMA_GPU", "L4")
GEMMA_TIMEOUT_SEC = int(os.environ.get("GEMMA_TIMEOUT_SEC", "600"))  # 10 min hard cap
GEMMA_MAX_VIDEO_SEC = float(os.environ.get("GEMMA_MAX_VIDEO_SEC", "60"))
GEMMA_MAX_FRAMES = int(os.environ.get("GEMMA_MAX_FRAMES", "60"))
GEMMA_MAX_OUTPUT_TOKENS = int(os.environ.get("GEMMA_MAX_OUTPUT_TOKENS", "8192"))
# HF model IDs are case-sensitive: "E4B" capitalisation is required.
GEMMA_MODEL_ID = os.environ.get("GEMMA_MODEL_ID", "google/gemma-4-E4B-it")


def _modal_budget_usd() -> float:
    return float(os.environ.get("MODAL_GPU_MONTHLY_BUDGET_USD", DEFAULT_MODAL_BUDGET_USD))


def _price_multiplier() -> float:
    return float(os.environ.get("MODAL_PRICE_MULTIPLIER", DEFAULT_PRICE_MULTIPLIER))


def _gpu_rate(gpu_type: str) -> float:
    # Unknown GPU → fall back to B200 (most expensive) so we never under-estimate.
    base = GPU_USD_PER_SEC_BASE.get(gpu_type.upper(), GPU_USD_PER_SEC_BASE["B200"])
    return base * _price_multiplier()


def _current_month_key() -> str:
    from datetime import datetime, timezone

    d = datetime.now(timezone.utc)
    return f"{d.year:04d}-{d.month:02d}"


def _modal_mtd_usd() -> float:
    entry = modal_budget_ledger.get(_current_month_key(), default=None)
    if not entry:
        return 0.0
    return float(entry.get("spend_usd", 0.0))


def _assert_modal_budget(gpu_type: str, timeout_sec: int) -> None:
    """Refuse the call if the worst-case timeout cost would exceed remaining budget."""
    worst_case = timeout_sec * _gpu_rate(gpu_type)
    remaining = max(0.0, _modal_budget_usd() - _modal_mtd_usd())
    if worst_case > remaining:
        raise RuntimeError(
            f"Modal GPU call worst-case ${worst_case:.4f} ({gpu_type}, {timeout_sec}s) "
            f"exceeds remaining ${remaining:.4f} of MODAL_GPU_MONTHLY_BUDGET_USD="
            f"${_modal_budget_usd()}. Refusing to launch GPU. "
            f"Raise the budget or shorten GEMMA_TIMEOUT_SEC to override."
        )


def _record_modal_spend(gpu_type: str, seconds: float) -> tuple[float, float]:
    spend = seconds * _gpu_rate(gpu_type)
    key = _current_month_key()
    cur = modal_budget_ledger.get(key, default={"spend_usd": 0.0, "calls": 0})
    cur["spend_usd"] = float(cur.get("spend_usd", 0.0)) + spend
    cur["calls"] = int(cur.get("calls", 0)) + 1
    cur["last_updated"] = time.time()
    modal_budget_ledger[key] = cur
    return spend, cur["spend_usd"]


# ---------- Gemma inference ----------

SYSTEM_INSTRUCTION = (
    "You are a Spatio-Temporal Occupancy Network analyzing video frames as a 4D scene. "
    "Return ONLY valid JSON conforming to this exact shape — no prose, no markdown fences:\n"
    '{"frames":[{'
    '"timestamp":"MM:SS.mmm",'
    '"agents":[{'
    '"id":"a1",'
    '"label":"vehicle|pedestrian|cyclist|player|ball|other",'
    '"pos_2d":[x,y],'
    '"pos_3d":[x,y,z],'
    '"velocity":[vx,vy,vz],'
    '"heading_deg":0,'
    '"confidence":0.9,'
    '"intent":"...",'
    '"trajectory_forecast":[[x,y,z],[x,y,z],[x,y,z]]'
    "}],"
    '"scene_context":"..."'
    "}]}\n"
    "Coordinates: pos_2d in [0,1000] image space, pos_3d in metres relative to camera "
    "origin (0,0,0) with +Z forward, +X right, +Y up. Maintain stable IDs across frames "
    "with up to 2 seconds of occlusion persistence via velocity extrapolation. "
    "trajectory_forecast: 3 future positions at T+1s, T+2s, T+3s."
)


@app.function(
    timeout=GEMMA_TIMEOUT_SEC,
    gpu=GEMMA_GPU,
    secrets=[secret],
    volumes={"/root/.cache/huggingface": hf_cache},
    cpu=2.0,
)
def analyze_with_gemma(
    video_url: str,
    fps: float = 1.0,
    timestamps: list[float] | None = None,
    model_id: str | None = None,
) -> dict[str, Any]:
    """
    Decode frames at given timestamps (or sample uniformly at `fps`), run Gemma,
    return a FramesResponse-compatible dict. Identical contract to
    pipeline.py::analyze_with_gemini.
    """
    # Pre-flight: refuse if remaining monthly budget can't cover the timeout worst case.
    _assert_modal_budget(GEMMA_GPU, GEMMA_TIMEOUT_SEC)

    model_id = model_id or GEMMA_MODEL_ID

    import cv2
    import requests
    import torch
    from PIL import Image
    # Gemma 4 ships its own conditional-generation class. AutoModelForImageTextToText
    # is the wrong base — it's for image-only VLMs and won't load Gemma 4's video
    # processor. AutoModelForConditionalGeneration auto-resolves to Gemma4ForConditionalGeneration.
    from transformers import AutoProcessor, AutoModelForConditionalGeneration

    t_start = time.time()

    # 1. Download the source clip.
    with tempfile.NamedTemporaryFile(suffix=".mp4", delete=False) as tmp:
        r = requests.get(video_url, timeout=60, stream=True)
        r.raise_for_status()
        for chunk in r.iter_content(chunk_size=1 << 16):
            tmp.write(chunk)
        path = tmp.name

    # 2. Decode frames at the requested timestamps (or uniform sampling at fps).
    cap = cv2.VideoCapture(path)
    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    n_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    duration = n_frames / src_fps if src_fps else 0.0

    if duration > GEMMA_MAX_VIDEO_SEC:
        cap.release()
        os.unlink(path)
        raise RuntimeError(
            f"Video {duration:.1f}s exceeds GEMMA_MAX_VIDEO_SEC={GEMMA_MAX_VIDEO_SEC}s"
        )

    if timestamps is None:
        step = max(1.0 / fps, 1.0 / src_fps)
        timestamps = [round(t, 3) for t in _frange(0.0, duration, step)]

    if len(timestamps) > GEMMA_MAX_FRAMES:
        cap.release()
        os.unlink(path)
        raise RuntimeError(
            f"{len(timestamps)} frames exceeds GEMMA_MAX_FRAMES={GEMMA_MAX_FRAMES}. "
            "Lower fps or trim the clip."
        )

    pil_frames: list[tuple[float, Image.Image]] = []
    for t in timestamps:
        cap.set(cv2.CAP_PROP_POS_MSEC, t * 1000.0)
        ok, frame = cap.read()
        if not ok:
            continue
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        pil_frames.append((t, Image.fromarray(rgb)))
    cap.release()
    os.unlink(path)

    if not pil_frames:
        raise RuntimeError("No frames decoded from video")

    # 3. Load model from the persistent HF cache volume.
    hf_token = os.environ.get("HF_TOKEN")
    if not hf_token:
        raise RuntimeError(
            "HF_TOKEN missing from kaleidoscope-secrets. "
            "Gemma weights are gated; add the token via `modal secret`."
        )

    processor = AutoProcessor.from_pretrained(model_id, token=hf_token)
    model = AutoModelForConditionalGeneration.from_pretrained(
        model_id,
        torch_dtype=torch.bfloat16,
        device_map="auto",
        attn_implementation="sdpa",
        token=hf_token,
    )

    # 4. Build chat-template messages: system prompt + image sequence + user ask.
    content_parts: list[dict[str, Any]] = [
        {"type": "text", "text": SYSTEM_INSTRUCTION},
        {
            "type": "text",
            "text": f"\n\n{len(pil_frames)} frames follow at timestamps "
            f"{[round(t, 3) for t, _ in pil_frames]} seconds:",
        },
    ]
    for _, img in pil_frames:
        content_parts.append({"type": "image", "image": img})
    content_parts.append(
        {
            "type": "text",
            "text": "Output the JSON now. Use the exact timestamps listed above as MM:SS.mmm strings.",
        }
    )

    messages = [{"role": "user", "content": content_parts}]
    inputs = processor.apply_chat_template(
        messages,
        add_generation_prompt=True,
        tokenize=True,
        return_tensors="pt",
        return_dict=True,
    )
    inputs = {k: v.to(model.device) for k, v in inputs.items()}

    # 5. Generate with a hard output cap.
    with torch.inference_mode():
        out = model.generate(
            **inputs,
            max_new_tokens=GEMMA_MAX_OUTPUT_TOKENS,
            do_sample=False,
        )

    raw = processor.batch_decode(
        out[:, inputs["input_ids"].shape[-1] :],
        skip_special_tokens=True,
    )[0]

    # 6. Parse. Strip markdown fences if the model emitted them despite instructions.
    raw_clean = raw.strip()
    if raw_clean.startswith("```"):
        # Remove ``` or ```json ... ```
        parts = raw_clean.split("```")
        raw_clean = parts[1] if len(parts) > 1 else raw_clean
        if raw_clean.startswith("json"):
            raw_clean = raw_clean[len("json") :].lstrip()
        raw_clean = raw_clean.rstrip("`").strip()

    parsed = FramesResponse.model_validate_json(raw_clean)

    # 7. Record actual GPU spend.
    elapsed = time.time() - t_start
    spend_usd, mtd_usd = _record_modal_spend(GEMMA_GPU, elapsed)

    return {
        "model": model_id,
        "gpu": GEMMA_GPU,
        "elapsed_sec": elapsed,
        "spend_usd": spend_usd,
        "month_to_date_usd": mtd_usd,
        "frames": [f.model_dump() for f in parsed.frames],
    }


def _frange(start: float, stop: float, step: float) -> list[float]:
    out: list[float] = []
    t = start
    while t < stop:
        out.append(t)
        t += step
    return out


# ---------- Top-level orchestration (parity with pipeline.py::analyze) ----------


@app.function(timeout=900, cpu=2.0)
def analyze(
    video_url: str,
    scene_id: str,
    fps: float = 1.0,
) -> dict[str, Any]:
    """Single-call orchestrator. Returns the bundle the bake script writes to Postgres."""
    t0 = time.time()
    gemma_result = analyze_with_gemma.remote(video_url=video_url, fps=fps)
    total_latency_ms = int((time.time() - t0) * 1000)

    return {
        "scene_id": scene_id,
        "video_url": video_url,
        "model": gemma_result["model"],
        "gpu": gemma_result["gpu"],
        "modal_latency_ms": total_latency_ms,
        "gemma_elapsed_sec": gemma_result["elapsed_sec"],
        "spend_usd": gemma_result["spend_usd"],
        "month_to_date_usd": gemma_result["month_to_date_usd"],
        "frames": gemma_result["frames"],
    }


# ---------- Webhook ----------


@app.function(secrets=[secret], cpu=1.0)
@modal.fastapi_endpoint(method="POST")
def bake_webhook(payload: dict[str, Any]) -> dict[str, Any]:
    """POST {video_url, scene_id, fps?} -> JSON result. Mirrors pipeline.py's webhook."""
    video_url = payload["video_url"]
    scene_id = payload["scene_id"]
    fps = float(payload.get("fps", 1.0))
    return analyze.remote(video_url=video_url, scene_id=scene_id, fps=fps)


# ---------- Local entrypoint ----------


@app.local_entrypoint()
def main(video_url: str, scene_id: str = "test_scene", fps: float = 1.0) -> None:
    import json

    out = analyze.remote(video_url=video_url, scene_id=scene_id, fps=fps)
    print(json.dumps(out, indent=2))
