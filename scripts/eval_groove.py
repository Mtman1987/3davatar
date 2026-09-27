"""
Detail-recovery test (scripts/make_groove_scan.py): how much of a known under-eye groove comes back?

Compares a reconstruction of the grooved scan with a reconstruction of the plain scan made by the
same pipeline and settings (same mesh topology):
  1. the groove centreline (ground truth, lps_front camera frame) is mapped onto the control run's
     fitted mesh through its view-0 camera, selecting a band of vertices near the groove;
  2. the grooved mesh is aligned to the control mesh (similarity) on face vertices *outside* a
     band around the grooves;
  3. the signed displacement along the control mesh's normals (negative = inward) is measured
     on the groove centreline, where the true groove is --depth-mm deep.

  python3 scripts/eval_groove.py --groove outputs/gt_scan/pipeline_groove_mv3 --control outputs/gt_scan/pipeline_mv3_clean
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


def load_obj(p: Path) -> trimesh.Trimesh:
    return trimesh.load(str(p), force="mesh", process=False)


def similarity(src, dst):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    xs, xd = src - mu_s, dst - mu_d
    U, S, Vt = np.linalg.svd(xd.T @ xs / len(src))
    D = np.eye(3)
    if np.linalg.det(U @ Vt) < 0:
        D[2, 2] = -1
    R = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / (xs ** 2).sum(1).mean()
    return s, R, mu_d - s * R @ mu_s


def measure(g_mesh, c_mesh, centre_pts, weights, face_idx, band_mm=12.0):
    """Signed normal displacement (mm) of g relative to c, interpolated on the groove centreline."""
    from scipy.spatial import cKDTree
    vc, vg = np.asarray(c_mesh.vertices), np.asarray(g_mesh.vertices)
    tree = cKDTree(centre_pts)
    dist, near = tree.query(vc)
    outside = np.setdiff1d(face_idx, np.nonzero(dist < band_mm / 1000.0)[0])
    s, R, t = similarity(vg[outside], vc[outside])
    vg_al = (s * (R @ vg.T)).T + t
    disp = ((vg_al - vc) * c_mesh.vertex_normals).sum(1) * 1000.0   # mm, negative = inward
    # interpolate the per-vertex displacement at the centreline points (barycentric on the surface)
    core = weights > 0.8
    cp, _, tri = trimesh.proximity.closest_point(c_mesh, centre_pts[core])
    bary = trimesh.triangles.points_to_barycentric(c_mesh.triangles[tri], cp)
    on_line = (disp[c_mesh.faces[tri]] * bary).sum(1)
    ring = (dist > 6.0 / 1000.0) & (dist < band_mm / 1000.0)
    return {
        "groove_core_mean_mm": float(on_line.mean()),
        "groove_core_min_mm": float(on_line.min()),
        "surround_mean_mm": float(disp[ring].mean()) if ring.any() else float("nan"),
        "outside_rms_mm": float(np.sqrt((disp[outside] ** 2).mean())),
        "core_points": int(core.sum()),
        "profile_mm": {f"{r:.0f}": round(float(disp[(dist >= r / 1000) & (dist < (r + 1) / 1000)].mean()), 3)
                       for r in range(0, 8) if ((dist >= r / 1000) & (dist < (r + 1) / 1000)).any()},
    }


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--groove", required=True)
    ap.add_argument("--control", required=True)
    ap.add_argument("--gt", default="data/external/lee_perry_smith/edits/groove_gt.json")
    a = ap.parse_args()
    gt = json.load(open(ROOT / a.gt))
    G, C = ROOT / a.groove, ROOT / a.control
    man = json.load(open(C / "manifest.json"))
    vf = man["view_fits"][0]
    R, t = np.array(vf["R"]), np.array(vf["t"])
    # centreline: lps_front camera frame -> control run's FLAME frame (inverse of its view-0 pose)
    pts, w = [], []
    for line in gt["lines"].values():
        p = np.array(line["points_m"])
        pts.append((p - t) @ R)                                         # R orthonormal: R^-1 = R^T
        w.append(np.array(line["weight"]))
    pts, w = np.vstack(pts), np.concatenate(w)
    from src.utils.flame_regions import load_vertex_masks
    face = load_vertex_masks()["face"]
    rows = {}
    for name, rel in (("fitted expressed mesh (view 0)", "eval/fitted_expressed_view0.obj"),
                      ("exported neutral mesh", "head_mesh_neutral.obj")):
        g, c = load_obj(G / rel), load_obj(C / rel)
        if name.startswith("exported"):
            # the neutral export differs from the fitted mesh by the expression; map the centreline
            # through the fitted mesh's vertex correspondence (same topology)
            fe = load_obj(C / "eval/fitted_expressed_view0.obj")
            from scipy.spatial import cKDTree
            _, vi = cKDTree(fe.vertices).query(pts)
            p_use = np.asarray(c.vertices)[vi]
        else:
            p_use = pts
        rows[name] = measure(g, c, p_use, w, face)
    # detail mesh: same subdivision topology in both runs; locate the centreline by nearest vertex
    gd, cd = G / "head_mesh_detail.obj", C / "head_mesh_detail.obj"
    if gd.exists() and cd.exists():
        g, c = load_obj(gd), load_obj(cd)
        nv = len(np.asarray(load_obj(C / "head_mesh_neutral.obj").vertices))
        fe = load_obj(C / "eval/fitted_expressed_view0.obj")
        from scipy.spatial import cKDTree
        _, vi = cKDTree(fe.vertices).query(pts)
        p_use = np.asarray(load_obj(C / "head_mesh_neutral.obj").vertices)[vi]
        # face vertices of the subdivided mesh: nearest to the base face vertices' region
        base = np.asarray(load_obj(C / "head_mesh_neutral.obj").vertices)
        _, bi = cKDTree(base).query(np.asarray(c.vertices))
        face_mask = np.zeros(nv, bool)
        face_mask[face] = True
        rows["exported detail mesh (sculpt)"] = measure(g, c, p_use, w, np.nonzero(face_mask[bi])[0])
    # exported displacement maps, sampled in UV on the true centreline (ray-cast through the control's
    # view-0 camera): the sculpt mesh is the neutral mesh displaced by this map, and sampling the map
    # avoids snapping a 2 mm-wide groove to base vertices 3-5 mm apart
    maps = {}
    for tag, d in (("groove", G), ("control", C)):
        mf = json.load(open(d / "manifest.json"))
        png = d / "film_displacement_16bit.png"
        if png.exists():
            sc = mf["displacement_encoding"]["max_scale_mm"]
            maps[tag] = (cv2.imread(str(png), -1).astype(np.float32) / 65535 * 2 - 1) * sc
    if len(maps) == 2:
        from src.stage3_detail.rasterizer import load_flame_uv_layout
        uv, uvf = load_flame_uv_layout()
        fe = load_obj(C / "eval/fitted_expressed_view0.obj")
        cam = trimesh.Trimesh(np.asarray(fe.vertices) @ R.T + t, fe.faces, process=False)
        vals = []
        for line in gt["lines"].values():
            p = np.array(line["points_m"])
            wl = np.array(line["weight"])
            loc, ir, it = cam.ray.intersects_location(np.zeros_like(p), p / np.linalg.norm(p, axis=1, keepdims=True),
                                                      multiple_hits=False)
            b = trimesh.triangles.points_to_barycentric(cam.triangles[it], loc)
            u = (uv[uvf[it]] * b[..., None]).sum(1)
            D = maps["groove"] - maps["control"]
            n = D.shape[0]
            x = np.clip((u[:, 0] * n).astype(int), 0, n - 1)
            y = np.clip(((1 - u[:, 1]) * n).astype(int), 0, n - 1)
            vals.append(D[y, x][wl[ir] > 0.8])
        vals = np.concatenate(vals)
        rows["exported displacement map (UV)"] = {"groove_core_mean_mm": float(vals.mean()),
                                                  "groove_core_min_mm": float(vals.min()),
                                                  "surround_mean_mm": float("nan"),
                                                  "outside_rms_mm": float((maps["groove"] - maps["control"]).std()),
                                                  "core_points": int(len(vals)), "profile_mm": {}}
    print(f"true groove depth on the centreline: -{gt['depth_mm']:.2f} mm (sigma {gt['sigma_mm']} mm)")
    for k, r in rows.items():
        print(f"{k:32s} centreline {r['groove_core_mean_mm']:+.2f} mm (min {r['groove_core_min_mm']:+.2f}) | "
              f"6-12 mm away {r['surround_mean_mm']:+.2f} | rest-of-face rms {r['outside_rms_mm']:.2f} | "
              f"profile {r['profile_mm']}")
    json.dump(rows, open(G / "groove_eval.json", "w"), indent=1)


if __name__ == "__main__":
    main()
