"""
FLAME region masks in UV space.

Sources:
  * vertex masks (face, forehead, nose, lips, eye_region, scalp, neck, ears, eyeballs, boundary):
    by default our clean-room masks built from FLAME 2023 Open geometry + MediaPipe landmarks
    (data/flame_model/region_masks_open.npz, scripts/build_clean_assets.py; commercial path).
    The official FLAME masks shipped with MICA (non-commercial) can be selected explicitly with
    `flame.region_masks` (research config) or set_default_masks(); and
  * landmark-derived feature masks (brows, eye openings, lip border), drawn in UV from the
    68-landmark embedding on the mesh, because FLAME has no brow region.

Also provides the per-texel physical scale (mm per texel), which varies ~2x over FLAME UV.
"""
from __future__ import annotations

import pickle
from pathlib import Path
from typing import Dict, Optional

import cv2
import numpy as np

from src.render.soft_raster import RasterOut

ROOT = Path(__file__).resolve().parents[2]
MASKS_PKL = ROOT / "vendor" / "MICA" / "data" / "FLAME2020" / "FLAME_masks" / "FLAME_masks.pkl"   # non-commercial
MASKS_OPEN = ROOT / "data" / "flame_model" / "region_masks_open.npz"                                # clean-room
_default_masks: Path = MASKS_OPEN


def set_default_masks(path) -> None:
    """Select the vertex-mask file used when load_vertex_masks() is called without a path."""
    global _default_masks
    _default_masks = Path(path) if Path(path).is_absolute() else ROOT / path


def load_vertex_masks(path: Optional[Path] = None) -> Dict[str, np.ndarray]:
    p = Path(path) if path else _default_masks
    if not p.exists():
        hint = ("run `python3 scripts/build_clean_assets.py`" if p == MASKS_OPEN
                else "check flame.region_masks in the config (the MICA masks need the vendor/MICA submodule)")
        raise FileNotFoundError(f"FLAME region masks not found at {p}: {hint}.")
    if p.suffix == ".npz":
        m = np.load(p)
        return {k: np.asarray(m[k], np.int64) for k in m.files if k != "source"}
    with open(p, "rb") as fh:
        m = pickle.load(fh, encoding="latin1")
    return {k: np.asarray(v, np.int64) for k, v in m.items()}


def face_region_masks(faces: np.ndarray, n_verts: int, vmasks: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
    """(F,) bool per region: a face belongs to a region when all 3 vertices do."""
    out = {}
    for k, idx in vmasks.items():
        vm = np.zeros(n_verts, bool)
        vm[idx] = True
        out[k] = vm[faces].all(1)
    return out


def texel_scale_mm(uv_raster: RasterOut, vertices: np.ndarray, faces: np.ndarray,
                   uv: np.ndarray, uv_faces: np.ndarray) -> np.ndarray:
    """(R,R) millimetres per texel (0 outside the UV islands)."""
    R = uv_raster.mask.shape[0]
    v = vertices.astype(np.float64)
    a3 = 0.5 * np.linalg.norm(np.cross(v[faces[:, 1]] - v[faces[:, 0]], v[faces[:, 2]] - v[faces[:, 0]]), axis=1) * 1e6
    t = uv[uv_faces] * R
    a2 = 0.5 * np.abs((t[:, 1, 0] - t[:, 0, 0]) * (t[:, 2, 1] - t[:, 0, 1]) - (t[:, 1, 1] - t[:, 0, 1]) * (t[:, 2, 0] - t[:, 0, 0]))
    per_face = np.sqrt(a3 / np.maximum(a2, 1e-9)).astype(np.float32)
    out = np.zeros((R, R), np.float32)
    m = uv_raster.mask
    out[m] = per_face[uv_raster.face_id[m]]
    # smooth per-face noise, keep islands
    num = cv2.GaussianBlur(out, (0, 0), 4)
    den = cv2.GaussianBlur(m.astype(np.float32), (0, 0), 4)
    return np.where(m, num / np.maximum(den, 1e-6), 0).astype(np.float32)


def uv_region_masks(uv_raster: RasterOut, face_masks: Dict[str, np.ndarray]) -> Dict[str, np.ndarray]:
    m = uv_raster.mask
    fid = np.clip(uv_raster.face_id, 0, None)
    return {k: m & fm[fid] for k, fm in face_masks.items()}


def landmark_uv(emb: Dict[str, np.ndarray], faces: np.ndarray, uv: np.ndarray, uv_faces: np.ndarray) -> np.ndarray:
    """(68, 2) UV coordinates of FLAME's 68-landmark embedding."""
    fidx = emb["full_lmk_faces_idx"].astype(np.int64).reshape(-1)
    bary = emb["full_lmk_bary_coords"].reshape(-1, 3)
    return (uv[uv_faces[fidx]] * bary[..., None]).sum(1)


def feature_masks(lmk_uv: np.ndarray, R: int) -> Dict[str, np.ndarray]:
    """
    Landmark-driven masks in UV: brows (thick polyline), eye openings (polygons),
    lip border band and inner mouth. Sizes scale with the UV inter-ocular distance.
    """
    px = np.stack([lmk_uv[:, 0] * R, (1 - lmk_uv[:, 1]) * R], 1)
    iod = float(np.linalg.norm(px[36:42].mean(0) - px[42:48].mean(0)))
    out = {}

    brows = np.zeros((R, R), np.uint8)
    thick = max(2, int(0.16 * iod))
    for seg in (range(17, 22), range(22, 27)):
        pts = np.round(px[list(seg)]).astype(np.int32)
        cv2.polylines(brows, [pts], False, 1, thickness=thick, lineType=cv2.LINE_AA)
    out["brows"] = brows > 0

    eyes = np.zeros((R, R), np.uint8)
    for seg in (range(36, 42), range(42, 48)):
        cv2.fillPoly(eyes, [np.round(px[list(seg)]).astype(np.int32)], 1)
    eyes = cv2.dilate(eyes, np.ones((max(3, int(0.08 * iod)),) * 2, np.uint8))
    out["eye_openings"] = eyes > 0

    outer = np.zeros((R, R), np.uint8)
    cv2.fillPoly(outer, [np.round(px[48:60]).astype(np.int32)], 1)
    k = max(3, int(0.06 * iod))
    ring = cv2.dilate(outer, np.ones((k, k), np.uint8)) - cv2.erode(outer, np.ones((k, k), np.uint8))
    out["lip_border"] = ring > 0
    out["lips_landmark"] = outer > 0
    return out


def embedding_uv(emb: Dict[str, np.ndarray], faces: np.ndarray, uv: np.ndarray, uv_faces: np.ndarray) -> np.ndarray:
    """UV coordinates of an embedding given as {face_idx, bary} (e.g. our MediaPipe embedding)."""
    fidx = np.asarray(emb["face_idx"]).astype(np.int64).reshape(-1)
    return (uv[uv_faces[fidx]] * np.asarray(emb["bary"]).reshape(-1, 3)[..., None]).sum(1)


MP_BROW_A = [70, 63, 105, 66, 107]
MP_BROW_B = [300, 293, 334, 296, 336]


def feature_masks_mp(lmk_uv: np.ndarray, R: int) -> Dict[str, np.ndarray]:
    """feature_masks() from MediaPipe landmarks through our own (commercial) embedding."""
    from src.stage0_preprocess.landmarks_mp import EYE_A, EYE_B, LIPS_OUTER
    px = np.stack([lmk_uv[:, 0] * R, (1 - lmk_uv[:, 1]) * R], 1)
    iod = float(np.linalg.norm(px[EYE_A].mean(0) - px[EYE_B].mean(0)))
    out = {}
    brows = np.zeros((R, R), np.uint8)
    for seg in (MP_BROW_A, MP_BROW_B):
        cv2.polylines(brows, [np.round(px[seg]).astype(np.int32)], False, 1,
                      thickness=max(2, int(0.16 * iod)), lineType=cv2.LINE_AA)
    out["brows"] = brows > 0
    eyes = np.zeros((R, R), np.uint8)
    for seg in (EYE_A, EYE_B):
        cv2.fillPoly(eyes, [np.round(px[seg]).astype(np.int32)], 1)
    out["eye_openings"] = cv2.dilate(eyes, np.ones((max(3, int(0.08 * iod)),) * 2, np.uint8)) > 0
    outer = np.zeros((R, R), np.uint8)
    cv2.fillPoly(outer, [np.round(px[LIPS_OUTER]).astype(np.int32)], 1)
    k = max(3, int(0.06 * iod))
    out["lip_border"] = (cv2.dilate(outer, np.ones((k, k), np.uint8)) - cv2.erode(outer, np.ones((k, k), np.uint8))) > 0
    out["lips_landmark"] = outer > 0
    return out
