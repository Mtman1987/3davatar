"""
Phase 1: analysis-by-synthesis head fitting (DOCS/02 §S3, DOCS/04 Phase 1).

Jointly optimizes, per subject:
    shared   β (identity, first `n_shape` components), per-vertex albedo
    per view ψ (expression), jaw, head rotation / translation, focal scale, SH lighting (RGB)
against
    L_lmk    478 MediaPipe landmarks through our own FLAME embedding, weighted by the
             embedding's cross-subject stability, robust (Charbonnier)
    L_photo  photometric error of albedo x SH shading vs. the photo at visible face-skin
             vertices (linear RGB, coarse-to-fine blurred targets); visibility from a z-buffer
             refreshed during optimization; eyes, mouth interior and non-skin pixels excluded
    priors   β / ψ / jaw Mahalanobis, focal log-prior, albedo graph-Laplacian smoothness

Works with any FLAME-topology model (FLAME 2020 or FLAME 2023 Open). `beta_init` may come
from MICA (FLAME 2020 only) or be zero (mean face; the commercial path, DOCS/07 C3).
Pure PyTorch on CPU: ~5-15 s per view.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Dict, List, Optional

import cv2
import numpy as np
import torch

from src.render.soft_raster import rasterize
from src.stage0_preprocess.camera import Intrinsics
from src.stage0_preprocess.landmarks_mp import EYE_A, EYE_B, FACE_OVAL, LIPS_INNER, MPLandmarks
from src.stage2_expression.landmark_fit import F_FLIP, ViewFit
from src.utils.flame_model import FLAMEModel
from src.utils.flame_torch import FLAMETorch, batch_rodrigues


@dataclass
class FitConfig:
    n_shape: int = 150
    n_expr: int = 50
    iters_rigid: int = 150
    iters_shape: int = 400
    iters_photo: int = 250
    lr: float = 0.01
    crop_res: int = 512
    w_photo: float = 2.0
    lambda_shape: float = 2e-4         # pull towards the mean face (all components)
    lambda_shape_init: float = 0.0     # pull towards beta_init (e.g. MICA's estimate)
    lambda_expr: float = 2e-4
    lambda_jaw: float = 1e-2
    lambda_focal: float = 1e-3         # focal log-prior when the focal was estimated (no EXIF)
    lambda_focal_exif: float = 1.0     # ... when EXIF gives it: GT scan, free focal drifted 13-26% (depth traded
                                       # for focal) and cost 0.03-0.05 mm; trusting EXIF put distance within 3%
    lambda_albedo: float = 3e-2
    fit_focal: bool = True
    photometric: bool = True
    w_normal: float = 0.0               # render-and-compare on predicted surface normals (ViewInput.normals)
    iters_normal: int = 300
    normal_region: str = "face"         # "face" (fit region) or "head" (every non-eyeball vertex: skull, ears, neck)
    # outline render-and-compare (ViewInput.silhouette, e.g. a PNG alpha matte): the rendered head's
    # occluding contour (skull, ears, jaw, neck sides) is pulled onto the photo's outline, two-sided
    w_silhouette: float = 0.0
    iters_silhouette: int = 300
    silhouette_every: int = 10          # contour correspondences refreshed every n iterations
    # free-form offsets along the normals on top of FLAME (for shapes outside its human statistics,
    # e.g. stylized heroes); only fitted in the silhouette stage, seam and eyeballs pinned
    offsets: bool = False
    lambda_offset_lap: float = 2.0      # smoothness (graph Laplacian of the offsets, per mm^2)
    lambda_offset_mag: float = 2e-4     # magnitude (per mm^2)
    visibility_every: int = 25
    robust_delta: float = 0.02          # Charbonnier scale for landmarks (fraction of IOD)


@dataclass
class ViewInput:
    image: np.ndarray                   # (H, W, 3) uint8 BGR
    landmarks: MPLandmarks
    intrinsics: Intrinsics
    skin: np.ndarray                    # (H, W) bool parsing skin mask
    normals: Optional[np.ndarray] = None  # (H, W, 3) predicted normals, camera frame, 0 = unknown
    silhouette: Optional[np.ndarray] = None  # (H, W) bool foreground (head + neck) mask


@dataclass
class FitResult:
    beta: np.ndarray
    views: List[ViewFit]
    albedo_vertex: Optional[np.ndarray] = None
    sh: List[np.ndarray] = field(default_factory=list)
    history: Dict[str, list] = field(default_factory=dict)
    vertex_offsets: Optional[np.ndarray] = None   # (V,) metres along the neutral normals (multi-view refinement)


def _vertex_normals_t(v: torch.Tensor, f: torch.Tensor) -> torch.Tensor:
    fn = torch.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]], dim=1)
    vn = torch.zeros_like(v).index_add_(0, f[:, 0], fn).index_add_(0, f[:, 1], fn).index_add_(0, f[:, 2], fn)
    return vn / (vn.norm(dim=1, keepdim=True) + 1e-12)


def _sh9(n: torch.Tensor) -> torch.Tensor:
    x, y, z = n[:, 0], n[:, 1], n[:, 2]
    return torch.stack([torch.ones_like(x), x, y, z, x * y, y * z, 3 * z * z - 1, x * z, x * x - y * y], 1)


def _srgb_to_linear(img: np.ndarray) -> np.ndarray:
    c = img.astype(np.float32) / 255.0
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4).astype(np.float32)


class _Crop:
    """Square face crop at `res` px with matching intrinsics and landmark coordinates."""

    def __init__(self, view: ViewInput, res: int, margin: float = 1.6):
        x0, y0, x1, y1 = view.landmarks.bbox
        if view.silhouette is not None and view.silhouette.any():
            # a cut-out: frame the whole silhouette (skull, ears, neck), not just the landmark box
            ys, xs = np.nonzero(view.silhouette)
            x0, y0, x1, y1 = xs.min(), ys.min(), xs.max(), ys.max()
            margin = 1.1
        c = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
        size = margin * max(x1 - x0, y1 - y0)
        self.origin = c - size / 2
        self.scale = res / size
        M = np.array([[self.scale, 0, -self.origin[0] * self.scale], [0, self.scale, -self.origin[1] * self.scale]])
        img = cv2.warpAffine(view.image, M, (res, res), flags=cv2.INTER_AREA, borderMode=cv2.BORDER_REPLICATE)
        skin = cv2.warpAffine(view.skin.astype(np.uint8), M, (res, res), flags=cv2.INTER_NEAREST) > 0
        lm = view.landmarks.points[:, :2]
        bad = np.zeros(view.landmarks.image_hw, np.uint8)
        for ring, d in ((EYE_A, 0.06), (EYE_B, 0.06), (LIPS_INNER, 0.04)):
            poly = np.round(lm[ring]).astype(np.int32)
            cv2.fillPoly(bad, [poly], 1)
        k = max(3, int(0.06 * view.landmarks.iod))
        bad = cv2.dilate(bad, np.ones((k, k), np.uint8))
        bad = cv2.warpAffine(bad, M, (res, res), flags=cv2.INTER_NEAREST) > 0
        self.valid = skin & ~bad
        lin = _srgb_to_linear(img[..., ::-1])                             # RGB linear
        self.levels = [torch.from_numpy(cv2.GaussianBlur(lin, (0, 0), s)).permute(2, 0, 1)[None]
                       for s in (4.0, 2.0, 1.0)]
        self.res = res
        self.contour = None
        if view.silhouette is not None:
            sm = cv2.warpAffine(view.silhouette.astype(np.uint8), M, (res, res), flags=cv2.INTER_NEAREST)
            sm = cv2.morphologyEx(sm, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
            cnts, _ = cv2.findContours(sm, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_NONE)
            if cnts:
                pts = max(cnts, key=len)[:, 0].astype(np.float32)
                inside = (pts[:, 0] > 1) & (pts[:, 1] > 1) & (pts[:, 0] < res - 2) & (pts[:, 1] < res - 2)
                self.contour = torch.from_numpy(pts[inside][::2].copy())      # crop pixels; image-border cuts dropped
        self.nlevels = None
        if view.normals is not None:
            n = cv2.warpAffine(view.normals, M, (res, res), flags=cv2.INTER_LINEAR, borderValue=0)
            known = (np.linalg.norm(n, axis=2) > 0.5) & self.valid
            self.nlevels = []
            for s in (4.0, 2.0, 1.0):
                b = cv2.GaussianBlur(n, (0, 0), s)
                b /= np.linalg.norm(b, axis=2, keepdims=True) + 1e-8
                self.nlevels.append(torch.from_numpy(np.concatenate([b, known[..., None]], 2)).permute(2, 0, 1)[None].float())
        K = view.intrinsics
        self.K = np.array([[K.fx * self.scale, 0, (K.cx - self.origin[0]) * self.scale],
                           [0, K.fy * self.scale, (K.cy - self.origin[1]) * self.scale], [0, 0, 1.0]])
        self.lmk = torch.tensor((view.landmarks.points[:, :2] - self.origin) * self.scale, dtype=torch.float32)
        self.iod = view.landmarks.iod * self.scale


class Phase1Fitter:
    def __init__(self, flame: FLAMEModel, embedding_path: str, cfg: Optional[FitConfig] = None,
                 region_vertices: Optional[np.ndarray] = None):
        self.cfg = cfg or FitConfig()
        self.flame = flame
        self.layer = FLAMETorch(flame)
        self.faces_np = flame.faces.astype(np.int64)
        self.faces = torch.as_tensor(self.faces_np)
        emb = np.load(embedding_path)
        self.lmk_vidx = torch.as_tensor(self.faces_np[emb["face_idx"]])
        self.lmk_bary = torch.as_tensor(emb["bary"], dtype=torch.float32)
        spread, hits = emb["spread_mm"], emb["n_hits"]
        w = 1.0 / (1.0 + (np.nan_to_num(spread, nan=99, posinf=99) / 3.0) ** 2)
        w[hits < max(3, 0.5 * hits.max())] = 0
        w[468:] = 0                                          # iris: gaze is not fitted
        w[FACE_OVAL] *= 0.5                                  # silhouette-ish points
        self.lmk_w = torch.tensor(w, dtype=torch.float32)
        V = len(flame.v_template)
        from src.utils.flame_regions import load_vertex_masks
        vm = load_vertex_masks()
        # offsets pinned on the eyeballs and the neck seam (Rule 4); silhouette ignores the seam's surroundings
        self.offset_free = torch.ones(V)
        # ears (thin, easily crumpled) get less freedom; lips (carry the photo's expression, and open the neutral mouth) get none
        self.offset_free[np.concatenate([vm["left_ear"], vm["right_ear"]])] = 0.3
        self.offset_free[vm["lips"]] = 0.0
        self.offset_free[np.concatenate([vm["left_eyeball"], vm["right_eyeball"], vm["boundary"]])] = 0
        seam = flame.v_template[vm["boundary"]]
        d_seam = np.min(np.linalg.norm(flame.v_template[:, None] - seam[None], axis=2), axis=1)
        self.head_region = ~np.isin(np.arange(V), np.concatenate([vm["left_eyeball"], vm["right_eyeball"]]))
        self.sil_ok = (d_seam > 0.005) & ~np.isin(np.arange(V), np.concatenate([vm["left_eyeball"], vm["right_eyeball"]]))
        self.region = np.zeros(V, bool)
        if region_vertices is not None:
            self.region[region_vertices] = True
        else:
            self.region[:] = True
        # uniform graph Laplacian for albedo smoothness
        e = np.concatenate([self.faces_np[:, [0, 1]], self.faces_np[:, [1, 2]], self.faces_np[:, [2, 0]]])
        e = np.unique(np.sort(e, 1), axis=0)
        i = torch.as_tensor(np.concatenate([e[:, 0], e[:, 1]]))
        j = torch.as_tensor(np.concatenate([e[:, 1], e[:, 0]]))
        deg = torch.zeros(V).index_add_(0, i, torch.ones(len(i)))
        self.lap = torch.sparse_coo_tensor(torch.stack([torch.cat([i, torch.arange(V)]), torch.cat([j, torch.arange(V)])]),
                                           torch.cat([-torch.ones(len(i)), deg]), (V, V)).coalesce()

    # ------------------------------------------------------------------
    def _landmarks(self, vc: torch.Tensor) -> torch.Tensor:
        return (vc[self.lmk_vidx] * self.lmk_bary[..., None]).sum(1)

    @staticmethod
    def _proj(x: torch.Tensor, K: torch.Tensor, sf: torch.Tensor) -> torch.Tensor:
        z = x[:, 2:3].clamp(min=1e-4)
        return torch.cat([x[:, :1] / z * K[0, 0] * sf + K[0, 2], x[:, 1:2] / z * K[1, 1] * sf + K[1, 2]], 1)

    def _init_pose(self, v0: np.ndarray, crop: _Crop) -> tuple:
        vidx = self.lmk_vidx.numpy()
        bary = self.lmk_bary.numpy()
        l3 = (v0[vidx] * bary[..., None]).sum(1)
        sel = self.lmk_w.numpy() > 0.3
        pts = (F_FLIP @ l3[sel].T).T.astype(np.float64)
        ok, rvec, tvec = cv2.solvePnP(pts, crop.lmk.numpy()[sel].astype(np.float64), crop.K, np.zeros(4),
                                      flags=cv2.SOLVEPNP_SQPNP)
        if not ok:
            raise RuntimeError("PnP initialization failed.")
        R_cv, _ = cv2.Rodrigues(rvec)
        aa, _ = cv2.Rodrigues(F_FLIP @ R_cv @ F_FLIP)
        return aa.reshape(3), tvec.reshape(3)

    # ------------------------------------------------------------------
    def fit(self, views: List[ViewInput], beta_init: Optional[np.ndarray] = None, verbose: bool = False) -> FitResult:
        cfg = self.cfg
        crops = [_Crop(v, cfg.crop_res) for v in views]
        V = len(self.flame.v_template)
        beta0 = torch.zeros(300) if beta_init is None else torch.as_tensor(np.asarray(beta_init, np.float32)[:300])
        beta_free = beta0[: cfg.n_shape].clone().requires_grad_(True)
        beta_anchor = beta0[: cfg.n_shape].clone()
        beta_rest = beta0[cfg.n_shape:].clone()
        Fm = torch.as_tensor(F_FLIP, dtype=torch.float32)

        with torch.no_grad():
            v0 = self.layer(beta0).numpy().astype(np.float64)
        P = []
        for c, v in zip(crops, views):
            aa0, t0 = self._init_pose(v0, c)
            z0 = float(t0[2])
            P.append({
                "aa": torch.tensor(aa0, dtype=torch.float32, requires_grad=True),
                "uv": torch.tensor([t0[0] / z0, t0[1] / z0], dtype=torch.float32, requires_grad=True),
                "lz": torch.zeros(1, requires_grad=True), "z0": z0,
                "lsf": torch.zeros(1, requires_grad=cfg.fit_focal),
                "psi": torch.zeros(cfg.n_expr, requires_grad=True),
                "jaw": torch.zeros(3, requires_grad=True),
                "sh": torch.tensor(np.c_[np.ones(3), np.zeros((3, 8))].T.copy(), dtype=torch.float32, requires_grad=True),
                "K": torch.as_tensor(c.K, dtype=torch.float32),
                "lam_f": cfg.lambda_focal_exif if v.intrinsics.source.startswith("exif") else cfg.lambda_focal,
            })
        albedo = torch.full((V, 3), 0.3, requires_grad=True)
        delta_mm = torch.zeros(V, requires_grad=True)                      # free-form offsets (mm)
        vis = [torch.zeros(V, dtype=torch.bool) for _ in crops]
        vis_n = [torch.zeros(V, dtype=torch.bool) for _ in crops]        # normal-loss visibility
        hist = {"lmk": [], "photo": [], "normal": [], "silhouette": []}
        sil_pairs = [None for _ in crops]

        def refresh_silhouette(k):
            """Occluding-contour vertices of the current fit in view k and their image-contour partners."""
            p, c = P[k], crops[k]
            with torch.no_grad():
                _, vc, sf = forward(p)
                xy = self._proj(vc, p["K"], sf).numpy()
                r = rasterize(xy, vc[:, 2].numpy(), self.faces_np, c.res, c.res)
                mask = (r.face_id >= 0).astype(np.uint8)
                edge = mask & ~cv2.erode(mask, np.ones((3, 3), np.uint8)).astype(bool)
                ys, xs = np.nonzero(edge)
                tri = self.faces_np[r.face_id[ys, xs]]
                dv = np.linalg.norm(xy[tri] - np.stack([xs, ys], 1)[:, None].astype(np.float32), axis=2)
                sv = np.unique(tri[np.arange(len(tri)), dv.argmin(1)])
                sv = sv[self.sil_ok[sv]]
                if len(sv) < 20:
                    sil_pairs[k] = None
                    return
                q = c.contour.numpy()
                # the photo's outline continues below the model's neck: ignore it there
                q = q[q[:, 1] <= xy[sv, 1].max() + 0.02 * c.iod]
                from scipy.spatial import cKDTree
                d1, j1 = cKDTree(q).query(xy[sv])
                d2, j2 = cKDTree(xy[sv]).query(q)
                lim = 0.35 * c.iod
                sil_pairs[k] = (torch.as_tensor(sv[d1 < lim]), torch.as_tensor(q[j1[d1 < lim]]),
                                torch.as_tensor(sv[j2[d2 < lim]]), torch.as_tensor(q[d2 < lim]))

        def forward(p):
            beta = torch.cat([beta_free, beta_rest])
            pose = torch.cat([torch.zeros(6), p["jaw"], torch.zeros(6)])
            v = self.layer(beta, p["psi"], pose)
            if cfg.offsets:
                n0 = _vertex_normals_t(v, self.faces).detach()
                v = v + (delta_mm * self.offset_free)[:, None] * 1e-3 * n0
            R = Fm @ batch_rodrigues(p["aa"])
            z = p["z0"] * torch.exp(p["lz"])
            t = torch.cat([p["uv"] * z, z])
            sf = torch.exp(p["lsf"].clamp(-0.69, 0.69))
            # keep apparent size fixed while the focal changes: depth scales with f
            vc = v @ R.T + torch.cat([t[:2], t[2:] * sf])
            return v, vc, sf

        def refresh_visibility(k):
            p, c = P[k], crops[k]
            with torch.no_grad():
                _, vc, sf = forward(p)
                K = p["K"].numpy().copy()
                K[:2, :2] *= float(sf)
                xy = (vc[:, :2] / vc[:, 2:3]).numpy() * [K[0, 0], K[1, 1]] + [K[0, 2], K[1, 2]]
                r = rasterize(xy, vc[:, 2].numpy(), self.faces_np, c.res, c.res)
                px = np.clip(np.round(xy - 0.5).astype(int), 0, c.res - 1)
                zbuf = r.depth[px[:, 1], px[:, 0]]
                vn = _vertex_normals_t(vc, self.faces)
                cos = -(vn * torch.nn.functional.normalize(vc, dim=1)).sum(1).numpy()
                front = (vc[:, 2].numpy() <= zbuf + 0.002) & (cos > 0.25) & c.valid[px[:, 1], px[:, 0]]
                vis[k] = torch.as_tensor(front & self.region)
                vis_n[k] = torch.as_tensor(front & (self.head_region if cfg.normal_region == "head" else self.region))

        def step_losses(level: int, use_photo: bool, use_normal: bool = False, use_sil: bool = False):
            total_l, total_p, total_n, total_s = 0.0, 0.0, 0.0, 0.0
            loss = 0.0
            for k, (p, c) in enumerate(zip(P, crops)):
                v, vc, sf = forward(p)
                l2d = self._proj(self._landmarks(vc), p["K"], sf)
                d = (l2d - c.lmk).norm(dim=1) / c.iod
                lr = (torch.sqrt(d ** 2 + cfg.robust_delta ** 2) - cfg.robust_delta) * self.lmk_w
                l_lmk = lr.sum() / self.lmk_w.sum()
                loss = loss + l_lmk + cfg.lambda_expr * p["psi"].pow(2).sum() + cfg.lambda_jaw * p["jaw"].pow(2).sum()
                if cfg.fit_focal:
                    loss = loss + p["lam_f"] * p["lsf"].pow(2).sum()
                total_l += float(l_lmk.detach())
                if use_photo and vis[k].any():
                    m = vis[k]
                    xy = self._proj(vc[m], p["K"], sf)
                    g = (xy / (c.res - 1)) * 2 - 1
                    col = torch.nn.functional.grid_sample(c.levels[level], g[None, None], align_corners=True)[0, :, 0].T
                    vn = _vertex_normals_t(vc, self.faces)[m]
                    shade = _sh9(vn) @ p["sh"]                       # (n, 3)
                    pred = albedo[m] * shade
                    r = pred - col
                    l_ph = torch.sqrt(r.pow(2).sum(1) + 1e-6).mean()
                    loss = loss + cfg.w_photo * l_ph
                    total_p += float(l_ph.detach())
                if use_sil and sil_pairs[k] is not None:
                    a_v, a_q, b_v, b_q = sil_pairs[k]
                    xy_a = self._proj(vc[a_v], p["K"], sf)
                    xy_b = self._proj(vc[b_v], p["K"], sf)
                    da = (xy_a - a_q).norm(dim=1) / c.iod
                    db = (xy_b - b_q).norm(dim=1) / c.iod
                    rob = lambda d: (torch.sqrt(d ** 2 + cfg.robust_delta ** 2) - cfg.robust_delta).mean()  # noqa: E731
                    l_s = 0.5 * (rob(da) + rob(db))
                    loss = loss + cfg.w_silhouette * l_s
                    total_s += float(l_s.detach())
                if use_normal and c.nlevels is not None and vis_n[k].any():
                    m = vis_n[k]
                    g = (self._proj(vc[m], p["K"], sf) / (c.res - 1)) * 2 - 1
                    tgt = torch.nn.functional.grid_sample(c.nlevels[level], g[None, None], align_corners=True)[0, :, 0].T
                    known = tgt[:, 3] > 0.99
                    vn = _vertex_normals_t(vc, self.faces)[m]
                    l_n = (1 - (vn[known] * tgt[known, :3]).sum(1)).mean() if known.any() else vc.sum() * 0
                    loss = loss + cfg.w_normal * l_n
                    total_n += float(l_n.detach())
            loss = loss + cfg.lambda_shape * beta_free.pow(2).sum()
            if cfg.lambda_shape_init > 0:
                loss = loss + cfg.lambda_shape_init * (beta_free - beta_anchor).pow(2).sum()
            if use_photo:
                la = torch.sparse.mm(self.lap, albedo)
                loss = loss + cfg.lambda_albedo * la.pow(2).sum(1).mean()
            if use_normal:
                hist["normal"].append(total_n / len(P))
            if use_sil:
                hist["silhouette"].append(total_s / len(P))
            if (use_sil or use_normal) and cfg.offsets:
                d = delta_mm * self.offset_free
                loss = loss + cfg.lambda_offset_lap * torch.sparse.mm(self.lap, d[:, None]).pow(2).mean() \
                    + cfg.lambda_offset_mag * d.pow(2).mean()
            return loss, total_l / len(P), total_p / len(P)

        def run(params, iters, use_photo, lr, use_normal=False, use_sil=False):
            opt = torch.optim.Adam(params, lr=lr) if not isinstance(params[0], dict) else torch.optim.Adam(params)
            for it in range(iters):
                if (use_photo or use_normal) and it % cfg.visibility_every == 0:
                    for k in range(len(P)):
                        refresh_visibility(k)
                if use_sil and it % cfg.silhouette_every == 0:
                    for k in range(len(P)):
                        refresh_silhouette(k)
                level = 0 if it < iters // 3 else (1 if it < 2 * iters // 3 else 2)
                opt.zero_grad()
                loss, ll, lp = step_losses(level, use_photo, use_normal, use_sil)
                loss.backward()
                opt.step()
                hist["lmk"].append(ll)
                hist["photo"].append(lp)
            if verbose:
                print(f"    stage done: lmk {hist['lmk'][-1]:.4f} photo {hist['photo'][-1]:.4f}")

        rigid = [q for p in P for q in (p["aa"], p["uv"], p["lz"])]
        run(rigid, cfg.iters_rigid, False, cfg.lr)
        shape = rigid + [beta_free] + [q for p in P for q in (p["psi"], p["jaw"])] + \
            ([p["lsf"] for p in P] if cfg.fit_focal else [])
        run(shape, cfg.iters_shape, False, cfg.lr)
        if cfg.w_silhouette > 0 and any(c.contour is not None for c in crops):
            # outline render-and-compare: pose, focal, shape (and free-form offsets) against the photo outline
            groups = [{"params": shape, "lr": cfg.lr * 0.3}]
            if cfg.offsets:
                groups.append({"params": [delta_mm], "lr": 0.05})
            run(groups, cfg.iters_silhouette, False, None, use_sil=True)
            if verbose:
                print(f"    silhouette stage: lmk {hist['lmk'][-1]:.4f} silhouette {hist['silhouette'][-1]:.4f} "
                      f"offsets |max| {float((delta_mm * self.offset_free).abs().max()):.1f} mm")
        if cfg.w_normal > 0 and any(c.nlevels is not None for c in crops):
            # geometry render-and-compare: rendered normals of the fit vs normals predicted from the photo
            if cfg.offsets:
                # sculpt: free-form offsets carve what the predicted normals show (hollows, planes, jaw edge),
                # with the outline still enforced when there is one
                has_sil = cfg.w_silhouette > 0 and any(c.contour is not None for c in crops)
                run([{"params": shape, "lr": cfg.lr * 0.3}, {"params": [delta_mm], "lr": 0.05}],
                    cfg.iters_normal, False, None, use_normal=True, use_sil=has_sil)
            else:
                run(shape, cfg.iters_normal, False, cfg.lr * 0.3, use_normal=True)
            if verbose:
                print(f"    normal stage: lmk {hist['lmk'][-1]:.4f} normal {hist['normal'][-1]:.4f}")
        if cfg.photometric:
            # albedo initialized from the observed colours at visible vertices
            with torch.no_grad():
                for k in range(len(P)):
                    refresh_visibility(k)
                acc = torch.zeros(V, 3)
                cnt = torch.zeros(V)
                for k, (p, c) in enumerate(zip(P, crops)):
                    _, vc, sf = forward(p)
                    m = vis[k]
                    xy = self._proj(vc[m], p["K"], sf)
                    g = (xy / (c.res - 1)) * 2 - 1
                    col = torch.nn.functional.grid_sample(c.levels[0], g[None, None], align_corners=True)[0, :, 0].T
                    acc[m] += col
                    cnt[m] += 1
                seen = cnt > 0
                albedo[seen] = acc[seen] / cnt[seen, None]
                albedo[~seen] = albedo[seen].mean(0)
            photo_params = [albedo] + [p["sh"] for p in P]
            geo = [beta_free] + [q for p in P for q in (p["psi"], p["jaw"], p["aa"], p["uv"], p["lz"])]
            opt_params = [{"params": photo_params, "lr": cfg.lr}, {"params": geo, "lr": cfg.lr * 0.3}]
            opt = torch.optim.Adam(opt_params)
            for it in range(cfg.iters_photo):
                if it % cfg.visibility_every == 0:
                    for k in range(len(P)):
                        refresh_visibility(k)
                level = 0 if it < cfg.iters_photo // 3 else (1 if it < 2 * cfg.iters_photo // 3 else 2)
                opt.zero_grad()
                loss, ll, lp = step_losses(level, True)
                loss.backward()
                opt.step()
                hist["lmk"].append(ll)
                hist["photo"].append(lp)
            if verbose:
                print(f"    photometric stage: lmk {hist['lmk'][-1]:.4f} photo {hist['photo'][-1]:.4f}")

        # ---------------------------------------------------------- results
        out_views = []
        with torch.no_grad():
            beta = torch.cat([beta_free, beta_rest])
            for k, (p, c, view) in enumerate(zip(P, crops, views)):
                v, vc, sf = forward(p)
                l2d = self._proj(self._landmarks(vc), p["K"], sf).numpy()
                # back to full-image pixel coordinates
                l2d_full = l2d / c.scale + c.origin
                target = view.landmarks.points[:, :2]
                w = self.lmk_w.numpy() > 0
                err = np.linalg.norm(l2d_full - target, axis=1) / view.landmarks.iod
                R = (Fm @ batch_rodrigues(p["aa"])).numpy()
                z = p["z0"] * float(torch.exp(p["lz"]))
                t = np.array([float(p["uv"][0]) * z, float(p["uv"][1]) * z, z * float(sf)])
                K0 = view.intrinsics
                Kfit = Intrinsics(K0.fx * float(sf), K0.fy * float(sf), K0.cx, K0.cy, K0.source + "+phase1")
                psi_full = np.zeros(100, np.float32)
                psi_full[: cfg.n_expr] = p["psi"].numpy()
                metrics = {
                    "lmk478_err_iod_mean": float(err[w].mean()),
                    "lmk478_err_iod_stable": float(err[self.lmk_w.numpy() > 0.5].mean()),
                    "focal_scale": float(sf),
                    "subject_distance_m": float(t[2]),
                    "photo_residual": hist["photo"][-1] if hist["photo"] else None,
                    "normal_residual": hist["normal"][-1] if hist["normal"] else None,
                    "silhouette_residual_iod": hist["silhouette"][-1] if hist["silhouette"] else None,
                    "fitter": "phase1",
                    "iod_px": float(view.landmarks.iod),
                }
                out_views.append(ViewFit(
                    R=R, t=t, intrinsics=Kfit, psi=psi_full, jaw=p["jaw"].numpy().copy(),
                    vertices_cam=(v.numpy() @ R.T + t).astype(np.float64), vertices_flame=v.numpy(),
                    lmk_pred=l2d_full.astype(np.float32), lmk_target=target.astype(np.float32), metrics=metrics))
            return FitResult(beta=beta.numpy(), views=out_views,
                             albedo_vertex=albedo.detach().numpy() if cfg.photometric else None,
                             sh=[p["sh"].detach().numpy() for p in P], history=hist,
                             vertex_offsets=((delta_mm * self.offset_free).detach().numpy() * 1e-3).astype(np.float64)
                             if cfg.offsets else None)
