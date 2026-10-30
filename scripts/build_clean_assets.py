"""
Clean-room FLAME assets for the commercial path, built only from:
  * FLAME 2023 Open (CC-BY-4.0): template geometry and topology
  * MediaPipe's canonical face mesh (Apache-2.0)
  * the geometric rules below
No FLAME 2020 file, MICA asset (masks, embeddings, head_template.obj) or model output is read.

Outputs
  data/flame_model/mediapipe_embedding_open.npz   478 MediaPipe points -> (face_idx, bary) on FLAME
  data/flame_model/region_masks_open.npz          vertex masks with the same keys the pipeline uses:
      face, forehead, nose, lips, eye_region, left/right_eye_region, left/right_eyeball, scalp,
      neck, left/right_ear, boundary

Registration of the canonical mesh (468 vertices) onto the FLAME 2023 Open template:
  anchors (topology/geometry only)
    mouth    FLAME's inner-lip boundary loop (the only small hole) <-> MediaPipe LIPS_INNER ring,
             matched by arc length from the mouth corners
    eyes     cornea apex of each FLAME eyeball component <-> centroid of MediaPipe EYE_A / EYE_B ring
    nose     FLAME front-most midline vertex <-> MediaPipe 4 (pronasale)
  1) similarity (Umeyama) on the anchors; 2) Laplacian non-rigid ICP to the eyeball-free
  surface with the anchors held; 3) snap to the surface.
Iris points (468-477) are placed on the eyeball fronts (their spread is marked infinite, so the
fitter ignores them as before).

  python3 scripts/build_clean_assets.py
"""
from __future__ import annotations

import argparse
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla
import trimesh

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from src.stage0_preprocess.landmarks_mp import EYE_A, EYE_B, FACE_OVAL, LIPS_INNER, LIPS_OUTER  # noqa: E402

MP_BROW_A = [70, 63, 105, 66, 107]
MP_BROW_B = [300, 293, 334, 296, 336]
NOSE_OUTLINE = [168, 193, 245, 128, 114, 217, 198, 209, 49, 64, 98, 97, 2, 326, 327, 294, 279, 429, 420, 437,
                343, 357, 465, 417]


def umeyama(src, dst):
    mu_s, mu_d = src.mean(0), dst.mean(0)
    xs, xd = src - mu_s, dst - mu_d
    U, S, Vt = np.linalg.svd(xd.T @ xs / len(src))
    D = np.eye(3)
    if np.linalg.det(U @ Vt) < 0:
        D[2, 2] = -1
    R = U @ D @ Vt
    s = np.trace(np.diag(S) @ D) / (xs ** 2).sum(1).mean()
    return s, R, mu_d - s * R @ mu_s


def topology(v, f):
    e = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]])
    A = sp.coo_matrix((np.ones(len(e)), (e[:, 0], e[:, 1])), shape=(len(v), len(v)))
    _, lab = sp.csgraph.connected_components(A, directed=False)
    sizes = np.bincount(lab)
    main = lab == np.argmax(sizes)
    eye_labels = [k for k in np.argsort(-sizes)[1:3]]
    eyes = [np.nonzero(lab == k)[0] for k in eye_labels]
    eyes.sort(key=lambda idx: v[idx, 0].mean())                    # -x first
    u, c = np.unique(np.sort(e, 1), axis=0, return_counts=True)
    bnd = u[c == 1]
    G = sp.coo_matrix((np.ones(len(bnd)), (bnd[:, 0], bnd[:, 1])), shape=(len(v), len(v)))
    _, bl = sp.csgraph.connected_components(G, directed=False)
    bverts = np.unique(bnd)
    loops = {}
    for k in np.unique(bl[bverts]):
        idx = bverts[bl[bverts] == k]
        loops[k] = idx
    loops = sorted(loops.values(), key=lambda idx: v[idx, 1].mean())  # neck (lowest) first
    return main, eyes, loops, bnd


def order_loop(idx, bnd):
    """Vertices of a boundary loop in walking order."""
    s = set(idx.tolist())
    nb = {i: [] for i in idx}
    for a, b in bnd:
        if a in s and b in s:
            nb[a].append(b)
            nb[b].append(a)
    out = [idx[0]]
    prev = None
    while len(out) < len(idx):
        cur = out[-1]
        nxt = [n for n in nb[cur] if n != prev and n not in out[-2:]]
        if not nxt:
            break
        prev = cur
        out.append(nxt[0])
    return np.array(out)


def arclength_points(P, n, start):
    """n points equally spaced by arc length around closed polyline P, starting at index `start`."""
    P = np.roll(P, -start, axis=0)
    Q = np.vstack([P, P[:1]])
    seg = np.linalg.norm(np.diff(Q, axis=0), axis=1)
    t = np.r_[0, np.cumsum(seg)] / seg.sum()
    s = np.linspace(0, 1, n, endpoint=False)
    return np.stack([np.interp(s, t, Q[:, c]) for c in range(3)], 1)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--flame", default="data/flame_model/flame2023_open.pkl")
    ap.add_argument("--canonical", default="models_cache/mediapipe/canonical_face_model.obj")
    ap.add_argument("--out-embedding", default="data/flame_model/mediapipe_embedding_open.npz")
    ap.add_argument("--out-masks", default="data/flame_model/region_masks_open.npz")
    a = ap.parse_args()

    import pickle
    d = pickle.load(open(ROOT / a.flame, "rb"), encoding="latin1")
    v = np.asarray(d["v_template"], np.float64)
    f = np.asarray(d["f"], np.int64)
    main_v, eyes, loops, bnd = topology(v, f)
    neck_loop, mouth_loop = loops[0], loops[1]
    print(f"FLAME 2023 Open: {len(v)} verts; eyeballs {[len(e) for e in eyes]}; boundary loops "
          f"neck {len(neck_loop)} (y {v[neck_loop, 1].mean() * 1000:.0f} mm), mouth {len(mouth_loop)} "
          f"(y {v[mouth_loop, 1].mean() * 1000:.0f} mm)")

    can = trimesh.load(str(ROOT / a.canonical), process=False)
    X = np.asarray(can.vertices, np.float64) / 100.0                 # cm -> m
    cf = np.asarray(can.faces, np.int64)
    n = len(X)

    # ---- anchors -----------------------------------------------------------------------
    # FLAME's small boundary loop is the back of the mouth cavity (about 10 mm behind the lips), so only
    # its lateral extremes (the commissures) are used, matched to MediaPipe's outer mouth corners.
    mouth_P = v[mouth_loop]
    inner_corners = [mouth_loop[np.argmin(mouth_P[:, 0])], mouth_loop[np.argmax(mouth_P[:, 0])]]
    # visible commissures: the front-most main-surface vertex within 3 mm (x-y) of each cavity corner
    corners = []
    for c in inner_corners:
        near = np.nonzero(main_v & (np.linalg.norm(v[:, :2] - v[c, :2], axis=1) < 0.003))[0]
        corners.append(near[np.argmax(v[near, 2])])
    cornea = [e[np.argmax(v[e, 2])] for e in eyes]
    eye_rings = sorted([EYE_A, EYE_B], key=lambda r: X[r, 0].mean())
    main_idx = np.nonzero(main_v)[0]
    mid = main_idx[np.abs(v[main_idx, 0]) < 0.004]
    tip = mid[np.argmax(v[mid, 2])]
    src_pts = np.vstack([X[r].mean(0) for r in eye_rings] + [X[4], X[61], X[291]])
    dst_pts = np.vstack([v[cornea[0]], v[cornea[1]], v[tip], v[corners[0]], v[corners[1]]])
    s, R, t = umeyama(src_pts, dst_pts)
    Y = (s * (R @ X.T)).T + t
    res = np.linalg.norm(((s * (R @ src_pts.T)).T + t) - dst_pts, axis=1) * 1000
    print(f"similarity on {len(src_pts)} anchors (eyes, nose tip, mouth corners): scale {s:.4f}, "
          f"residuals {np.round(res, 1)} mm")

    # ---- non-rigid ICP onto the eyeball-free surface, anchors held -----------------------
    keep_f = main_v[f].all(1)
    target = trimesh.Trimesh(v, f[keep_f], process=False)
    face_map = np.nonzero(keep_f)[0]
    e = np.concatenate([cf[:, [0, 1]], cf[:, [1, 2]], cf[:, [2, 0]]])
    e = np.unique(np.sort(e, 1), axis=0)
    Adj = sp.coo_matrix((np.ones(2 * len(e)), (np.r_[e[:, 0], e[:, 1]], np.r_[e[:, 1], e[:, 0]])), shape=(n, n)).tocsr()
    L = sp.diags(np.asarray(Adj.sum(1)).ravel()) - Adj
    anc_w = np.zeros(n)
    anc_target = Y.copy()
    for mp_i, fl_i in ((4, tip), (61, corners[0]), (291, corners[1])):
        anc_w[mp_i] = 5.0
        anc_target[mp_i] = v[fl_i]
    for alpha in (80.0, 40.0, 20.0):                # stiff: snap, don't slide (semantics come from the anchors)
        cp, dist, _ = trimesh.proximity.closest_point(target, Y)
        w = np.where(dist < 0.01, 1.0, 0.1)
        M = sp.diags(w) + alpha * (L.T @ L) + sp.diags(anc_w)
        rhs = sp.diags(w) @ (cp - Y) + sp.diags(anc_w) @ (anc_target - Y)
        solve = spla.factorized(M.tocsc())
        Y = Y + np.stack([solve(rhs[:, c]) for c in range(3)], 1)
        print(f"  NRICP alpha={alpha:5.1f}: median surface distance {np.median(dist) * 1000:.2f} mm")
    cp, dist, tri = trimesh.proximity.closest_point(target, Y)
    face_idx = np.zeros(478, np.int64)
    bary = np.zeros((478, 3))
    face_idx[:n] = face_map[tri]
    bary[:n] = trimesh.triangles.points_to_barycentric(target.triangles[tri], cp)
    # iris 468-477: eyeball front (fitter weight 0 anyway)
    for k, (c, eye) in enumerate(zip(cornea, eyes)):
        fe = np.nonzero(np.isin(f, eye).all(1))[0]
        fi = fe[np.argmax(v[f[fe]].mean(1)[:, 2])]
        for j in range(5):
            face_idx[468 + 5 * k + j] = fi
            bary[468 + 5 * k + j] = [1 / 3, 1 / 3, 1 / 3]
    spread = np.zeros(478)
    spread[468:] = np.inf
    n_hits = np.full(478, 100)
    np.savez(ROOT / a.out_embedding, face_idx=face_idx, bary=bary, spread_mm=spread, n_hits=n_hits,
             source=np.array("clean-room: MediaPipe canonical mesh registered to FLAME 2023 Open "
                             "(topology anchors only; scripts/build_clean_assets.py)"))
    print(f"wrote {a.out_embedding}")

    # ---- region masks ---------------------------------------------------------------------
    P = (v[f[face_idx]] * bary[..., None]).sum(1)                       # landmarks on the template
    from matplotlib.path import Path as MplPath
    xy = v[:, :2]

    def inside(ring, dilate_m=0.0):
        poly = P[ring, :2]
        if dilate_m:
            c = poly.mean(0)
            poly = c + (poly - c) * (1 + dilate_m / np.linalg.norm(poly - c, axis=1).mean())
        return MplPath(poly).contains_points(xy)

    # vertex normals (outward)
    vn = trimesh.Trimesh(v, f[keep_f], process=False).vertex_normals
    facing = vn[:, 2] > 0.1
    face = inside(FACE_OVAL) & main_v & facing
    brow_y = P[MP_BROW_A + MP_BROW_B, 1].mean()
    brow_half_w = np.abs(P[MP_BROW_A + MP_BROW_B, 0]).max()
    forehead = main_v & facing & (v[:, 1] > brow_y + 0.012) & (np.abs(v[:, 0]) < brow_half_w + 0.010) \
        & (v[:, 1] < P[FACE_OVAL, 1].max() + 0.025)
    # lips: the front surface inside the outer lip contour plus the roll into the mouth (down to the
    # cavity boundary loop), as seen from the front
    lips = inside(LIPS_OUTER, 0.002) & main_v & (v[:, 2] > v[mouth_loop, 2].mean() - 0.002)
    nose = inside(NOSE_OUTLINE) & main_v & facing & ~lips
    eyes_reg = []
    for ring in sorted([EYE_A, EYE_B], key=lambda r: P[r, 0].mean()):
        eyes_reg.append(inside(ring, 0.010) & main_v & ~forehead)
    eye_region = eyes_reg[0] | eyes_reg[1]
    chin_y = P[152, 1]
    x_abs = np.abs(v[:, 0])
    oval_half_w = np.abs(P[FACE_OVAL, 0]).max()
    ear_band = (v[:, 1] > P[2, 1] - 0.015) & (v[:, 1] < brow_y + 0.015)
    ears = main_v & ~face & (x_abs > oval_half_w - 0.004) & ear_band & (v[:, 2] < P[FACE_OVAL, 2].mean())
    left_ear, right_ear = ears & (v[:, 0] < 0), ears & (v[:, 0] > 0)
    neck = main_v & ~face & (v[:, 1] < chin_y - 0.01)
    scalp = main_v & ~face & ~ears & ~neck & (v[:, 1] > P[FACE_OVAL, 1].max() - 0.03)
    # boundary: two rings around the neck loop
    ring = np.zeros(len(v), bool)
    ring[neck_loop] = True
    for _ in range(3):
        ring = ring | np.isin(np.arange(len(v)), f[np.isin(f, np.nonzero(ring)[0]).any(1)].ravel())
    masks = {
        "face": face, "forehead": forehead, "nose": nose, "lips": lips,
        "eye_region": eye_region, "left_eye_region": eyes_reg[0], "right_eye_region": eyes_reg[1],
        "left_eyeball": np.isin(np.arange(len(v)), eyes[0]), "right_eyeball": np.isin(np.arange(len(v)), eyes[1]),
        "scalp": scalp, "neck": neck, "left_ear": left_ear, "right_ear": right_ear, "boundary": ring,
    }
    np.savez(ROOT / a.out_masks, **{k: np.nonzero(m)[0] for k, m in masks.items()},
             source=np.array("clean-room: FLAME 2023 Open geometry + MediaPipe landmarks (scripts/build_clean_assets.py)"))
    print(f"wrote {a.out_masks}: " + ", ".join(f"{k} {int(m.sum())}" for k, m in masks.items()))


if __name__ == "__main__":
    main()
