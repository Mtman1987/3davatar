"""
Detail-recovery test: cut a known deep groove under both eyes of the ground-truth scan.

The groove follows the tear-trough line (nasojugal groove): it starts just below the inner eye
corner and runs down and outwards to about 11-12 mm below the lower-lid centre. Its depth along
the line ramps up over the first 15%, holds, and fades out over the last 45%; across the line
it is Gaussian (sigma = --sigma-mm). The line is built from MediaPipe landmarks ray-cast onto the
scan (lps_front render), projected onto the scan surface and drawn into a 16-bit relief-edit map
in the scan's UV space (value 1 = unchanged, 0 = full depth), which
`scripts/render_gt_scan.py --extra-disp <map> --extra-disp-mm <depth>` applies after the scan's
own displacement.

Outputs (data/external/lee_perry_smith/edits/):
  groove_uv.png     relief-edit map (Blender orientation, 4096x4096, 16-bit)
  groove_gt.json    3D centreline points (lps_front camera frame, metres) with depth fractions

  python3 scripts/make_groove_scan.py --depth-mm 2.5 --sigma-mm 2.0
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import cv2
import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from evaluation.gt_scan_eval import load_scan_camera_frame, scan_landmarks_3d  # noqa: E402
from src.stage0_preprocess.camera import intrinsics_from_exif  # noqa: E402
from src.stage0_preprocess.landmarks_mp import MediaPipeLandmarker  # noqa: E402

UNITS_PER_M = 19.17
LPS = ROOT / "data" / "external" / "lee_perry_smith"
# lower lid, inner corner -> just past the centre (MediaPipe indices), and the downward offset (mm)
LIDS = {"right": [133, 155, 154, 153, 145, 144], "left": [362, 382, 381, 380, 374, 373]}
DROP_MM = [3.5, 5.0, 6.5, 8.5, 11.0, 12.0]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--depth-mm", type=float, default=2.5)
    ap.add_argument("--sigma-mm", type=float, default=2.0)
    ap.add_argument("--res", type=int, default=4096)
    a = ap.parse_args()
    d = ROOT / "outputs" / "gt_scan" / "lps_front"
    im = cv2.imread(str(d / "photo.jpg"))
    scan = load_scan_camera_frame(LPS / "LeePerrySmith.glb", d / "camera_blender.json")
    K = intrinsics_from_exif(str(d / "photo.jpg"), im.shape[:2])
    l3, _ = scan_landmarks_3d(scan, im, K.K, MediaPipeLandmarker())
    uv = np.asarray(trimesh.load(str(LPS / "LeePerrySmith.glb"), force="mesh", process=False).visual.uv)
    up = l3[10] - l3[152]
    up /= np.linalg.norm(up)
    R = a.res
    field = np.zeros((R, R), np.float32)
    gt = {"depth_mm": a.depth_mm, "sigma_mm": a.sigma_mm, "frame": "lps_front camera (m)", "lines": {}}
    for side, lid in LIDS.items():
        pts = np.stack([l3[i] - up * (dm / 1000.0 * UNITS_PER_M) for i, dm in zip(lid, DROP_MM)])
        # densify, then snap to the scan surface
        t = np.linspace(0, 1, len(pts))
        tt = np.linspace(0, 1, 120)
        dense = np.stack([np.interp(tt, t, pts[:, c]) for c in range(3)], 1)
        cp, _, tri = trimesh.proximity.closest_point(scan, dense)
        bary = trimesh.triangles.points_to_barycentric(scan.triangles[tri], cp)
        luv = (uv[scan.faces[tri]] * bary[..., None]).sum(1)
        px = np.stack([luv[:, 0] * R, (1 - luv[:, 1]) * R], 1)              # Blender image orientation
        # local texel scale (mm per UV pixel) from the touched triangles
        f = scan.faces[np.unique(tri)]
        a3 = trimesh.triangles.area(scan.vertices[f]).sum() / UNITS_PER_M ** 2 * 1e6
        t2 = uv[f] * R
        a2 = 0.5 * np.abs((t2[:, 1, 0] - t2[:, 0, 0]) * (t2[:, 2, 1] - t2[:, 0, 1])
                          - (t2[:, 1, 1] - t2[:, 0, 1]) * (t2[:, 2, 0] - t2[:, 0, 0])).sum()
        mm_px = float(np.sqrt(a3 / a2))
        s = tt
        w = np.minimum(1, s / 0.15) * np.minimum(1, (1 - s) / 0.45)
        # rasterize: per texel, distance to the polyline and the depth weight of the nearest point
        pad = int(4 * a.sigma_mm / mm_px) + 2
        x0, y0 = np.floor(px.min(0)).astype(int) - pad
        x1, y1 = np.ceil(px.max(0)).astype(int) + pad
        yy, xx = np.mgrid[y0:y1, x0:x1]
        q = np.stack([xx.ravel(), yy.ravel()], 1).astype(np.float32)
        dist = np.full(len(q), np.inf, np.float32)
        wq = np.zeros(len(q), np.float32)
        for k in range(len(px) - 1):
            p0, p1 = px[k], px[k + 1]
            seg = p1 - p0
            u_ = np.clip(((q - p0) @ seg) / max(seg @ seg, 1e-9), 0, 1)
            dd = np.linalg.norm(q - (p0 + u_[:, None] * seg), axis=1)
            better = dd < dist
            dist[better] = dd[better]
            wq[better] = (w[k] * (1 - u_) + w[k + 1] * u_)[better]
        g = wq * np.exp(-0.5 * (dist * mm_px / a.sigma_mm) ** 2)
        field[y0:y1, x0:x1] = np.maximum(field[y0:y1, x0:x1], g.reshape(yy.shape))
        gt["lines"][side] = {"points_m": (cp / UNITS_PER_M).tolist(), "weight": w.tolist(), "uv_mm_per_px": mm_px}
        print(f"{side}: groove {np.linalg.norm(np.diff(cp, axis=0), axis=1).sum() / UNITS_PER_M * 1000:.1f} mm long, "
              f"UV scale {mm_px:.3f} mm/px")
    out = LPS / "edits"
    out.mkdir(exist_ok=True)
    cv2.imwrite(str(out / "groove_uv.png"), np.clip((1 - field) * 65535 + 0.5, 0, 65535).astype(np.uint16))
    json.dump(gt, open(out / "groove_gt.json", "w"), indent=1)
    print(f"wrote {out / 'groove_uv.png'} (depth {a.depth_mm} mm, sigma {a.sigma_mm} mm) and groove_gt.json")


if __name__ == "__main__":
    main()
