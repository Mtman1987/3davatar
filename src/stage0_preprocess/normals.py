"""
Stage 0: per-pixel surface normals of the face from one photo (Microsoft DAViD, MIT code and
weights, trained on the synthetic SynthHuman set, CDLA-Permissive-2.0).

The fitter compares these with the rendered normals of the FLAME fit (render-and-compare on
geometry: unlike the photo's colours, normals cannot be matched by painting the photo onto a
wrong shape). Output is in our camera frame: x right, y down, z away from the camera, so a
surface facing the camera has n_z < 0.
"""
from __future__ import annotations

import sys
from pathlib import Path
from typing import Optional, Union

import numpy as np

_ROOT = Path(__file__).resolve().parents[2]
_DEFAULT_MODEL = _ROOT / "models_cache" / "david" / "normal-model-vitb16_384.onnx"
_MODEL_URL = "https://facesyntheticspubwedata.z6.web.core.windows.net/iccv-2025/models/normal-model-vitb16_384.onnx"
# DAViD: x right, y up, z towards the camera -> ours
_TO_CAM = np.array([1.0, -1.0, -1.0], np.float32)


class FaceNormalEstimator:
    def __init__(self, model_path: Optional[Union[str, Path]] = None, margin: float = 1.25):
        path = Path(model_path) if model_path else _DEFAULT_MODEL
        if not path.exists():
            raise FileNotFoundError(
                f"DAViD normal model not found at {path}. Download (449 MB) with:\n  curl -L -o {path} {_MODEL_URL}")
        runtime = str(_ROOT / "vendor" / "david_runtime")
        if runtime not in sys.path:
            sys.path.insert(0, runtime)
        from surface_normal_estimator import SurfaceNormalEstimator
        self.est = SurfaceNormalEstimator(str(path), providers=["CPUExecutionProvider"])
        self.margin = margin

    def predict(self, image_bgr: np.ndarray, bbox) -> np.ndarray:
        """(H, W, 3) float32 unit normals in the camera frame on a square crop around the face bbox,
        zero outside it."""
        H, W = image_bgr.shape[:2]
        x0, y0, x1, y1 = bbox
        s = self.margin * max(x1 - x0, y1 - y0)
        a, b = int(max(0, (x0 + x1) / 2 - s / 2)), int(max(0, (y0 + y1) / 2 - s / 2))
        e, f = int(min(W, a + s)), int(min(H, b + s))
        out = np.zeros((H, W, 3), np.float32)
        out[b:f, a:e] = self.est.estimate_normal(image_bgr[b:f, a:e]) * _TO_CAM
        return out
