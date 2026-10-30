"""
Clean-room UV layout for FLAME 2023 Open (Phase C1b), built only from:
  * FLAME 2023 Open (CC-BY-4.0): template geometry and topology
  * our clean-room region masks (data/flame_model/region_masks_open.npz, scripts/build_clean_assets.py)
  * the rules below (least-squares conformal maps + shelf packing; no external UV tool)
No FLAME 2020 / MICA file (head_template.obj, FLAME_texture.npz) is read.

Islands (face labels, cleaned so no pocket smaller than --min-island faces survives)
  face     face + forehead + nose + lips + eye regions; scaled up by --face-scale
  ears     one island each
  head     the rest (scalp, sides, neck), split into left and right halves at the midline
  eyeballs one island each, cut along a back meridian
Each island is flattened with LSCM (Levy et al. 2002) and packed into the unit square by a
raster packer that tries 4 rotations per island.

Output: data/flame_model/uv_layout_open.npz  (vt (T, 2) in [0, 1], ft (F, 3) per FLAME face,
labels (F,)) and a preview PNG next to it.

  python3 scripts/build_clean_uv.py
"""
from __future__ import annotations

import argparse
import heapq
import sys
from pathlib import Path

import numpy as np
import scipy.sparse as sp
import scipy.sparse.linalg as spla

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

LABELS = ["face", "head_left", "head_right", "left_ear", "right_ear", "left_eyeball", "right_eyeball"]


def face_adjacency(faces):
    """Map each undirected edge to its incident faces."""
    fe = {}
    for fi, tri in enumerate(faces):
        for a, b in ((0, 1), (1, 2), (2, 0)):
            fe.setdefault((min(tri[a], tri[b]), max(tri[a], tri[b])), []).append(fi)
    return fe


def clean_labels(lab, fe, min_size, frozen):
    """Relabel same-label face components smaller than min_size to their most common neighbour label."""
    nb = [[] for _ in lab]
    for fs in fe.values():
        if len(fs) == 2:
            nb[fs[0]].append(fs[1])
            nb[fs[1]].append(fs[0])
    for _ in range(10):
        seen = np.zeros(len(lab), bool)
        changed = False
        for s in range(len(lab)):
            if seen[s] or frozen[s]:
                continue
            comp, stack = [], [s]
            seen[s] = True
            while stack:
                u = stack.pop()
                comp.append(u)
                for w in nb[u]:
                    if not seen[w] and lab[w] == lab[s]:
                        seen[w] = True
                        stack.append(w)
            if len(comp) < min_size:
                border = [lab[w] for u in comp for w in nb[u] if lab[w] != lab[s] and not frozen[w]]
                if border:
                    lab[comp] = np.bincount(border).argmax()
                    changed = True
        if not changed:
            break
    return lab


def shortest_path(v, edges, src, dst, cost_v):
    adj = {}
    for a, b in edges:
        w = np.linalg.norm(v[a] - v[b]) * (cost_v[a] + cost_v[b]) / 2
        adj.setdefault(a, []).append((b, w))
        adj.setdefault(b, []).append((a, w))
    dist, prev, pq = {src: 0.0}, {}, [(0.0, src)]
    while pq:
        d, u = heapq.heappop(pq)
        if u == dst:
            break
        if d > dist[u]:
            continue
        for w_, c in adj.get(u, []):
            if d + c < dist.get(w_, np.inf):
                dist[w_], prev[w_] = d + c, u
                heapq.heappush(pq, (d + c, w_))
    if dst not in prev:
        raise RuntimeError(f"No seam path from vertex {src} to {dst}.")
    path = [dst]
    while path[-1] != src:
        path.append(prev[path[-1]])
    return [(min(a, b), max(a, b)) for a, b in zip(path[:-1], path[1:])]


def split_wedges(faces, fsel, seams):
    """UV vertices for the faces `fsel`: each mesh vertex splits into one UV vertex per fan of its
    incident faces that stays connected without crossing a seam edge. Returns (ft_local, vert_of_uv)."""
    parent = {(fi, k): (fi, k) for fi in fsel for k in range(3)}

    def find(x):
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    fe = {}
    for fi in fsel:
        tri = faces[fi]
        for a, b in ((0, 1), (1, 2), (2, 0)):
            fe.setdefault((min(tri[a], tri[b]), max(tri[a], tri[b])), []).append(fi)
    for e, fs in fe.items():
        if len(fs) != 2 or e in seams:
            continue
        f0, f1 = fs
        for vtx in e:
            parent[find((f0, list(faces[f0]).index(vtx)))] = find((f1, list(faces[f1]).index(vtx)))
    roots, ft, vert = {}, np.zeros((len(fsel), 3), np.int64), []
    for i, fi in enumerate(fsel):
        for k in range(3):
            r = find((fi, k))
            if r not in roots:
                roots[r] = len(vert)
                vert.append(faces[fi, k])
            ft[i, k] = roots[r]
    return ft, np.asarray(vert)


def lscm(P, T):
    """Least-squares conformal map of a disk-like triangle mesh P (n, 3), T (m, 3) -> (n, 2)."""
    n = len(P)
    p0, p1, p2 = P[T[:, 0]], P[T[:, 1]], P[T[:, 2]]
    e1 = p1 - p0
    x = e1 / (np.linalg.norm(e1, axis=1, keepdims=True) + 1e-15)
    nrm = np.cross(e1, p2 - p0)
    area = np.linalg.norm(nrm, axis=1) / 2
    ok = area > 1e-14
    y = np.cross(nrm / (2 * area[:, None] + 1e-30), x)
    q = np.zeros((len(T), 3, 2))
    q[:, 1, 0] = (e1 * x).sum(1)
    q[:, 2, 0] = ((p2 - p0) * x).sum(1)
    q[:, 2, 1] = ((p2 - p0) * y).sum(1)
    W = np.stack([q[:, 2] - q[:, 1], q[:, 0] - q[:, 2], q[:, 1] - q[:, 0]], 1)     # (m, 3, 2)
    s = 1 / np.sqrt(2 * np.maximum(area, 1e-30))
    rows, cols, vals = [], [], []
    t = np.nonzero(ok)[0]
    for c in range(3):
        vid = T[t, c]
        wr, wi = W[t, c, 0] * s[t], W[t, c, 1] * s[t]
        rows += [2 * t, 2 * t, 2 * t + 1, 2 * t + 1]
        cols += [vid, n + vid, vid, n + vid]
        vals += [wr, -wi, wi, wr]
    A = sp.csr_matrix((np.concatenate(vals), (np.concatenate(rows), np.concatenate(cols))), shape=(2 * len(T), 2 * n))
    a = int(np.argmax(np.linalg.norm(P - P[0], axis=1)))
    b = int(np.argmax(np.linalg.norm(P - P[a], axis=1)))
    xp = np.zeros(2 * n)
    xp[b] = np.linalg.norm(P[a] - P[b])
    free = np.setdiff1d(np.arange(2 * n), [a, n + a, b, n + b])
    Af = A[:, free]
    sol = spla.spsolve((Af.T @ Af).tocsc(), Af.T @ (-A @ xp))
    xx = xp.copy()
    xx[free] = sol
    return np.stack([xx[:n], xx[n:]], 1)


def signed_area(uv, ft):
    t = uv[ft]
    return 0.5 * np.cross(t[:, 1] - t[:, 0], t[:, 2] - t[:, 0])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--flame", default="data/flame_model/flame2023_open.pkl")
    ap.add_argument("--masks", default="data/flame_model/region_masks_open.npz")
    ap.add_argument("--out", default="data/flame_model/uv_layout_open.npz")
    ap.add_argument("--face-scale", type=float, default=2.4)
    ap.add_argument("--margin", type=float, default=0.01)
    ap.add_argument("--min-island", type=int, default=150)
    a = ap.parse_args()
    from src.utils.flame_model import FLAMEModel
    flame = FLAMEModel(str(ROOT / a.flame))
    v, faces = np.asarray(flame.v_template, np.float64), flame.faces.astype(np.int64)
    m = dict(np.load(ROOT / a.masks))
    V = len(v)

    def vset(*keys):
        s = np.zeros(V, bool)
        for k in keys:
            s[m[k]] = True
        return s

    # ---- face labels
    lab = np.where(v[faces].mean(1)[:, 0] > 0, LABELS.index("head_left"), LABELS.index("head_right"))
    lab[vset("face", "forehead", "nose", "lips", "eye_region")[faces].sum(1) >= 2] = LABELS.index("face")
    for k in ("left_ear", "right_ear"):
        lab[vset(k)[faces].sum(1) >= 2] = LABELS.index(k)
    eyes = np.zeros(len(faces), bool)
    for k in ("left_eyeball", "right_eyeball"):
        sel = vset(k)[faces].all(1)
        lab[sel] = LABELS.index(k)
        eyes |= sel
    fe = face_adjacency(faces)
    lab = clean_labels(lab, fe, a.min_island, eyes)
    seams = {e for e, fs in fe.items() if len(fs) == 2 and lab[fs[0]] != lab[fs[1]]}
    E = [e for e in fe]
    # ---- eyeball cuts: back meridian
    for k in ("left_eyeball", "right_eyeball"):
        ids = m[k]
        c = v[ids].mean(0)
        rear = ids[v[ids, 2] < c[2] - 0.15 * np.ptp(v[ids, 2])]
        lo, hi = rear[np.argmin(v[rear, 1])], rear[np.argmax(v[rear, 1])]
        ok = np.zeros(V, bool)
        ok[ids] = True
        cst = np.ones(V)
        cst[ids] = 1 + 50 * np.maximum(0, v[ids, 2] - c[2]) / np.ptp(v[ids, 2]) + 20 * np.abs(v[ids, 0] - c[0]) / np.ptp(v[ids, 0])
        seams |= set(shortest_path(v, [e for e in E if ok[list(e)].all()], lo, hi, cst))
    # ---- flatten each island
    islands = []
    for li, name in enumerate(LABELS):
        fsel = np.nonzero(lab == li)[0]
        if not len(fsel):
            continue
        ftl, vert = split_wedges(faces, fsel, seams)
        uv = lscm(v[vert], ftl)
        t3 = v[vert][ftl]
        a3 = 0.5 * np.linalg.norm(np.cross(t3[:, 1] - t3[:, 0], t3[:, 2] - t3[:, 0]), axis=1).sum()
        uv = (uv - uv.mean(0)) * np.sqrt(a3 / np.abs(signed_area(uv, ftl)).sum())
        uv *= a.face_scale if name == "face" else 1.0
        _, _, Vt = np.linalg.svd(uv, full_matrices=False)
        uv = uv @ Vt.T
        if (signed_area(uv, ftl) < 0).mean() > 0.5:
            uv[:, 0] *= -1
        if name == "face":
            # upright, as seen from the front: rotate (no mirror) to best match the template's (x, y)
            tgt = v[vert, :2] - v[vert, :2].mean(0)
            U, _, Wt = np.linalg.svd(uv.T @ tgt)
            Rm = U @ Wt
            if np.linalg.det(Rm) < 0:
                raise RuntimeError("Face island came out mirrored; check the region masks.")
            uv = uv @ Rm
        islands.append({"name": name, "fsel": fsel, "ft": ftl, "vert": vert, "uv": uv - uv.min(0),
                        "flipped": int((signed_area(uv, ftl) < 0).sum())})

    # ---- shape-aware packing: islands rasterized at G px, largest first, 4 rotations, lowest-then-leftmost
    #      free position (lets crescents nest); binary search on the global scale
    import cv2
    from scipy.signal import fftconvolve
    G, mg = 256, max(1, int(round(a.margin * 256)))
    rots = [np.array([[1, 0], [0, 1]]), np.array([[0, -1], [1, 0]]), np.array([[-1, 0], [0, -1]]), np.array([[0, 1], [-1, 0]])]

    def island_mask(uv, ft):
        mn = uv.min(0)
        q = (uv - mn) * G
        h, w = int(np.ceil(q[:, 1].max())) + 2 * mg + 1, int(np.ceil(q[:, 0].max())) + 2 * mg + 1
        msk = np.zeros((h, w), np.uint8)
        cv2.fillPoly(msk, [np.round(t + mg).astype(np.int32) for t in q[ft]], 1)
        return cv2.dilate(msk, np.ones((2 * mg + 1, 2 * mg + 1), np.uint8)), mn

    def pack(scale):
        occ = np.zeros((G, G), np.float32)
        placed = {}
        order = sorted(range(len(islands)), key=lambda i: -np.abs(signed_area(islands[i]["uv"], islands[i]["ft"])).sum())
        for i in order:
            best = None
            for r, Rm in enumerate(rots):
                uv = islands[i]["uv"] @ Rm.T * scale
                msk, mn = island_mask(uv, islands[i]["ft"])
                h, w = msk.shape
                if h > G or w > G:
                    continue
                ov = fftconvolve(occ, msk[::-1, ::-1].astype(np.float32), mode="valid")
                free = np.argwhere(ov < 0.5)
                if not len(free):
                    continue
                y, x = free[np.lexsort((free[:, 1], free[:, 0] + h))[0]]
                key = (y + h, x)
                if best is None or key < best[0]:
                    best = (key, r, y, x, msk, mn)
            if best is None:
                return False, None
            _, r, y, x, msk, mn = best
            occ[y:y + msk.shape[0], x:x + msk.shape[1]] += msk
            placed[i] = (r, (x + mg) / G - mn[0], (y + mg) / G - mn[1])
        return True, placed

    lo, hi = 0.5, 20.0
    for _ in range(18):
        mid = (lo + hi) / 2
        lo, hi = (mid, hi) if pack(mid)[0] else (lo, mid)
    _, placed = pack(lo)
    vt, ft, off = [], np.zeros_like(faces), 0
    for i, isl in enumerate(islands):
        r, ox, oy = placed[i]
        vt.append(isl["uv"] @ rots[r].T * lo + [ox, oy])
        ft[isl["fsel"]] = isl["ft"] + off
        off += len(isl["uv"])
    vt = np.concatenate(vt).astype(np.float32)
    out = ROOT / a.out
    np.savez(out, vt=vt, ft=ft.astype(np.int32), labels=lab.astype(np.int8), label_names=np.array(LABELS),
             source="clean-room: FLAME 2023 Open + region_masks_open + LSCM (scripts/build_clean_uv.py)")
    # ---- stats + preview
    tri3 = v[faces]
    a3 = 0.5 * np.linalg.norm(np.cross(tri3[:, 1] - tri3[:, 0], tri3[:, 2] - tri3[:, 0]), axis=1)
    a2 = np.abs(signed_area(vt, ft))
    dens = np.sqrt(a2 / np.maximum(a3, 1e-12))
    R = 2048
    img = np.full((R, R, 3), 255, np.uint8)
    cols = [(60, 140, 230), (170, 170, 170), (140, 140, 140), (90, 170, 90), (90, 170, 90), (200, 120, 60), (200, 120, 60)]
    for fi, t in enumerate(vt[ft]):
        cv2.polylines(img, [np.round(np.c_[t[:, 0] * R, (1 - t[:, 1]) * R]).astype(np.int32)], True, cols[lab[fi]], 1)
    cv2.imwrite(str(out.with_suffix(".png")), img)
    face, head = lab == 0, (lab == 1) | (lab == 2)
    print(f"wrote {out}: {len(vt)} UVs, islands {[i['name'] for i in islands]}, {len(seams)} seam edges, "
          f"flipped triangles {sum(i['flipped'] for i in islands)}")
    print(f"UV coverage {a2.sum():.2f}; texels/mm at 4096: face {np.median(dens[face]) * 4.096:.1f}, "
          f"head {np.median(dens[head]) * 4.096:.1f}; density p90/p10: face "
          f"{np.percentile(dens[face], 90) / np.percentile(dens[face], 10):.2f}, head "
          f"{np.percentile(dens[head], 90) / np.percentile(dens[head], 10):.2f}")


if __name__ == "__main__":
    main()
