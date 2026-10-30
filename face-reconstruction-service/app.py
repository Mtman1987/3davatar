from __future__ import annotations

import os
import shutil
import subprocess
import tempfile
import threading
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, Header, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent
PIPELINE_ROOT = Path(os.environ.get("FACE_PIPELINE_ROOT", "/opt/humanoid-face"))
MODEL_DIR = Path(os.environ.get("FACE_MODEL_DIR", "/models"))
WORK_ROOT = Path(os.environ.get("FACE_WORK_ROOT", "/var/lib/avatarace/jobs"))
API_TOKEN = os.environ.get("FACE_RECONSTRUCTION_TOKEN", "")
MAX_UPLOAD_BYTES = int(os.environ.get("FACE_MAX_UPLOAD_BYTES", str(12 * 1024 * 1024)))
MAX_PHOTOS = 5

app = FastAPI(title="AvatarAce Face Reconstruction", version="0.1.0")
_lock = threading.Lock()
_jobs: dict[str, dict[str, Any]] = {}


class JobResponse(BaseModel):
    id: str
    status: str
    message: str


def authorize(token: str | None) -> None:
    if not API_TOKEN:
        raise HTTPException(503, "Reconstruction service is not configured")
    if token != API_TOKEN:
        raise HTTPException(401, "Invalid reconstruction service token")


@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "ok": True,
        "pipeline_available": (PIPELINE_ROOT / "scripts" / "run_pipeline.py").is_file(),
        "flame_model_available": (MODEL_DIR / "flame2023_open.pkl").is_file(),
        "version": app.version,
    }


@app.post("/v1/reconstructions", response_model=JobResponse, status_code=202)
async def create_reconstruction(
    photos: list[UploadFile] = File(...),
    x_face_reconstruction_token: str | None = Header(default=None),
) -> JobResponse:
    authorize(x_face_reconstruction_token)
    if not 1 <= len(photos) <= MAX_PHOTOS:
        raise HTTPException(400, "Upload between one and five portrait photos")

    job_id = uuid.uuid4().hex
    job_dir = WORK_ROOT / job_id
    input_dir = job_dir / "input"
    output_dir = job_dir / "output"
    input_dir.mkdir(parents=True, exist_ok=False)
    output_dir.mkdir(parents=True, exist_ok=True)

    total = 0
    saved: list[Path] = []
    try:
        for index, upload in enumerate(photos):
            suffix = Path(upload.filename or "").suffix.lower()
            if suffix not in {".jpg", ".jpeg", ".png", ".webp"}:
                raise HTTPException(415, "Photos must be JPG, PNG, or WebP")
            target = input_dir / f"photo-{index}{suffix}"
            with target.open("wb") as stream:
                while chunk := await upload.read(1024 * 1024):
                    total += len(chunk)
                    if total > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, "Combined photo upload exceeds the size limit")
                    stream.write(chunk)
            if target.stat().st_size == 0:
                raise HTTPException(400, "An uploaded photo is empty")
            saved.append(target)
    except Exception:
        shutil.rmtree(job_dir, ignore_errors=True)
        raise

    with _lock:
        _jobs[job_id] = {"status": "queued", "message": "Photos accepted", "directory": str(job_dir)}

    threading.Thread(
        target=run_pipeline,
        args=(job_id, saved, output_dir),
        daemon=True,
    ).start()
    return JobResponse(id=job_id, status="queued", message="Reconstruction accepted")


def run_pipeline(job_id: str, photos: list[Path], output_dir: Path) -> None:
    with _lock:
        _jobs[job_id].update(status="running", message="Reconstructing photo-specific head geometry")
    try:
        env = os.environ.copy()
        env["FACE_MODEL_DIR"] = str(MODEL_DIR)
        command = [
            "python", str(PIPELINE_ROOT / "scripts" / "run_pipeline.py"),
            "--photos", *map(str, photos),
            "--output", str(output_dir),
            "--config", str(PIPELINE_ROOT / "configs" / "default.yaml"),
            "--detail", "60",
        ]
        completed = subprocess.run(
            command, cwd=PIPELINE_ROOT, env=env, capture_output=True,
            text=True, timeout=1800, check=False,
        )
        if completed.returncode != 0:
            raise RuntimeError((completed.stderr or completed.stdout)[-6000:])
        required = ["head_mesh.obj", "blendshapes_arkit52.json"]
        missing = [name for name in required if not (output_dir / name).is_file()]
        if missing:
            raise RuntimeError("Pipeline did not produce required assets: " + ", ".join(missing))
        with _lock:
            _jobs[job_id].update(status="complete", message="Geometry and facial-shape assets exported")
    except Exception as exc:
        with _lock:
            _jobs[job_id].update(status="failed", message=str(exc)[:6000])


@app.get("/v1/reconstructions/{job_id}")
def get_reconstruction(job_id: str, x_face_reconstruction_token: str | None = Header(default=None)) -> dict[str, str]:
    authorize(x_face_reconstruction_token)
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Reconstruction job not found")
        return {"id": job_id, "status": job["status"], "message": job["message"]}


@app.get("/v1/reconstructions/{job_id}/assets/{asset_name}")
def get_asset(
    job_id: str,
    asset_name: str,
    x_face_reconstruction_token: str | None = Header(default=None),
) -> FileResponse:
    authorize(x_face_reconstruction_token)
    allowed = {"head_mesh.obj", "head_mesh_detail.obj", "head_mesh.mtl", "blendshapes_arkit52.json", "manifest.json"}
    if asset_name not in allowed:
        raise HTTPException(404, "Asset not found")
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job["status"] != "complete":
            raise HTTPException(409, "Reconstruction is not complete")
        path = Path(job["directory"]) / "output" / asset_name
    if not path.is_file():
        raise HTTPException(404, "Asset not found")
    return FileResponse(path, filename=asset_name)
