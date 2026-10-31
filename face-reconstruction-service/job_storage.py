"""Private, restart-safe reconstruction state and manifest-bounded exports."""
from __future__ import annotations

import io
import json
import os
import re
import zipfile
from pathlib import Path
from typing import Any

JOB_ID = re.compile(r"^[a-f0-9]{32}$")
ASSET_NAME = re.compile(r"^[a-zA-Z0-9_.-]{1,180}$")
MANIFEST = "avatarace_head_manifest.json"
REQUIRED = ("neutral_base_obj", "blendshapes_json", "armature_json", "facial_landmarks_json")
MAX_BUNDLE_BYTES = 96 * 1024 * 1024


def job_directory(work_root: Path, job_id: str) -> Path:
    if not JOB_ID.fullmatch(job_id):
        raise ValueError("Invalid reconstruction job ID")
    root = work_root.resolve()
    directory = root / job_id
    # Reject job symlinks, including links into another valid job.
    if directory.is_symlink() or directory.resolve().parent != root:
        raise ValueError("Invalid reconstruction job directory")
    return directory


def published_assets(directory: Path) -> list[Path]:
    output = directory / "output"
    if output.is_symlink():
        raise ValueError("Invalid reconstruction output directory")
    root = output.resolve()
    manifest_path = output / MANIFEST
    if manifest_path.is_symlink():
        raise ValueError("Invalid head manifest")
    manifest = json.loads(manifest_path.read_text())
    if manifest.get("status") != "success" or any(not manifest.get(key) for key in REQUIRED):
        raise ValueError("Head manifest is incomplete")
    maps = manifest.get("detail_maps") or {}
    if not isinstance(maps, dict):
        raise ValueError("Invalid head texture manifest")
    names = [MANIFEST, *(manifest[key] for key in REQUIRED), *(name for name in maps.values() if name)]
    assets: list[Path] = []
    for name in dict.fromkeys(names):
        if not isinstance(name, str) or not ASSET_NAME.fullmatch(name) or name in {".", ".."}:
            raise ValueError("Invalid published asset name")
        path = output / name
        if path.is_symlink() or path.resolve().parent != root or not path.is_file():
            raise ValueError("Published head asset is missing or outside the output directory")
        assets.append(path)
    return assets


def write_job(directory: Path, job: dict[str, Any]) -> None:
    """Atomic replace prevents a process interruption from truncating job state."""
    state = {key: job.get(key) for key in ("status", "message", "logs")}
    temporary = directory / "job.json.tmp"
    with temporary.open("w", encoding="utf-8") as stream:
        json.dump(state, stream)
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(directory / "job.json")


def recover_job(work_root: Path, job_id: str) -> dict[str, Any] | None:
    directory = job_directory(work_root, job_id)
    if not directory.is_dir():
        return None
    state: dict[str, Any] = {}
    try:
        path = directory / "job.json"
        if not path.is_symlink():
            loaded = json.loads(path.read_text())
            if isinstance(loaded, dict):
                state = loaded
    except (OSError, ValueError):
        pass
    # Also recover legacy completed jobs which never wrote job.json.
    try:
        published_assets(directory)
        state.update(status="complete", message="Saved head recovered from disk")
    except (OSError, ValueError, TypeError):
        if state.get("status") != "failed":
            state.update(status="failed", message="Reconstruction was interrupted or its exported assets are incomplete. Generate the head again.")
    state.update(directory=str(directory), log_path=str(directory / "pipeline.log"))
    state["logs"] = state.get("logs") if isinstance(state.get("logs"), list) else []
    return state


def head_bundle(directory: Path) -> bytes:
    """Only manifest-referenced head files, never source photos or job logs."""
    assets = published_assets(directory)
    if sum(path.stat().st_size for path in assets) > MAX_BUNDLE_BYTES:
        raise ValueError("Head package exceeds the 96 MiB diagnostic download limit")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in assets:
            archive.write(path, path.name)
    return buffer.getvalue()