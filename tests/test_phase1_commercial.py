"""
Commercial-path regression tests (DOCS/04 Phase 1 / 1B / C):
  * EXIF same-session gate for multi-view refinement
  * clean-room FLAME 2023 Open assets (embedding, region masks)
  * Phase 1 fitter trusts an EXIF focal length
  * multi-view photo-consistency refinement recovers shape on synthetic textured views
  * the external-mesh scorer gives ~0 mm for the ground-truth scan itself
Tests needing model files skip when they are absent.
"""
import tempfile
import unittest
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[1]
FLAME_OPEN = ROOT / "data" / "flame_model" / "flame2023_open.pkl"
EMB_OPEN = ROOT / "data" / "flame_model" / "mediapipe_embedding_open.npz"
MASKS_OPEN = ROOT / "data" / "flame_model" / "region_masks_open.npz"
LPS = ROOT / "data" / "external" / "lee_perry_smith" / "LeePerrySmith.glb"
LPS_CAM = ROOT / "outputs" / "gt_scan" / "lps_front" / "camera_blender.json"


class TestSameSession(unittest.TestCase):
    def _jpeg(self, d, name, when=None, model=None):
        from PIL import Image
        im = Image.new("RGB", (64, 64), (100, 100, 100))
        exif = Image.Exif()
        if model:
            exif[0x0110] = model
        if when:
            exif[0x8769] = {0x9003: when}
        p = Path(d) / name
        im.save(p, exif=exif)
        return p

    def test_session_rules(self):
        from src.stage0_preprocess.camera import same_session
        with tempfile.TemporaryDirectory() as d:
            a = self._jpeg(d, "a.jpg", "2026:09:26 10:00:00", "Pixel 9")
            b = self._jpeg(d, "b.jpg", "2026:09:26 10:03:00", "Pixel 9")
            c = self._jpeg(d, "c.jpg", "2026:09:26 14:00:00", "Pixel 9")
            e = self._jpeg(d, "e.jpg", "2026:09:26 10:01:00", "iPhone 17")
            n = self._jpeg(d, "n.jpg")
            self.assertTrue(same_session([a, b])[0])
            self.assertFalse(same_session([a, c])[0])              # 4 h apart
            self.assertFalse(same_session([a, e])[0])              # different cameras
            ok, why = same_session([n, n])
            self.assertTrue(ok)
            self.assertIn("no EXIF", why)                          # unknown counts as yes


@unittest.skipUnless(EMB_OPEN.exists() and MASKS_OPEN.exists(), "run scripts/build_clean_assets.py")
class TestCleanAssets(unittest.TestCase):
    def test_masks(self):
        m = np.load(MASKS_OPEN)
        need = {"face", "forehead", "nose", "lips", "eye_region", "left_eye_region", "right_eye_region",
                "left_eyeball", "right_eyeball", "scalp", "neck", "left_ear", "right_ear", "boundary"}
        self.assertTrue(need <= set(m.files))
        self.assertEqual(len(m["left_eyeball"]), 546)
        self.assertEqual(len(m["right_eyeball"]), 546)
        self.assertEqual(len(np.intersect1d(m["left_eyeball"], m["right_eyeball"])), 0)
        self.assertEqual(len(np.intersect1d(m["face"], m["left_eyeball"])), 0)
        self.assertGreater(len(m["face"]), 1000)
        self.assertLess(abs(len(m["left_ear"]) - len(m["right_ear"])), 0.1 * len(m["left_ear"]))

    @unittest.skipUnless(FLAME_OPEN.exists(), "FLAME 2023 Open not downloaded")
    def test_embedding_symmetric_and_on_surface(self):
        import pickle
        e = np.load(EMB_OPEN)
        self.assertEqual(e["face_idx"].shape, (478,))
        np.testing.assert_allclose(e["bary"].sum(1), 1.0, atol=1e-5)
        d = pickle.load(open(FLAME_OPEN, "rb"), encoding="latin1")
        v, f = np.asarray(d["v_template"]), np.asarray(d["f"])
        P = (v[f[e["face_idx"]]] * e["bary"][..., None]).sum(1)
        self.assertLess(abs(P[61, 0] + P[291, 0]), 0.002)          # mouth corners mirror (m)
        self.assertLess(abs(P[33, 0] + P[263, 0]), 0.002)          # outer eye corners mirror
        self.assertGreater(P[4, 2], P[61, 2])                      # nose tip in front of the mouth

    def test_build_script_reads_no_noncommercial_asset(self):
        src = (ROOT / "scripts" / "build_clean_assets.py").read_text()
        code = "\n".join(l for l in src.splitlines() if not l.lstrip().startswith("#"))
        body = code.split('"""', 2)[2]                              # skip the module docstring
        for banned in ("MICA", "generic_model", "FLAME_masks", "head_template", "load_vertex_masks",
                       "mediapipe_embedding.npz", "datadriven"):
            self.assertNotIn(banned, body, banned)

    def test_clean_uv_layout(self):
        """C1b: our own UV layout covers every FLAME face, stays in [0, 1], islands don't overlap,
        the face island is upright, and its build reads no non-commercial asset."""
        import pickle
        import cv2
        path = ROOT / "data" / "flame_model" / "uv_layout_open.npz"
        if not path.exists():
            self.skipTest("run scripts/build_clean_uv.py")
        d = np.load(path)
        vt, ft, lab = d["vt"], d["ft"], d["labels"]
        model = pickle.load(open(FLAME_OPEN, "rb"), encoding="latin1")
        f, v = np.asarray(model["f"]), np.asarray(model["v_template"])
        self.assertEqual(ft.shape, f.shape)
        self.assertTrue((vt >= 0).all() and (vt <= 1).all())
        # overlap: rasterize islands at 1024 and count texels claimed by two islands
        R = 1024
        owner = np.zeros((R, R), bool)
        clash = 0
        for li in np.unique(lab):
            m = np.zeros((R, R), np.uint8)
            cv2.fillPoly(m, [np.round(t * R).astype(np.int32) for t in vt[ft[lab == li]]], 1)
            m = cv2.erode(m, np.ones((3, 3), np.uint8)) > 0
            clash += int((m & owner).sum())
            owner |= m
        self.assertEqual(clash, 0)
        face = lab == 0
        fv = np.unique(f[face])
        uvv = np.zeros((len(v), 2))
        uvv[f[face].ravel()] = vt[ft[face].ravel()]
        self.assertGreater(np.corrcoef(uvv[fv, 1], v[fv, 1])[0, 1], 0.9)      # forehead up
        self.assertGreater(np.corrcoef(uvv[fv, 0], v[fv, 0])[0, 1], 0.9)      # not mirrored
        src = (ROOT / "scripts" / "build_clean_uv.py").read_text().split('"""', 2)[2]
        for banned in ("MICA", "generic_model", "FLAME_masks", "head_template", "FLAME_texture"):
            self.assertNotIn(banned, src, banned)


def _synthetic_views(flame, beta, n_views=2, hw=(360, 300)):
    """Textured FLAME renders (procedural skin-like pattern on the surface) from yawed cameras."""
    import torch
    from src.fitting.fitter import ViewInput
    from src.render.soft_raster import rasterize
    from src.stage0_preprocess.camera import Intrinsics
    from src.stage0_preprocess.landmarks_mp import MPLandmarks
    from src.stage2_expression.landmark_fit import F_FLIP
    from src.utils.flame_torch import FLAMETorch, batch_rodrigues
    layer = FLAMETorch(flame)
    with torch.no_grad():
        v = layer(torch.as_tensor(beta)).numpy().astype(np.float64)
    e = np.load(EMB_OPEN)
    faces = flame.faces.astype(np.int64)
    L = (v[faces[e["face_idx"]]] * e["bary"][..., None]).sum(1)
    H, W = hw
    K = Intrinsics(1400.0, 1400.0, W / 2, H / 2, "exif_focal_plane")
    views, poses = [], []
    for k, yaw in enumerate(np.linspace(-0.3, 0.3, n_views)):
        R = F_FLIP @ batch_rodrigues(torch.tensor([0.0, float(yaw), 0.0])).numpy()
        t = np.array([0.0, 0.0, 0.55])
        vc = v @ R.T + t
        xy = vc[:, :2] / vc[:, 2:] * 1400.0 + [W / 2, H / 2]
        r = rasterize(xy, vc[:, 2], faces, H, W)
        img = np.full((H, W), 0.2)
        m = r.face_id >= 0
        p3 = (v[faces[r.face_id[m]]] * r.bary[m][..., None]).sum(1)          # canonical surface point
        # quasi-random texture fixed to the surface (incommensurate 4-12 mm sinusoids; no NCC aliasing)
        rng = np.random.default_rng(11)
        dirs = rng.normal(size=(6, 3))
        dirs /= np.linalg.norm(dirs, axis=1, keepdims=True)
        freq = 2 * np.pi / rng.uniform(0.004, 0.012, 6)
        img[m] = 0.5 + 0.07 * np.sin((p3 @ dirs.T) * freq + rng.uniform(0, 6.28, 6)).sum(1)
        bgr = np.repeat((np.clip(img, 0, 1) * 255).astype(np.uint8)[..., None], 3, 2)
        lc = L @ R.T + t
        l2 = lc[:, :2] / lc[:, 2:] * 1400.0 + [W / 2, H / 2]
        lm = MPLandmarks(points=np.c_[l2, np.zeros(478)], image_hw=(H, W))
        views.append(ViewInput(bgr, lm, K, m))
        poses.append((R, t))
    return views, poses, v


@unittest.skipUnless(FLAME_OPEN.exists() and EMB_OPEN.exists() and MASKS_OPEN.exists(),
                     "needs FLAME 2023 Open and scripts/build_clean_assets.py outputs")
class TestPhase1Commercial(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from src.utils.flame_regions import load_vertex_masks
        from src.utils.flame_torch import load_flame
        cls.flame = load_flame(FLAME_OPEN)
        vm = load_vertex_masks(MASKS_OPEN)
        cls.region = np.setdiff1d(np.unique(np.concatenate([vm["face"], vm["forehead"], vm["nose"], vm["lips"]])),
                                  np.concatenate([vm["left_eyeball"], vm["right_eyeball"]]))
        rng = np.random.default_rng(3)
        cls.beta = np.zeros(300, np.float32)
        cls.beta[:20] = rng.normal(size=20) * 0.8

    def test_character_mode_fit(self):
        """Character mode (alpha cut-out): the outline is matched, free-form offsets move the shape
        beyond FLAME's PCA space, and the rig-critical areas stay pinned (neck seam, eyeballs, lips)."""
        from dataclasses import replace
        from src.fitting.fitter import FitConfig, Phase1Fitter
        from src.utils.flame_regions import load_vertex_masks
        views, _, _ = _synthetic_views(self.flame, self.beta, n_views=1)
        view = replace(views[0], silhouette=views[0].skin.copy())
        cfg = FitConfig(n_shape=50, iters_rigid=80, iters_shape=150, photometric=False, w_silhouette=1.0,
                        iters_silhouette=120, offsets=True, lambda_offset_lap=0.02, lambda_offset_mag=1e-5)
        fit = Phase1Fitter(self.flame, str(EMB_OPEN), cfg, self.region).fit([view])
        h = fit.history["silhouette"]
        self.assertLess(h[-1], 0.8 * h[0], f"outline residual {h[0]:.4f} -> {h[-1]:.4f} (IOD)")
        self.assertIsNotNone(fit.vertex_offsets)
        vm = load_vertex_masks(MASKS_OPEN)
        pinned = np.concatenate([vm["boundary"], vm["left_eyeball"], vm["right_eyeball"], vm["lips"]])
        self.assertEqual(float(np.abs(fit.vertex_offsets[pinned]).max()), 0.0)

    def test_fitter_trusts_exif_focal(self):
        from src.fitting.fitter import FitConfig, Phase1Fitter
        views, poses, _ = _synthetic_views(self.flame, self.beta, n_views=1)
        cfg = FitConfig(n_shape=50, iters_rigid=80, iters_shape=150, photometric=False)
        vf = Phase1Fitter(self.flame, str(EMB_OPEN), cfg, self.region).fit(views).views[0]
        self.assertAlmostEqual(vf.metrics["focal_scale"], 1.0, delta=0.02)
        self.assertAlmostEqual(vf.metrics["subject_distance_m"], 0.55, delta=0.03)
        self.assertLess(vf.metrics["lmk478_err_iod_mean"], 0.02)

    def test_mv_refine_improves_shape(self):
        import torch
        from src.fitting.fitter import FitResult
        from src.fitting.mv_refine import MultiViewRefiner, MVRefineConfig
        from src.stage2_expression.landmark_fit import ViewFit
        from src.utils.flame_torch import FLAMETorch
        views, poses, v_true = _synthetic_views(self.flame, self.beta, n_views=2)
        beta0 = self.beta.copy()
        beta0[:20] *= 0.4                                           # identity under-estimated
        with torch.no_grad():
            v0 = FLAMETorch(self.flame)(torch.as_tensor(beta0)).numpy().astype(np.float64)
        vfs = [ViewFit(R=R, t=t, intrinsics=vi.intrinsics, psi=np.zeros(100, np.float32),
                       jaw=np.zeros(3, np.float32), vertices_cam=v0 @ R.T + t, vertices_flame=v0,
                       lmk_pred=vi.landmarks.points[:, :2], lmk_target=vi.landmarks.points[:, :2])
               for vi, (R, t) in zip(views, poses)]
        fit = FitResult(beta=beta0, views=vfs)
        cfg = MVRefineConfig(n_shape=20, iters=60, levels=(3.0, 1.5, 0.8), lr_pose=0.0)
        ref = MultiViewRefiner(self.flame, self.region, cfg).refine(views, fit)
        # photo-consistency fixes where the surface is (not how vertices slide along it): point-to-surface
        import trimesh
        true_surf = trimesh.Trimesh(v_true, self.flame.faces, process=False)
        err0 = trimesh.proximity.closest_point(true_surf, v0[self.region])[1].mean()
        err1 = trimesh.proximity.closest_point(true_surf, ref.views[0].vertices_flame[self.region])[1].mean()
        self.assertLess(err1, 0.7 * err0, f"refinement {err0 * 1000:.2f} -> {err1 * 1000:.2f} mm")
        self.assertIsNotNone(ref.vertex_offsets)

    def test_refine_detail_shapes(self):
        import torch
        from src.fitting.fitter import FitResult
        from src.fitting.mv_refine import DetailRefineConfig, MultiViewRefiner, refine_detail
        from src.stage2_expression.landmark_fit import ViewFit
        from src.stage3_detail.rasterizer import load_flame_uv_layout
        from src.utils.flame_torch import FLAMETorch
        uv, uvf = load_flame_uv_layout()
        views, poses, _ = _synthetic_views(self.flame, self.beta, n_views=2)
        with torch.no_grad():
            v0 = FLAMETorch(self.flame)(torch.as_tensor(self.beta)).numpy().astype(np.float64)
        vfs = [ViewFit(R=R, t=t, intrinsics=vi.intrinsics, psi=np.zeros(100, np.float32), jaw=np.zeros(3, np.float32),
                       vertices_cam=v0 @ R.T + t, vertices_flame=v0, lmk_pred=vi.landmarks.points[:, :2],
                       lmk_target=vi.landmarks.points[:, :2]) for vi, (R, t) in zip(views, poses)]
        fit = FitResult(beta=self.beta, views=vfs)
        ref = MultiViewRefiner(self.flame, self.region)
        cfg = DetailRefineConfig(res=(32, 64), blur=(2.0, 1.0), iters=3, stride=2)
        one = refine_detail(ref, views[:1], fit, uv, uvf, cfg)
        self.assertEqual(one.shape, (64, 64))
        self.assertEqual(float(np.abs(one).max()), 0.0)                   # needs two views
        D = refine_detail(ref, views, fit, uv, uvf, cfg)
        self.assertEqual(D.shape, (64, 64))
        self.assertTrue(np.all(np.isfinite(D)))
        self.assertLessEqual(float(np.abs(D).max()), cfg.max_mm)

    def test_mv_refine_single_view_is_identity(self):
        from src.fitting.fitter import FitResult
        from src.fitting.mv_refine import MultiViewRefiner
        fit = FitResult(beta=np.zeros(300), views=[])
        self.assertIs(MultiViewRefiner(self.flame, self.region).refine([object()], fit), fit)


@unittest.skipUnless(LPS.exists() and LPS_CAM.exists(), "ground-truth scan renders not present")
class TestExternalScorer(unittest.TestCase):
    def test_scan_scores_itself_near_zero(self):
        import sys
        import trimesh
        sys.path.insert(0, str(ROOT / "scripts"))
        import compare_external as ce
        from evaluation.gt_scan_eval import load_scan_camera_frame
        scan = load_scan_camera_frame(LPS, LPS_CAM)
        idx = ce.face_region_of_scan(scan)
        # the scan as an "external" mesh: metres, Y-up, +Z facing (as generators export)
        mesh = trimesh.Trimesh((scan.vertices / ce.UNITS_PER_M) @ np.diag([1.0, -1.0, -1.0]), scan.faces, process=False)
        r = ce.score(mesh, scan, idx)
        self.assertLess(r["face_err_median_mm"], 0.3)
        self.assertAlmostEqual(r["scale_mesh_units_per_m"], 1.0, delta=0.03)


if __name__ == "__main__":
    unittest.main()
