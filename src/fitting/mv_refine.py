"""
Multi-view photo-consistency refinement of a Phase 1 fit (dense matching instead of landmarks).

Landmark fitting plateaus because detector landmarks are not tied to fixed surface points (the
same MediaPipe index lands on slightly different skin in different views). Here the geometry is
refined so that every visible surface point looks the same in every view that sees it:

  unknowns   shared per-vertex offsets along the canonical normals (face region), a small update
             of beta, and the pose of every view except the first (gauge)
  samples    surface points (face id + barycentric) from rasterizing the current mesh in each view
             on a pixel grid; they move with the mesh
  loss       for each ordered view pair (k -> j): 1 - NCC of the colours sampled at the projections
             of view k's samples into k and j, over local windows (box filters on k's grid), on
             points visible and front-facing in both; coarse-to-fine image pyramid
  priors     graph-Laplacian smoothness and magnitude of the offsets, beta anchored to the fit

NCC makes the match insensitive to local gain changes (exposure, soft shading differences).
Pure PyTorch on CPU.
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import List, Optional

import cv2
import numpy as np
import torch
import torch.nn.functional as F

from src.fitting.fitter import FitResult, ViewInput, _vertex_normals_t
from src.render.soft_raster import rasterize
from src.stage0_preprocess.camera import Intrinsics
from src.stage2_expression.landmark_fit import ViewFit
from src.utils.flame_model import FLAMEModel
from src.utils.flame_torch import FLAMETorch, batch_rodrigues


@dataclass
class MVRefineConfig:
    n_shape: int = 100
    levels: tuple = (4.0, 2.0, 1.0)      # image blur sigma (px) per pyramid level
    iters: int = 120                     # per level
    stride: int = 2                      # sample grid stride (px)
    ncc_win: int = 7                     # NCC window on the sample grid (samples)
    lr_offset: float = 2e-4              # metres
    lr_beta: float = 0.02
    lr_pose: float = 1e-3
    lambda_lap: float = 30.0             # offset smoothness (per m^2 of Laplacian)
    lambda_mag: float = 0.5              # offset magnitude
    lambda_beta: float = 1e-3            # beta anchored to the landmark fit
    min_cos: float = 0.3                 # front-facing threshold for visibility
    margin: float = 1.3                  # crop margin around the landmark bbox


class _View:
    """Native-resolution face crop, linear-RGB luminance pyramid, intrinsics in crop pixels."""

    def __init__(self, view: ViewInput, vf: ViewFit, cfg: MVRefineConfig):
        x0, y0, x1, y1 = view.landmarks.bbox
        c = np.array([(x0 + x1) / 2, (y0 + y1) / 2])
        size = cfg.margin * max(x1 - x0, y1 - y0)
        H, W = view.image.shape[:2]
        ox, oy = int(max(0, c[0] - size / 2)), int(max(0, c[1] - size / 2))
        ex, ey = int(min(W, c[0] + size / 2)), int(min(H, c[1] + size / 2))
        img = view.image[oy:ey, ox:ex].astype(np.float32) / 255.0
        lin = np.where(img <= 0.04045, img / 12.92, ((img + 0.055) / 1.055) ** 2.4)
        gray = lin[..., ::-1] @ np.array([0.2126, 0.7152, 0.0722], np.float32)
        self.pyr = [torch.from_numpy(cv2.GaussianBlur(gray, (0, 0), s))[None, None] for s in cfg.levels]
        self.hw = gray.shape
        self.valid = (view.skin[oy:ey, ox:ex] > 0)
        K = vf.intrinsics
        self.K = torch.tensor([[K.fx, 0, K.cx - ox], [0, K.fy, K.cy - oy], [0, 0, 1.0]], dtype=torch.float32)
        self.origin = (ox, oy)


def _box(x: torch.Tensor, k: int) -> torch.Tensor:
    return F.avg_pool2d(x, k, stride=1, padding=k // 2, count_include_pad=False)


class MultiViewRefiner:
    def __init__(self, flame: FLAMEModel, region_vertices: np.ndarray, cfg: Optional[MVRefineConfig] = None):
        self.cfg = cfg or MVRefineConfig()
        self.flame = flame
        self.layer = FLAMETorch(flame)
        self.faces_np = flame.faces.astype(np.int64)
        self.faces = torch.as_tensor(self.faces_np)
        V = len(flame.v_template)
        self.region = np.zeros(V, bool)
        self.region[region_vertices] = True
        self.face_ok = self.region[self.faces_np].all(1)
        e = np.concatenate([self.faces_np[:, [0, 1]], self.faces_np[:, [1, 2]], self.faces_np[:, [2, 0]]])
        e = np.unique(np.sort(e, 1), axis=0)
        i = torch.as_tensor(np.concatenate([e[:, 0], e[:, 1]]))
        j = torch.as_tensor(np.concatenate([e[:, 1], e[:, 0]]))
        deg = torch.zeros(V).index_add_(0, i, torch.ones(len(i)))
        self.lap = torch.sparse_coo_tensor(torch.stack([torch.cat([i, torch.arange(V)]), torch.cat([j, torch.arange(V)])]),
                                           torch.cat([-torch.ones(len(i)), deg]), (V, V)).coalesce()

    @staticmethod
    def _proj(x: torch.Tensor, K: torch.Tensor) -> torch.Tensor:
        z = x[:, 2:3].clamp(min=1e-4)
        return torch.cat([x[:, :1] / z * K[0, 0] + K[0, 2], x[:, 1:2] / z * K[1, 1] + K[1, 2]], 1)

    def _samples(self, vc: np.ndarray, cv: _View):
        """Visible face-region surface samples of one view on a pixel grid: (face id, bary, grid shape)."""
        s = self.cfg.stride
        K = cv.K.numpy()
        xy = vc[:, :2] / vc[:, 2:3] * [K[0, 0], K[1, 1]] + [K[0, 2], K[1, 2]]
        H, W = cv.hw
        r = rasterize(xy, vc[:, 2], self.faces_np, H, W)
        fid = r.face_id[::s, ::s]
        bary = r.bary[::s, ::s]
        ok = (fid >= 0) & cv.valid[::s, ::s]
        ok &= self.face_ok[np.clip(fid, 0, None)]
        return np.clip(fid, 0, None), bary.astype(np.float32), ok

    def refine(self, views: List[ViewInput], fit: FitResult, verbose: bool = False) -> FitResult:
        cfg = self.cfg
        if len(views) < 2:
            return fit
        cviews = [_View(v, vf, cfg) for v, vf in zip(views, fit.views)]
        V = len(self.flame.v_template)
        beta0 = torch.as_tensor(np.asarray(fit.beta, np.float32)[:300])
        dbeta = torch.zeros(cfg.n_shape, requires_grad=True)
        offset = torch.zeros(V, requires_grad=True)
        region_t = torch.as_tensor(self.region, dtype=torch.float32)
        daa = [torch.zeros(3, requires_grad=k > 0) for k in range(len(views))]
        dt = [torch.zeros(3, requires_grad=k > 0) for k in range(len(views))]
        R0 = [torch.as_tensor(vf.R, dtype=torch.float32) for vf in fit.views]
        t0 = [torch.as_tensor(vf.t, dtype=torch.float32) for vf in fit.views]
        psi = [torch.as_tensor(vf.psi, dtype=torch.float32) for vf in fit.views]
        jaw = [torch.as_tensor(vf.jaw, dtype=torch.float32) for vf in fit.views]

        def geometry(k):
            beta = torch.cat([beta0[: cfg.n_shape] + dbeta, beta0[cfg.n_shape:]])
            pose = torch.cat([torch.zeros(6), jaw[k], torch.zeros(6)])
            v = self.layer(beta, psi[k], pose)
            n = _vertex_normals_t(v, self.faces)
            v = v + (offset * region_t)[:, None] * n
            R = batch_rodrigues(daa[k]) @ R0[k]
            return v, v @ R.T + t0[k] + dt[k]

        params = [{"params": [offset], "lr": cfg.lr_offset}, {"params": [dbeta], "lr": cfg.lr_beta},
                  {"params": [q for k in range(1, len(views)) for q in (daa[k], dt[k])], "lr": cfg.lr_pose}]
        hist = []
        for level in range(len(cfg.levels)):
            with torch.no_grad():                                   # samples + visibility from the current mesh
                vcs = [geometry(k)[1].numpy() for k in range(len(views))]
                S = [self._samples(vcs[k], cviews[k]) for k in range(len(views))]
                zb = []
                for k, cv in enumerate(cviews):
                    K = cv.K.numpy()
                    xy = vcs[k][:, :2] / vcs[k][:, 2:3] * [K[0, 0], K[1, 1]] + [K[0, 2], K[1, 2]]
                    zb.append(torch.as_tensor(rasterize(xy, vcs[k][:, 2], self.faces_np, cv.hw[0], cv.hw[1]).depth,
                                              dtype=torch.float32))
            opt = torch.optim.Adam(params)
            for it in range(cfg.iters):
                opt.zero_grad()
                geo = [geometry(k) for k in range(len(views))]
                loss = 0.0
                npairs = 0
                for k in range(len(views)):
                    fid, bary, ok = S[k]
                    if ok.sum() < 50:
                        continue
                    f = self.faces[torch.as_tensor(fid[ok])]
                    b = torch.as_tensor(bary[ok])
                    Hs, Ws = ok.shape
                    okt = torch.as_tensor(ok)
                    for j in range(len(views)):
                        if j == k:
                            continue
                        cols, vis = [], torch.ones(len(f), dtype=torch.bool)
                        for q in (k, j):
                            vc = geo[q][1]
                            X = (vc[f] * b[..., None]).sum(1)
                            xy = self._proj(X, cviews[q].K)
                            h, w = cviews[q].hw
                            g = torch.stack([(xy[:, 0] - 0.5) / (w - 1) * 2 - 1, (xy[:, 1] - 0.5) / (h - 1) * 2 - 1], 1)  # +0.5 pixel-centre convention
                            cols.append(F.grid_sample(cviews[q].pyr[level], g[None, None], align_corners=True)[0, 0, 0])
                            if q == j:
                                with torch.no_grad():
                                    px = (xy - 0.5).round().long()
                                    inside = (px[:, 0] >= 0) & (px[:, 0] < w) & (px[:, 1] >= 0) & (px[:, 1] < h)
                                    pxc = torch.stack([px[:, 0].clamp(0, w - 1), px[:, 1].clamp(0, h - 1)], 1)
                                    depth_ok = X[:, 2] <= zb[q][pxc[:, 1], pxc[:, 0]] + 0.002
                                    fn = torch.cross(vc[f[:, 1]] - vc[f[:, 0]], vc[f[:, 2]] - vc[f[:, 0]], dim=1)
                                    cos = -(F.normalize(fn, dim=1) * F.normalize(X, dim=1)).sum(1)
                                    vis = inside & depth_ok & (cos > cfg.min_cos)
                        if vis.sum() < 50:
                            continue
                        grid = torch.zeros(3, Hs, Ws)                     # a, b, mask on k's sample grid
                        grid[0][okt] = cols[0]
                        grid[1][okt] = cols[1]
                        m = torch.zeros(Hs, Ws)
                        m[okt] = vis.float()
                        a_, b_ = grid[0] * m, grid[1] * m
                        kk = cfg.ncc_win
                        mm = _box(m[None, None], kk)[0, 0] + 1e-6
                        ma, mb = _box(a_[None, None], kk)[0, 0] / mm, _box(b_[None, None], kk)[0, 0] / mm
                        va = _box((a_ * a_)[None, None], kk)[0, 0] / mm - ma ** 2
                        vb = _box((b_ * b_)[None, None], kk)[0, 0] / mm - mb ** 2
                        cab = _box((a_ * b_)[None, None], kk)[0, 0] / mm - ma * mb
                        ncc = cab / torch.sqrt(va.clamp(min=0) * vb.clamp(min=0) + 1e-10)
                        full = (mm > 0.6) & (m > 0)
                        loss = loss + (1 - ncc[full]).mean()
                        npairs += 1
                if npairs == 0:
                    break
                loss = loss / npairs
                lap = torch.sparse.mm(self.lap, (offset * region_t)[:, None])[:, 0]
                reg = cfg.lambda_lap * 1e6 * lap.pow(2).mean() + cfg.lambda_mag * 1e6 * (offset * region_t).pow(2).mean() \
                    + cfg.lambda_beta * dbeta.pow(2).sum()
                (loss + reg).backward()
                opt.step()
                hist.append(float(loss))
            if verbose:
                print(f"    level {level} (blur {cfg.levels[level]} px): 1-NCC {hist[-1]:.4f}  "
                      f"|offset| {1000 * float((offset * region_t).abs().max()):.2f} mm", flush=True)

        out = []
        with torch.no_grad():
            beta = torch.cat([beta0[: cfg.n_shape] + dbeta, beta0[cfg.n_shape:]])
            for k, (vf, view) in enumerate(zip(fit.views, views)):
                v, vc = geometry(k)
                R = (batch_rodrigues(daa[k]) @ R0[k]).numpy()
                t = (t0[k] + dt[k]).numpy()
                m = dict(vf.metrics)
                m["mv_refine_ncc_loss"] = hist[-1] if hist else None
                out.append(ViewFit(R=R, t=t, intrinsics=vf.intrinsics, psi=vf.psi, jaw=vf.jaw,
                                   vertices_cam=vc.numpy().astype(np.float64), vertices_flame=v.numpy(),
                                   lmk_pred=vf.lmk_pred, lmk_target=vf.lmk_target, metrics=m))
            return FitResult(beta=beta.numpy(), views=out, albedo_vertex=fit.albedo_vertex, sh=fit.sh,
                             history={**fit.history, "mv_ncc": hist},
                             vertex_offsets=(offset * region_t).numpy().astype(np.float32))


@dataclass
class DetailRefineConfig:
    res: tuple = (64, 128, 256, 512)     # UV displacement map resolutions, coarse to fine
    blur: tuple = (3.0, 2.0, 1.0, 0.6)   # image blur sigma (px) at each stage
    iters: int = 80                      # per stage
    stride: int = 1                      # sample every pixel
    ncc_win: int = 9
    lr: float = 0.05                     # mm per step (Adam)
    lambda_smooth: float = 0.5           # squared gradient in mm per mm of UV (resolution-independent)
    lambda_mag: float = 1e-3             # magnitude (mm^2)
    min_std: float = 0.004               # windows with less texture than this (linear intensity) are ignored
    max_mm: float = 5.0                  # clamp


def _ncc_loss(a: torch.Tensor, b: torch.Tensor, m: torch.Tensor, k: int, min_std: float = 0.0) -> torch.Tensor:
    a_, b_ = a * m, b * m
    mm = _box(m[None, None], k)[0, 0] + 1e-6
    ma, mb = _box(a_[None, None], k)[0, 0] / mm, _box(b_[None, None], k)[0, 0] / mm
    va = _box((a_ * a_)[None, None], k)[0, 0] / mm - ma ** 2
    vb = _box((b_ * b_)[None, None], k)[0, 0] / mm - mb ** 2
    cab = _box((a_ * b_)[None, None], k)[0, 0] / mm - ma * mb
    ncc = cab / torch.sqrt(va.clamp(min=0) * vb.clamp(min=0) + 1e-10)
    full = (mm > 0.6) & (m > 0) & (va.detach() > min_std ** 2) & (vb.detach() > min_std ** 2)
    if not bool(full.any()):
        return a.sum() * 0.0
    return (1 - ncc[full]).mean()


def refine_detail(refiner: "MultiViewRefiner", views: List[ViewInput], fit: FitResult, uv: np.ndarray,
                  uv_faces: np.ndarray, cfg: Optional[DetailRefineConfig] = None, verbose: bool = False) -> np.ndarray:
    """
    Measured mesostructure: a UV displacement map D (mm along the surface normal, rows = (1 - v) * res,
    at the finest resolution) such that the fitted surface displaced by D is photo-consistent across
    the views. Folds and grooves the base model cannot represent are measured here instead of guessed
    from shading. Solved coarse to fine in UV (64 -> 512) with texture-aware NCC. Needs >= 2 views of
    one sitting; returns zeros otherwise.
    """
    cfg = cfg or DetailRefineConfig()
    Rf = cfg.res[-1]
    if len(views) < 2:
        return np.zeros((Rf, Rf), np.float32)
    mcfg = MVRefineConfig(levels=cfg.blur, stride=cfg.stride, margin=refiner.cfg.margin)
    cviews = [_View(v, vf, mcfg) for v, vf in zip(views, fit.views)]
    faces = refiner.faces
    uvt = torch.as_tensor(np.asarray(uv, np.float32))
    uvf = torch.as_tensor(np.asarray(uv_faces, np.int64))
    from src.render.soft_raster import rasterize as _rast
    geo, nrm = [], []
    for vf in fit.views:
        v = torch.as_tensor(vf.vertices_cam, dtype=torch.float32)
        geo.append(v)
        nrm.append(_vertex_normals_t(v, faces))
    pre, zbufs = [], []
    old = refiner.cfg.stride
    refiner.cfg.stride = cfg.stride
    for k, cv in enumerate(cviews):
        vc = geo[k].numpy()
        fid, bary, ok = refiner._samples(vc, cv)
        f = faces[torch.as_tensor(fid[ok])]
        b = torch.as_tensor(bary[ok])
        uvs = (uvt[uvf[torch.as_tensor(fid[ok])]] * b[..., None]).sum(1)
        grid = torch.stack([uvs[:, 0] * 2 - 1, 1 - uvs[:, 1] * 2], 1)[None, None]
        pre.append((f, b, grid, torch.as_tensor(ok)))
        K = cv.K.numpy()
        xy = vc[:, :2] / vc[:, 2:3] * [K[0, 0], K[1, 1]] + [K[0, 2], K[1, 2]]
        zbufs.append(torch.as_tensor(_rast(xy, vc[:, 2], refiner.faces_np, cv.hw[0], cv.hw[1]).depth, dtype=torch.float32))
    refiner.cfg.stride = old
    D = None
    hist = []
    for stage, (R, _blur) in enumerate(zip(cfg.res, cfg.blur)):
        uvr = _rast(np.c_[uv[:, 0] * R, (1 - uv[:, 1]) * R], np.ones(len(uv)), np.asarray(uv_faces, np.int64), R, R)
        region_uv = torch.as_tensor((uvr.face_id >= 0) & refiner.face_ok[np.clip(uvr.face_id, 0, None)], dtype=torch.float32)
        init = torch.zeros(1, 1, R, R) if D is None else F.interpolate(D.detach(), size=(R, R), mode="bilinear", align_corners=False)
        D = init.clone().requires_grad_(True)
        opt = torch.optim.Adam([D], lr=cfg.lr)
        for it in range(cfg.iters):
            opt.zero_grad()
            Dm = (D * region_uv).clamp(-cfg.max_mm, cfg.max_mm)
            loss, npairs = 0.0, 0
            for k in range(len(views)):
                f, b, grid, okt = pre[k]
                if len(f) < 50:
                    continue
                d = F.grid_sample(Dm, grid, align_corners=False)[0, 0, 0] / 1000.0
                Hs, Ws = okt.shape
                for j in range(len(views)):
                    if j == k:
                        continue
                    cols, vis = [], None
                    for q in (k, j):
                        n = (nrm[q][f] * b[..., None]).sum(1)
                        n = n / (n.norm(dim=1, keepdim=True) + 1e-12)
                        X = (geo[q][f] * b[..., None]).sum(1) + d[:, None] * n
                        xy = refiner._proj(X, cviews[q].K)
                        h, w = cviews[q].hw
                        g = torch.stack([(xy[:, 0] - 0.5) / (w - 1) * 2 - 1, (xy[:, 1] - 0.5) / (h - 1) * 2 - 1], 1)
                        cols.append(F.grid_sample(cviews[q].pyr[stage], g[None, None], align_corners=True)[0, 0, 0])
                        if q == j:
                            with torch.no_grad():
                                px = (xy - 0.5).round().long()
                                inside = (px[:, 0] >= 0) & (px[:, 0] < w) & (px[:, 1] >= 0) & (px[:, 1] < h)
                                pxc = torch.stack([px[:, 0].clamp(0, w - 1), px[:, 1].clamp(0, h - 1)], 1)
                                depth_ok = X[:, 2] <= zbufs[q][pxc[:, 1], pxc[:, 0]] + 0.003
                                cos = -(n * F.normalize(X, dim=1)).sum(1)
                                vis = inside & depth_ok & (cos > 0.3)
                    if vis is None or vis.sum() < 50:
                        continue
                    A = torch.zeros(Hs, Ws).masked_scatter(okt, cols[0])
                    Bm = torch.zeros(Hs, Ws).masked_scatter(okt, cols[1])
                    M = torch.zeros(Hs, Ws).masked_scatter(okt, vis.float())
                    loss = loss + _ncc_loss(A, Bm, M, cfg.ncc_win, cfg.min_std)
                    npairs += 1
            if npairs == 0:
                break
            loss = loss / npairs
            # smoothness in mm per mm-of-UV: gradients per texel scale with R
            gx = (Dm[..., :, 1:] - Dm[..., :, :-1]) * region_uv[:, 1:] * region_uv[:, :-1] * R
            gy = (Dm[..., 1:, :] - Dm[..., :-1, :]) * region_uv[1:, :] * region_uv[:-1, :] * R
            reg = cfg.lambda_smooth * 1e-5 * (gx.pow(2).mean() + gy.pow(2).mean()) + cfg.lambda_mag * Dm.pow(2).mean()
            (loss + reg).backward()
            opt.step()
            hist.append(float(loss.detach()))
        if verbose:
            Dn = (D * region_uv).detach()
            print(f"    detail stage {stage} ({R}^2, blur {_blur} px): 1-NCC {hist[-1]:.4f}  "
                  f"D range {float(Dn.min()):+.2f}..{float(Dn.max()):+.2f} mm, rms {float(Dn[0, 0][region_uv > 0].pow(2).mean().sqrt()):.2f}",
                  flush=True)
    return (D * region_uv).clamp(-cfg.max_mm, cfg.max_mm).detach()[0, 0].numpy().astype(np.float32)
