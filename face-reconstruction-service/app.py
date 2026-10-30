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
        _jobs[job_id] = {"status": "queued", "message": "Photos accepted", "directory": str(job_dir), "log_path": str(job_dir / "pipeline.log"), "logs": []}

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
        env["FACE_RECONSTRUCTION_SKIP_CLAY"] = "1"
        command = [
            "python", str(PIPELINE_ROOT / "scripts" / "run_pipeline.py"),
            "--photos", *map(str, photos),
            "--output", str(output_dir),
            "--config", str(PIPELINE_ROOT / "configs" / "default.yaml"),
            "--detail", os.environ.get("FACE_RECONSTRUCTION_DETAIL", "0"),
        ]
        log_path = Path(_jobs[job_id]["log_path"])
        log_path.parent.mkdir(parents=True, exist_ok=True)
        with log_path.open("w", encoding="utf-8", errors="replace") as log:
            process = subprocess.Popen(
                command, cwd=PIPELINE_ROOT, env=env,
                stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                text=True,
            )
            try:
                output, _ = process.communicate(timeout=1800)
            except subprocess.TimeoutExpired:
                process.kill()
                output, _ = process.communicate()
                log.write(output or "")
                log.flush()
                raise RuntimeError("Pipeline exceeded the 30-minute execution limit.")
            log.write(output or "")
            log.flush()
        output_lines = [line[-1000:] for line in (output or "").splitlines() if line.strip()]
        with _lock:
            _jobs[job_id]["logs"] = output_lines[-80:]
            if output_lines:
                _jobs[job_id]["message"] = output_lines[-1][-500:]
        if process.returncode != 0:
            raise RuntimeError("Pipeline exited with code " + str(process.returncode) + ". Last output:\n" + (output or "")[-6000:])
        import json
        stage5_path = output_dir / "stage5_export_manifest.json"
        if not stage5_path.is_file():
            raise RuntimeError("Pipeline did not produce its Stage 5 export manifest.")
        stage5 = json.loads(stage5_path.read_text())
        pipeline_manifest_path = output_dir / "manifest.json"
        if not pipeline_manifest_path.is_file():
            raise RuntimeError("Pipeline did not produce its diagnostic manifest.")
        pipeline_manifest = json.loads(pipeline_manifest_path.read_text())
        stage_status = pipeline_manifest.get("stage_status") or {}
        required_stages = ("stage6_7_texture", "stage8_pbr", "stage5_export")
        failed_stages = [name for name in required_stages if stage_status.get(name) != "ok"]
        if failed_stages:
            details = "; ".join(name + ": " + str(stage_status.get(name, "missing status")) for name in failed_stages)
            raise RuntimeError("Core reconstruction stages did not complete: " + details)
        required_paths = {
            "neutral_base_obj": stage5.get("neutral_base_obj"),
            "blendshapes_json": stage5.get("blendshapes_json"),
            "armature_json": stage5.get("armature_json"),
        }
        missing = [key for key, value in required_paths.items() if not value or not Path(value).is_file()]
        if missing:
            raise RuntimeError("Stage 5 did not produce required native head assets: " + ", ".join(missing))

        # Stage 5 emits absolute paths. Publish every supported texture in the
        # job output root so the browser never receives server filesystem paths.
        def publish_asset(value: str | Path) -> str:
            source = Path(value).resolve()
            root = output_dir.resolve()
            if not source.is_file() or root not in source.parents:
                raise RuntimeError("Generated asset is missing or outside the job output directory.")
            target = root / source.name
            if source != target:
                shutil.copy2(source, target)
            return target.name

        assets: dict[str, str] = {}
        for key, value in (stage5.get("detail_maps") or {}).items():
            if value:
                try:
                    assets[key] = publish_asset(value)
                except RuntimeError:
                    continue
        browser_manifest = {
            "version": "1.0",
            "status": "success",
            "neutral_base_obj": publish_asset(required_paths["neutral_base_obj"]),
            "blendshapes_json": publish_asset(required_paths["blendshapes_json"]),
            "armature_json": publish_asset(required_paths["armature_json"]),
            "detail_maps": assets,
            "num_vertices": stage5.get("num_vertices"),
            "num_triangles": stage5.get("num_triangles"),
            "arkit_blendshapes_count": stage5.get("arkit_blendshapes_count"),
            "units": "meters",
            "attachment": {"joint": "head", "coordinate_space": "neck-root"},
        }
        (output_dir / "avatarace_head_manifest.json").write_text(json.dumps(browser_manifest, indent=2))
        with _lock:
            _jobs[job_id].update(status="complete", message="Native head geometry, ARKit morphs, rig, and texture assets exported")
    except Exception as exc:
        with _lock:
            job = _jobs.get(job_id, {})
            log_path = Path(job.get("log_path", output_dir.parent / "pipeline.log"))
            try:
                with log_path.open("a", encoding="utf-8") as log:
                    log.write("\n[AvatarAce service error] " + repr(exc) + "\n")
            except OSError:
                pass
            job.update(status="failed", message=str(exc)[:6000])
            _jobs[job_id] = job


@app.get("/v1/reconstructions/{job_id}")
def get_reconstruction(job_id: str, x_face_reconstruction_token: str | None = Header(default=None)) -> dict[str, Any]:
    authorize(x_face_reconstruction_token)
    with _lock:
        job = _jobs.get(job_id)
        if job is None:
            raise HTTPException(404, "Reconstruction job not found")
        return {"id": job_id, "status": job["status"], "message": job["message"], "logs": job.get("logs", [])}


@app.get("/v1/reconstructions/{job_id}/assets/{asset_name}")
def get_asset(
    job_id: str,
    asset_name: str,
    x_face_reconstruction_token: str | None = Header(default=None),
) -> FileResponse:
    authorize(x_face_reconstruction_token)
    if Path(asset_name).name != asset_name or asset_name in {".", ".."}:
        raise HTTPException(404, "Asset not found")
    with _lock:
        job = _jobs.get(job_id)
        if job is None or job["status"] != "complete":
            raise HTTPException(409, "Reconstruction is not complete")
        path = Path(job["directory"]) / "output" / asset_name
    if not path.is_file():
        raise HTTPException(404, "Asset not found")
    return FileResponse(path, filename=asset_name)
