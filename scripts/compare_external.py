"""
Score meshes from other systems (e.g. Tripo, Meshy, any image-to-3D service) with the same
ground-truth protocol as our pipeline, so "better than X" claims are measured, not asserted.

Protocol
  1. Give the external service the ground-truth photo (outputs/gt_scan/<scene>/photo.jpg,
     rendered from the CC-BY Lee Perry-Smith scan with a known camera).
  2. Download its result as .glb/.obj and pass it here with --mesh.
  3. The mesh is aligned to the true scan (PCA + scale initialization, then similarity ICP on
     the face region) and the face-surface error is reported in mm, the same metric as
     evaluation/gt_scan_eval.reconstruction_error for our output.

  python3 scripts/compare_external.py --scene lps_front --mesh tripo_result.glb --name Tripo
  python3 scripts/compare_external.py --scene lps_front --ours outputs/<run>/head_mesh.obj   # our result, same alignment
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import trimesh

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from evaluation.gt_scan_eval import load_scan_camera_frame  # noqa: E402

UNITS_PER_M = 19.17


def load_any(path: Path) -> trimesh.Trimesh:
    m = trimesh.load(str(path), force="mesh", process=False)
    if isinstance(m, trimesh.Scene):
        m = m.to_geometry()
    return m


def head_region_of_scan(scan: trimesh.Trimesh, below_crown_mm: float = 320.0) -> np.ndarray:
    """Scan vertices from the crown down to `below_crown_mm` (head + neck; the scan includes the shoulders)."""
    y = scan.vertices[:, 1]                                   # camera frame: y points down
    return np.nonzero(y < y.min() + below_crown_mm / 1000.0 * UNITS_PER_M)[0]


def face_region_of_scan(scan: trimesh.Trimesh) -> np.ndarray:
    """Scan face vertices: crown-to-chin band (0-235 mm below the crown), front-most part (camera frame)."""
    v = scan.vertices
    y, z = v[:, 1], v[:, 2]
    band = (y > y.min() + 0.030 * UNITS_PER_M) & (y < y.min() + 0.235 * UNITS_PER_M)
    front = z < np.percentile(z[band], 40)
    return np.nonzero(band & front)[0]


def canonical_inits(src: np.ndarray, dst: np.ndarray):
    """Y-up, +Z-facing meshes (glTF / FLAME / most generators) mapped into the scan's camera frame
    (x right, y down, z forward), at several yaws; scale from the RMS radius ratio."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    s = float(np.sqrt(((dst - mu_d) ** 2).sum(1).mean() / ((src - mu_s) ** 2).sum(1).mean()))
    out = []
    for yaw in (0, 30, -30, 90, 180, 270):
        a = np.radians(yaw)
        Ry = np.array([[np.cos(a), 0, np.sin(a)], [0, 1, 0], [-np.sin(a), 0, np.cos(a)]])
        R = np.diag([1.0, -1.0, -1.0]) @ Ry
        out.append((s, R, mu_d - s * R @ mu_s))
    return out


def pca_init(src: np.ndarray, dst: np.ndarray):
    """Similarity from principal axes (4 sign-flip candidates)."""
    mu_s, mu_d = src.mean(0), dst.mean(0)
    _, Ss, Vs = np.linalg.svd(src - mu_s, full_matrices=False)
    _, Sd, Vd = np.linalg.svd(dst - mu_d, full_matrices=False)
    s = float(np.sqrt((Sd ** 2).sum() / (Ss ** 2).sum()))
    cands = []
    for f1 in (1, -1):
        for f2 in (1, -1):
            D = np.diag([f1, f2, f1 * f2])
            R = Vd.T @ D @ Vs
            if np.linalg.det(R) < 0:
                continue
            cands.append((s, R, mu_d - s * R @ mu_s))
    return cands


def _icp_kdtree(src: np.ndarray, tree, tgt: np.ndarray, init, iters: int = 30, scale_range=(0.8, 1.25)):
    """Trimmed similarity ICP of a point set onto a dense point sampling of the target (KD-tree).
    The scale may move only within scale_range of the initial scale."""
    s0, R0, t0 = init
    x = (s0 * (R0 @ src.T)).T + t0
    s_tot = 1.0
    for _ in range(iters):
        d, j = tree.query(x)
        keep = d < np.percentile(d, 90)
        a, b = x[keep], tgt[j[keep]]
        mu_a, mu_b = a.mean(0), b.mean(0)
        A, B = a - mu_a, b - mu_b
        U, S, Vt = np.linalg.svd(B.T @ A / len(a))
        D = np.eye(3)
        if np.linalg.det(U @ Vt) < 0:
            D[2, 2] = -1
        R = U @ D @ Vt
        sc = np.trace(np.diag(S) @ D) / (A ** 2).sum(1).mean()
        sc = float(np.clip(s_tot * sc, *scale_range) / s_tot)
        s_tot *= sc
        x = (sc * (R @ (x - mu_a).T)).T + mu_b
    return x, s_tot


def score(mesh: trimesh.Trimesh, scan: trimesh.Trimesh, scan_face_idx: np.ndarray) -> dict:
    """
    NoW-style protocol: the scan's face region is aligned onto the predicted mesh (similarity ICP from
    several starts; the prediction may contain anything else: neck, bust, hair) and the error is the
    distance from each ground-truth face point to the predicted surface, in mm. Extra geometry in the
    prediction cannot bias it; a missing or wrong face shows up as large distances.
    """
    from scipy.spatial import cKDTree
    v = scan.vertices
    is_face = np.zeros(len(v), bool)
    is_face[scan_face_idx] = True
    dense, _ = trimesh.sample.sample_surface(scan, 200000, seed=1)
    face_pts = dense[is_face[cKDTree(v).query(dense)[1]]]
    src = face_pts[np.random.default_rng(1).choice(len(face_pts), min(6000, len(face_pts)), replace=False)]
    few = src[:2000]
    if len(mesh.faces):
        mpts, _ = trimesh.sample.sample_surface(mesh, 400000, seed=0)
    else:
        mpts = np.asarray(mesh.vertices)
    mpts = np.asarray(mpts, np.float64)
    mtree = cKDTree(mpts)
    # starts: scan camera frame -> Y-up, +Z-facing mesh frame, several yaws, a wide scale grid (the
    # prediction may be head-only or a bust, in any unit); the scan's nose tip is placed on the
    # front-most point of the mesh's upper part
    nose_scan = src[np.argmin(src[:, 2])]                           # camera frame: nearest to camera
    upper = mpts[mpts[:, 1] > np.percentile(mpts[:, 1], 55)]
    nose_mesh = upper[np.argmax(upper[:, 2])]
    head_extent = float(np.ptp(v[v[:, 1] < v[:, 1].min() + 0.25 * UNITS_PER_M], axis=0).max())
    base = float(np.ptp(upper, axis=0).max()) / head_extent
    starts = []
    for yaw in (0, 25, -25):
        a_ = np.radians(yaw)
        Ry = np.array([[np.cos(a_), 0, np.sin(a_)], [0, 1, 0], [-np.sin(a_), 0, np.cos(a_)]])
        R = Ry @ np.diag([1.0, -1.0, -1.0])
        for k in (0.35, 0.5, 0.7, 1.0, 1.4, 2.0):
            sc = k * base
            starts.append((sc, R, nose_mesh - sc * R @ nose_scan))
    trials = []
    for init in starts:
        with np.errstate(all="ignore"):
            try:
                x, s_rel = _icp_kdtree(few, mtree, mpts, init, iters=25, scale_range=(0.6, 1.6))
                s_, R_, t_ = _umeyama(few, x)
            except np.linalg.LinAlgError:
                continue
        if np.all(np.isfinite(x)):
            trials.append((float(np.median(mtree.query(x)[0]) / s_), (s_, R_, t_)))
    if not trials:
        raise RuntimeError("Alignment failed from every start; is the mesh a head/face?")
    _, init = min(trials, key=lambda t: t[0])
    with np.errstate(all="ignore"):
        x, s_rel = _icp_kdtree(few, mtree, mpts, init, iters=40, scale_range=(0.9, 1.1))
        s_, R_, t_ = _umeyama(few, x)                                 # composed similarity
        x_all, s_rel2 = _icp_kdtree(src, mtree, mpts, (s_, R_, t_), iters=20, scale_range=(0.97, 1.03))
    scale = s_ * s_rel2                                              # mesh units per scan unit
    _, d, _ = trimesh.proximity.closest_point(mesh, x_all) if len(mesh.faces) else (None, mtree.query(x_all)[0], None)
    err = np.asarray(d) / scale / UNITS_PER_M * 1000.0
    return {"face_err_mean_mm": float(err.mean()), "face_err_median_mm": float(np.median(err)),
            "face_err_p90_mm": float(np.percentile(err, 90)), "points": int(len(err)),
            "scale_mesh_units_per_m": float(scale * UNITS_PER_M)}


def _umeyama(src: np.ndarray, dst: np.ndarray):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    xs, xd = src - mu_s, dst - mu_d
    U, S, Vt = np.linalg.svd(xd.T @ xs / len(src))
    D = np.eye(3)
    if np.linalg.det(U @ Vt) < 0:
        D[2, 2] = -1
    R = U @ D @ Vt
    s = float(np.trace(np.diag(S) @ D) / (xs ** 2).sum(1).mean())
    return s, R, mu_d - s * R @ mu_s


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--scene", default="lps_front")
    ap.add_argument("--mesh", help="external result (.glb/.obj)")
    ap.add_argument("--name", default="external")
    ap.add_argument("--ours", help="our head_mesh.obj for the same scene (optional, same protocol)")
    a = ap.parse_args()
    d = ROOT / "outputs" / "gt_scan" / a.scene
    scan = load_scan_camera_frame(ROOT / "data/external/lee_perry_smith/LeePerrySmith.glb", d / "camera_blender.json")
    idx = face_region_of_scan(scan)
    print(f"scan face region: {len(idx)} vertices")
    out = {}
    for name, path in ((a.name, a.mesh), ("ours", a.ours)):
        if path:
            out[name] = score(load_any(Path(path)), scan, idx)
            r = out[name]
            print(f"{name:10s} face error (scan->mesh): mean {r['face_err_mean_mm']:.2f} mm, median "
                  f"{r['face_err_median_mm']:.2f} mm, p90 {r['face_err_p90_mm']:.2f} mm  "
                  f"(mesh scale {r['scale_mesh_units_per_m']:.3g} units/m)")
    res_path = d / f"external_scores_{a.name}.json"
    json.dump(out, open(res_path, "w"), indent=1)
    print(f"saved {res_path}")


if __name__ == "__main__":
    main()
