"""
Stage 0: camera intrinsics from photo metadata.

v1 hardcoded f = image_width (≈53° FOV). Portrait photos are usually shot at 85–150 mm,
where that assumption is ~5–8x wrong and every projection downstream samples the wrong
pixels. Here the focal length in pixels is read from EXIF; when EXIF is absent, the
caller must estimate it (see src/stage2_expression/landmark_fit.py focal sweep).
"""
from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path
from typing import Optional, Tuple, Union

import numpy as np

# EXIF FocalPlaneResolutionUnit -> millimetres per unit
_UNIT_MM = {2: 25.4, 3: 10.0, 4: 1.0, 5: 0.001}


@dataclass
class Intrinsics:
    fx: float
    fy: float
    cx: float
    cy: float
    source: str                    # 'exif_focal_plane' | 'exif_35mm' | 'estimated'

    @property
    def K(self) -> np.ndarray:
        return np.array([[self.fx, 0.0, self.cx], [0.0, self.fy, self.cy], [0.0, 0.0, 1.0]])

    def scaled(self, s: float) -> "Intrinsics":
        return Intrinsics(self.fx * s, self.fy * s, self.cx * s, self.cy * s, self.source)

    def to_dict(self) -> dict:
        return {"fx": self.fx, "fy": self.fy, "cx": self.cx, "cy": self.cy, "source": self.source}


def _rational(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (TypeError, ValueError):
        pass
    if isinstance(v, tuple) and len(v) == 2 and v[1]:
        return float(v[0]) / float(v[1])
    return None


def read_exif_focal(path: Union[str, Path]) -> dict:
    """Returns the raw focal-related EXIF fields (missing fields are None)."""
    from PIL import Image

    with Image.open(path) as im:
        exif = im.getexif()
        sub = exif.get_ifd(0x8769) if exif else {}
    return {
        "focal_mm": _rational(sub.get(0x920A)),
        "focal_35mm": _rational(sub.get(0xA405)),
        "focal_plane_x_res": _rational(sub.get(0xA20E)),
        "focal_plane_unit": sub.get(0xA210),
        "pixel_x_dimension": sub.get(0xA002),
        "camera_model": exif.get(0x0110) if exif else None,
        "datetime_original": sub.get(0x9003) or (exif.get(0x0132) if exif else None),
    }


def same_session(paths, max_minutes: float = 30.0) -> Tuple[bool, str]:
    """
    Were these photos taken in one sitting (same camera, capture times within `max_minutes`)?
    Unknown (missing EXIF) counts as yes; the caller should still check photo-consistency.
    """
    from datetime import datetime

    info = [read_exif_focal(p) for p in paths]
    models = {i["camera_model"] for i in info if i["camera_model"]}
    if len(models) > 1:
        return False, f"different cameras: {sorted(models)}"
    times = []
    for i in info:
        try:
            times.append(datetime.strptime(str(i["datetime_original"]).strip(), "%Y:%m:%d %H:%M:%S"))
        except (TypeError, ValueError):
            pass
    if len(times) >= 2:
        span = (max(times) - min(times)).total_seconds() / 60.0
        if span > max_minutes:
            return False, f"capture times span {span:.0f} min"
    return True, "ok" if len(times) >= 2 else "no EXIF capture times"


def intrinsics_from_exif(path: Union[str, Path], image_hw: Tuple[int, int]) -> Optional[Intrinsics]:
    """
    Focal length in pixels from EXIF, or None if the photo carries no usable focal data.

    Preferred: focal_mm × sensor sampling (FocalPlaneXResolution). This stays valid for
    crops, which is how portraits are usually delivered. A crop and a downscale cannot be
    told apart reliably from EXIF (editors write PixelXDimension inconsistently), so the
    value is a prior: the landmark fitter refines it within [0.5x, 2x]. At portrait focal
    lengths a 2x focal error changes perspective far less than v1's f = width did.
    Fallback: 35 mm-equivalent focal over the image diagonal (valid for uncropped images).
    """
    h, w = image_hw
    e = read_exif_focal(path)
    cx, cy = w / 2.0, h / 2.0

    if e["focal_mm"] and e["focal_plane_x_res"] and e["focal_plane_unit"] in _UNIT_MM:
        px_per_mm = e["focal_plane_x_res"] / _UNIT_MM[e["focal_plane_unit"]]
        f = e["focal_mm"] * px_per_mm
        return Intrinsics(f, f, cx, cy, "exif_focal_plane")

    if e["focal_35mm"]:
        f = e["focal_35mm"] / 43.27 * float(np.hypot(w, h))
        return Intrinsics(f, f, cx, cy, "exif_35mm")
    return None


def intrinsics_from_fov(image_hw: Tuple[int, int], focal_35mm: float) -> Intrinsics:
    """Candidate intrinsics for a 35 mm-equivalent focal (used by the focal sweep)."""
    h, w = image_hw
    f = focal_35mm / 43.27 * float(np.hypot(w, h))
    return Intrinsics(f, f, w / 2.0, h / 2.0, "estimated")
