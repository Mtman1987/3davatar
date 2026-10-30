"""
Face geometry + texture pipeline (Phase 0 of DOCS/04_roadmap.md).

Stage flow:
  0  detection (InsightFace) · EXIF intrinsics · skin parsing (MediaPipe)
  1  identity β: MICA with MICA's own ArcFace                           [fix R1]
  2  per-view camera + pose + expression + jaw fit to 68 landmarks        [fix R2/R3]
  6  per-texel backprojection onto the fitted posed mesh, z-buffer + parsing  [fix R4]
  7  provenance-aware UV fill (observed / mirrored / interpolated)        [fix R6]
  3  detail: micro pores only by default; Multiface GAN and luminance→height off  [fix R5]
  8  PBR maps (roughness / cavity / SSS)
  4  facial hair (v1 presets, unchanged in Phase 0)
  5  production export (v1, unchanged in Phase 0)
  eval  overlays, turntables, report.json (evaluation/phase0_eval.py)

Failure policy: a required model or asset that is missing raises. Optional stages that
fail are recorded in manifest['stage_status'] with the error (never silently skipped);
texture/detail stages never block geometry export (AGENTS.md Rule 6).
"""
from __future__ import annotations

import json
import sys
import traceback
from pathlib import Path
from typing import Any, Dict, List, Optional, Union

import cv2
import numpy as np
import yaml

from src.stage0_preprocess.detector import FaceDetector
from src.utils.flame_model import FLAMEModel
from src.utils.validation import validate_inputs

ROOT = Path(__file__).resolve().parent.parent


class FaceGeoPipeline:
    def __init__(
        self,
        config_path: Optional[Union[str, Path, Dict[str, Any]]] = None,
        model_dir: Union[str, Path] = "models_cache",
        detector: Optional[FaceDetector] = None,
        cfg: Optional[Dict[str, Any]] = None,
    ):
        if cfg is not None:
            self.cfg = cfg
        elif isinstance(config_path, dict):
            self.cfg = config_path
        elif config_path is not None:
            with open(config_path, "r") as f:
                self.cfg = yaml.safe_load(f)
        else:
            self.cfg = {}

        self.model_dir = Path(model_dir) if model_dir is not None else ROOT / "models_cache"
        if not self.model_dir.is_absolute() and not self.model_dir.exists():
            self.model_dir = ROOT / self.model_dir

        cfg_model = (self.cfg.get("flame", {}) or {}).get("model") if isinstance(self.cfg, dict) else None
        flame_candidates = [self.model_dir / "flame" / "generic_model.pkl", self.model_dir / "generic_model.pkl"]
        if cfg_model:
            flame_candidates = [Path(cfg_model) if Path(cfg_model).is_absolute() else ROOT / cfg_model]
        if str(model_dir) in ("models_cache", str(ROOT / "models_cache")):
            # the repo default location (written by scripts/extract_flame_from_mica.py); never used
            # when the caller points model_dir somewhere else explicitly
            flame_candidates.append(ROOT / "data" / "flame_model" / "generic_model.pkl")
        flame_path = next((p for p in flame_candidates if p.exists()), None)
        self.flame = FLAMEModel(str(flame_path)) if flame_path is not None else None
        self.flame_path = flame_path
        self.flame_is_2020 = flame_path is not None and "2023" not in Path(flame_path).name
        if self._c("flame").get("uv_layout"):
            from src.stage3_detail.rasterizer import set_default_uv_layout
            set_default_uv_layout(self._c("flame")["uv_layout"])
        if self._c("flame").get("region_masks"):
            from src.utils.flame_regions import set_default_masks
            set_default_masks(self._c("flame")["region_masks"])

        self._needs_insightface = self._c("stage0").get("detector", "mediapipe") == "insightface" or \
            self._c("stage1").get("identity_init", "mean") == "mica" or \
            self._c("stage2").get("fitter", "phase1") == "landmarks68" or \
            self._c("evaluation").get("judge", "insightface") == "insightface"
        if detector is not None:
            self.detector = detector
        elif self._needs_insightface:
            # research-only models (DOCS/07): MICA crops, the 68-landmark fitter, the evaluation judge
            self.detector = FaceDetector(allow_degraded=bool(self.cfg.get("allow_degraded", False)))
        else:
            self.detector = None
        self._mp = None

        self._stage1 = None
        self._fitter = None
        self._parser = None
        self._projector = None
        self._filler = None
        self._stage4 = None
        self._stage8 = None
        self._detail_fusion = None
        self._uv = None
        self._uv_regions = None

    # ------------------------------------------------------------------ helpers
    def _c(self, section: str) -> Dict[str, Any]:
        return self.cfg.get(section, {}) if isinstance(self.cfg, dict) else {}

    def _require_flame(self) -> FLAMEModel:
        if self.flame is None:
            raise RuntimeError(
                "FLAME model is not initialized. Create data/flame_model/generic_model.pkl with:\n"
                "  python3 scripts/extract_flame_from_mica.py --mica models_cache/mica/mica.tar"
            )
        return self.flame

    def uv_layout(self):
        if self._uv is None:
            from src.stage3_detail.rasterizer import load_flame_uv_layout
            uv, uvf = load_flame_uv_layout()
            if len(uvf) != len(self._require_flame().faces):
                raise RuntimeError("FLAME UV template face count does not match the FLAME model.")
            self._uv = (uv.astype(np.float64), uvf.astype(np.int64))
        return self._uv

    def uv_regions(self) -> Dict[str, np.ndarray]:
        """UV masks from official FLAME regions + landmark-drawn brows/eyes/lips (flame_regions.py)."""
        if self._uv_regions is None:
            from src.utils import flame_regions as fr
            flame = self._require_flame()
            faces = flame.faces.astype(np.int64)
            uv, uvf = self.uv_layout()
            ras = self._get_projector().uv_raster(uv, uvf)
            regions = fr.uv_region_masks(ras, fr.face_region_masks(faces, len(flame.v_template), fr.load_vertex_masks()))
            R = ras.mask.shape[0]
            mp_emb = dict(np.load(ROOT / self._c("stage2").get("mediapipe_embedding",
                                                            "data/flame_model/mediapipe_embedding_open.npz")))
            lmk_uv_mp = fr.embedding_uv(mp_emb, faces, uv, uvf)
            regions.update(fr.feature_masks_mp(lmk_uv_mp, R))
            features = regions["brows"] | regions["eye_openings"] | regions["lip_border"] | regions["lips_landmark"]
            # plain skin for fitting lighting: face without eyes, lips, brows
            regions["plain_skin"] = regions["face"] & ~regions["eye_region"] & ~regions["lips"] & ~features
            # clean skin grain exemplar: forehead + cheeks (no nose: large pores / nostrils)
            # (upper face only: chin/jaw carry stubble and beard shadow on many subjects)
            nose_tip_row = int((1 - lmk_uv_mp[1, 1]) * R)            # MediaPipe 1 = nose tip
            upper = np.zeros_like(regions["face"])
            upper[:nose_tip_row] = True
            regions["skin_exemplar"] = regions["plain_skin"] & ~regions["nose"] & upper
            regions["texel_mm"] = fr.texel_scale_mm(ras, flame.v_template, faces, uv, uvf)
            # Rule 4 collar: every face touching the neck region or the open boundary loop
            vm = fr.load_vertex_masks()
            collar_v = np.zeros(len(flame.v_template), bool)
            collar_v[np.concatenate([vm["neck"], vm["boundary"]])] = True
            regions["neck_pinning"] = ras.mask & collar_v[faces].any(1)[np.clip(ras.face_id, 0, None)]
            # delighting strength: full on plain skin, half where coarse normals are unreliable
            unreliable = (regions["eye_region"] | regions["lips"] | features).astype(np.float32)
            regions["delight_strength"] = 1.0 - 0.5 * cv2.GaussianBlur(unreliable, (0, 0), 6)
            self._uv_regions = regions
        return self._uv_regions

    # ------------------------------------------------------------------ stages
    def _get_stage1(self):
        if self._stage1 is None:
            from src.stage1_identity.inference import MICAIdentityEncoder
            c = self._c("stage1")
            candidates = [
                self.model_dir / "mica" / "mica.tar",
                self.model_dir / "mica" / "pretrained.tar",
                Path("/kaggle/input/mica-pretrained/mica.tar"),
                Path("/kaggle/input/mica-pretrained/pretrained.tar"),
            ]
            ckpt = next((p for p in candidates if p.exists() and p.stat().st_size > 0), candidates[0])
            self._stage1 = MICAIdentityEncoder(
                str(ckpt),
                fusion_temperature=float(c.get("fusion_temperature", 0.05)),
                yaw_weight_exponent=int(c.get("yaw_weight_exponent", 2)),
            )
        return self._stage1

    def _get_fitter(self):
        if self._fitter is None:
            from src.stage2_expression.landmark_fit import LandmarkFitter
            c = self._c("stage2")
            self._fitter = LandmarkFitter(
                self._require_flame(),
                n_expr=int(c.get("n_expr", 50)),
                iters=int(c.get("iters", 400)),
                fit_focal=bool(c.get("fit_focal", True)),
            )
        return self._fitter

    def _get_mp(self):
        if self._mp is None:
            from src.stage0_preprocess.landmarks_mp import MediaPipeLandmarker
            self._mp = MediaPipeLandmarker()
        return self._mp

    def _get_parser(self):
        if self._parser is None:
            from src.stage0_preprocess.parsing import FaceParser
            self._parser = FaceParser()
        return self._parser

    def _get_projector(self):
        if self._projector is None:
            from src.stage6_texture.projector import MultiViewTextureProjector
            c = self._c("stage6")
            self._projector = MultiViewTextureProjector(
                texture_resolution=int(c.get("texture_resolution", 2048)),
                blend_gamma=float(c.get("blend_gamma", 2.0)),
                min_cos=float(c.get("min_cos", 0.15)),
                depth_tolerance_m=float(c.get("depth_tolerance_m", 0.0015)),
            )
        return self._projector

    def _get_filler(self):
        if self._filler is None:
            from src.stage7_delight.uv_fill import ProvenanceUVFill
            self._filler = ProvenanceUVFill()
        return self._filler

    def _get_stage4(self):
        if self._stage4 is None:
            from src.stage4_facial_hair.generator import FacialHairGenerator
            c = self._c("stage4")
            self._stage4 = FacialHairGenerator(neck_collar_threshold=float(c.get("neck_collar_threshold", 0.20)))
        return self._stage4

    def _get_stage8(self):
        if self._stage8 is None:
            from src.stage8_pbr.material_stack import PBRMaterialStack
            c = self._c("stage8")
            self._stage8 = PBRMaterialStack(
                roughness_config={
                    "r_t_zone": float(c.get("roughness_t_zone", 0.33)),
                    "r_cheeks": float(c.get("roughness_cheeks", 0.57)),
                    "r_lips": float(c.get("roughness_lips", 0.22)),
                },
                cavity_strength=float(c.get("cavity_strength", 0.35)),
                sss_ray_count=int(c.get("sss_ray_count", 32)),
                sss_normalize=c.get("sss_normalize", True),
            )
        return self._stage8

    def _get_detail_fusion(self):
        if self._detail_fusion is None:
            from src.stage3_detail.fusion import MultiTierDetailFusion
            c = self._c("stage3")
            self._detail_fusion = MultiTierDetailFusion(
                resolution=int(c.get("resolution", 1024)),
                max_scale_mm=float(c.get("max_scale_mm", 1.0)),
                cavity_strength=float(c.get("cavity_strength", 0.40)),
            )
        return self._detail_fusion

    def _mv_refine(self, fit, views, photo_paths, flame, region, c: dict):
        """
        Multi-view photo-consistency refinement (src/fitting/mv_refine.py). Only valid for photos of
        one sitting (same expression, same session): skipped when EXIF says otherwise, and reverted
        when the refined views still do not agree photometrically.
        """
        from src.fitting.mv_refine import MultiViewRefiner, MVRefineConfig
        from src.stage0_preprocess.camera import same_session
        ok, why = same_session(photo_paths, float(c.get("max_session_minutes", 30)))
        if not ok:
            print(f"[Stage 2] Multi-view refinement skipped: photos are not from one session ({why}).")
            fit.history["mv_refine"] = f"skipped: {why}"
            return fit
        fields = MVRefineConfig.__dataclass_fields__
        mcfg = MVRefineConfig(**{k: (tuple(v) if isinstance(v, list) else v) for k, v in c.items() if k in fields})
        print(f"[Stage 2] Multi-view photo-consistency refinement ({len(views)} views, session check: {why})...")
        refiner = MultiViewRefiner(flame, region, mcfg)
        ref = refiner.refine(views, fit)
        ncc = 1.0 - (ref.history.get("mv_ncc") or [1.0])[-1]
        if ncc < float(c.get("min_ncc", 0.6)):
            print(f"[Stage 2] Refinement reverted: views agree only at NCC {ncc:.2f} "
                  f"(< {c.get('min_ncc', 0.6)}); different expressions or sessions?")
            fit.history["mv_refine"] = f"reverted: ncc {ncc:.3f}"
            return fit
        print(f"  views agree at NCC {ncc:.2f} after refinement")
        ref.history["mv_refine"] = f"ok: ncc {ncc:.3f}"
        self._mv_ctx = (refiner, views, ref)            # Stage 3 measures mesostructure from the same views
        return ref

    # ------------------------------------------------------------------ run
    def run(self, photo_paths: List[str], output_dir: str) -> Dict[str, Any]:
        self._mv_ctx = None
        self._character = False
        output_dir = Path(output_dir)
        output_dir.mkdir(parents=True, exist_ok=True)
        status: Dict[str, Any] = {}

        def optional(name: str, fn):
            """Runs an optional stage; failures are recorded (and printed), never swallowed silently."""
            try:
                out = fn()
                status[name] = "ok"
                return out
            except Exception as e:  # noqa: BLE001 - recorded in the manifest
                status[name] = f"failed: {type(e).__name__}: {e}"
                print(f"[{name} FAILED] {type(e).__name__}: {e}", file=sys.stderr)
                traceback.print_exc()
                return None

        flame = self._require_flame()
        faces = flame.faces.astype(np.int64)
        if self._c("stage1_5").get("enabled", False):
            raise ValueError(
                "stage1_5 (contour deformer) is disabled in Phase 0 (DOCS/01 R3); remove it from the config."
            )

        # ── Stage 0 ─────────────────────────────────────────────────────────
        print("[Stage 0] Detection, landmarks, EXIF intrinsics, parsing...")
        c0, c1, c2 = self._c("stage0"), self._c("stage1"), self._c("stage2")
        pipe_cfg = self._c("pipeline")
        if len(photo_paths) < int(pipe_cfg.get("input_min_photos", 1)):
            raise ValueError(f"Need at least {pipe_cfg.get('input_min_photos', 1)} photo(s).")
        photos, mps, dets, used, silhouettes = [], [], [], [], []
        for p in photo_paths:
            raw = cv2.imread(str(p), cv2.IMREAD_UNCHANGED)
            if raw is None:
                raise ValueError(f"Could not read image {p}.")
            if raw.dtype != np.uint8:
                raw = (raw / 257).astype(np.uint8)
            if raw.ndim == 2:
                raw = cv2.cvtColor(raw, cv2.COLOR_GRAY2BGR)
            im = np.ascontiguousarray(raw[..., :3])
            sil = None
            if raw.shape[2] == 4 and (raw[..., 3] < 128).mean() > 0.02:
                # a cut-out (alpha matte): its outline is the head's silhouette, used by the Stage 2 fit
                sil = raw[..., 3] >= 128
                print(f"[Stage 0] {Path(p).name}: alpha matte found; its outline constrains skull, ears, jaw and neck.")
            lm = self._get_mp().detect(im)
            if lm is None:
                raise ValueError(f"No face found in {p} (MediaPipe).")
            if lm.iod < 20:
                raise ValueError(f"Face in {p} is too small (inter-pupil distance {lm.iod:.0f}px < 20px).")
            d = self.detector.detect_single(im) if self.detector is not None else None
            if self._c("stage1").get("identity_init", "mean") == "mica" and d is None:
                raise ValueError(f"identity_init=mica needs an InsightFace detection; none found in {p}.")
            photos.append(im)
            silhouettes.append(sil)
            mps.append(lm)
            dets.append(d)
            used.append(p)
        pairs = [(p, d) for p, d in zip(used, dets)]

        from src.stage0_preprocess.camera import intrinsics_from_exif, intrinsics_from_fov
        intrinsics = []
        for p, im in zip(used, photos):
            K = intrinsics_from_exif(p, im.shape[:2])
            if K is None:
                K = intrinsics_from_fov(im.shape[:2], float(c0.get("default_focal_35mm", 50.0)))
                print(f"[Stage 0] No EXIF focal in {Path(p).name}; using {K.fx:.0f}px (35mm-equiv "
                      f"{c0.get('default_focal_35mm', 50.0)}) as prior, refined in Stage 2.")
            intrinsics.append(K)

        parser = self._get_parser()
        parsings = [parser.parse(im) for im in photos]
        skin_masks = [parser.skin_mask(c, max(1, int(float(c0.get("skin_erode_iod", 0.04)) * lm.iod)))
                      for c, lm in zip(parsings, mps)]
        # never sample the inside of the mouth (teeth/tongue would be painted onto closed lips)
        if c0.get("exclude_mouth_interior", True):
            from src.stage0_preprocess.landmarks_mp import LIPS_INNER, LIPS_OUTER
            for k, (m, lm) in enumerate(zip(skin_masks, mps)):
                m &= ~lm.polygon_mask(LIPS_INNER, dilate_px=max(3, int(0.03 * lm.iod)))
                m &= ~_mouth_interior_pixels(photos[k], lm.points[LIPS_OUTER, :2], lm.iod, m)

        # ── Stage 1 ─────────────────────────────────────────────────────────
        init = c1.get("identity_init", "mean")
        if init == "mica":
            if not self.flame_is_2020:
                raise ValueError("identity_init=mica predicts FLAME 2020 coefficients; the configured model is "
                                 f"{Path(self.flame_path).name}. Use identity_init: mean (commercial path).")
            print("[Stage 1] MICA identity prior (research-only licence)...")
            beta = self._get_stage1().encode_multiview(dets)
        elif init == "mean":
            print("[Stage 1] Mean-face start (identity comes from the Stage 2 fit)...")
            beta = np.zeros(300, np.float32)
        else:
            raise ValueError(f"stage1.identity_init must be 'mica' or 'mean', got {init!r}")

        # ── Stage 2 ─────────────────────────────────────────────────────────
        fitter_mode = c2.get("fitter", "phase1")
        if fitter_mode == "phase1":
            print("[Stage 2] Phase 1 fit: identity, expression, jaw, camera, focal (478 landmarks)...")
            from src.fitting.fitter import FitConfig, Phase1Fitter, ViewInput
            from src.utils.flame_regions import load_vertex_masks
            vm = load_vertex_masks()
            region = np.setdiff1d(np.unique(np.concatenate([vm["face"], vm["forehead"], vm["nose"], vm["lips"]])),
                                  np.concatenate([vm["left_eyeball"], vm["right_eyeball"]]))
            fields = FitConfig.__dataclass_fields__
            fcfg = FitConfig(**{k: v for k, v in (c2.get("phase1") or {}).items() if k in fields})
            emb = ROOT / c2.get("mediapipe_embedding", "data/flame_model/mediapipe_embedding_open.npz")
            cchar = c2.get("character") or {}
            character = bool(cchar.get("enabled", True)) and any(sil is not None for sil in silhouettes)
            normals = [None] * len(photos)
            if character:
                print("[Stage 2] Character mode (alpha cut-out): outline + whole-head normal sculpt beyond the FLAME prior...")
                fcfg = FitConfig(**{**{k: getattr(fcfg, k) for k in fields},
                                    **{k: v for k, v in cchar.items() if k in fields}})
                if fcfg.w_normal > 0:
                    from src.stage0_preprocess.normals import FaceNormalEstimator
                    ne = FaceNormalEstimator(margin=1.05)
                    for i, (im, sil) in enumerate(zip(photos, silhouettes)):
                        if sil is not None:
                            ys, xs = np.nonzero(sil)
                            normals[i] = ne.predict(im, (xs.min(), ys.min(), xs.max(), ys.max()))
            else:
                silhouettes = [None] * len(photos)
            self._character = character
            vins = [ViewInput(im, lm, K, skin, normals=n, silhouette=sil)
                    for im, lm, K, skin, n, sil in zip(photos, mps, intrinsics, skin_masks, normals, silhouettes)]
            fit = Phase1Fitter(flame, str(emb), fcfg, region).fit(vins, beta_init=beta if init == "mica" else None)
            cmv = c2.get("mv_refine") or {}
            if cmv.get("enabled", True) and len(photos) >= 2:
                fit = self._mv_refine(fit, vins, used, flame, region, cmv)
            beta = fit.beta.astype(np.float32)
            view_fits = fit.views
            vertex_offsets = fit.vertex_offsets
        elif fitter_mode == "landmarks68":
            if self.detector is None:
                raise ValueError("stage2.fitter=landmarks68 needs InsightFace (research-only).")
            print("[Stage 2] 68-landmark fit (research path)...")
            fitter = self._get_fitter()
            view_fits = [fitter.fit(beta, d.landmark_3d_68, K) for d, K in zip(dets, intrinsics)]
        else:
            raise ValueError(f"stage2.fitter must be 'phase1' or 'landmarks68', got {fitter_mode!r}")
        for i, vf in enumerate(view_fits):
            m = vf.metrics
            err = m.get("lmk478_err_iod_stable", m.get("lmk_err_iod_mean"))
            print(f"  view {i}: landmark error {100 * err:.1f}% IOD, f={vf.intrinsics.fx:.0f}px "
                  f"({vf.intrinsics.source}), distance {m['subject_distance_m']:.2f} m")

        neutral_vertices, _ = flame.decode_neutral(beta)
        if fitter_mode == "phase1" and vertex_offsets is not None:
            from src.stage3_detail.rasterizer import compute_vertex_normals as _vn
            neutral_vertices = neutral_vertices + vertex_offsets[:, None] * _vn(neutral_vertices, faces)
        # the fitted (expressed) mesh of view 0, FLAME frame: what photo-to-3D services reconstruct
        _ev = output_dir / "eval"
        _ev.mkdir(exist_ok=True)
        with open(_ev / "fitted_expressed_view0.obj", "w") as fh:
            fh.write("".join(f"v {x:.6f} {y:.6f} {z:.6f}\n" for x, y, z in view_fits[0].vertices_flame))
            fh.write("".join(f"f {a + 1} {b + 1} {c + 1}\n" for a, b, c in faces))
        uv, uvf = self.uv_layout()

        # ── Stage 6 + 7 ─────────────────────────────────────────────────────
        texture_maps: Dict[str, str] = {}
        albedo = None
        fill_fractions = None
        fr = None
        if self._c("stage6").get("enabled", True):
            def _texture():
                print("[Stage 6] Backprojecting photos onto the fitted mesh (z-buffer + skin parsing)...")
                proj = self._get_projector()
                c7 = self._c("stage7")
                regions = self.uv_regions()
                delight = c7.get("delight", True)
                res = proj.project(photos, [vf.vertices_cam for vf in view_fits],
                                   [vf.intrinsics.K for vf in view_fits], skin_masks, faces, uv, uvf,
                                   delight_fit_region=regions["plain_skin"] if delight else None,
                                   delight_strength=(regions["delight_strength"] * float(c7.get("delight_strength", 1.0))
                                                     if delight else None),
                                   white_balance=bool(c7.get("white_balance", False)),
                                   exclusive_faces=self._ear_faces(faces) if getattr(self, "_character", False) else None)
                texture_maps.update(proj.save_maps(res, output_dir))
                source = res.get("albedo_rgb", res["projected_rgb"])
                print("[Stage 7] Provenance-aware UV fill (observed / mirrored / interpolated)...")
                from src.stage7_delight.uv_fill import load_or_build_mirror_map
                mirror = load_or_build_mirror_map(ROOT / "models_cache" / "flame_uv" / Path(self.flame_path).stem,
                                                  proj.uv_raster(uv, uvf), flame.v_template, faces)
                ras = proj.uv_raster(uv, uvf)
                fr = self._get_filler().fill(
                    source, res["projection_mask"] > 0, res["uv_valid"], mirror,
                    exemplar_scale=_texel_density_ratio(flame.v_template, faces, uv, uvf, ras,
                                                        ~(res["projection_mask"] > 0) & res["uv_valid"],
                                                        regions["skin_exemplar"]),
                    exemplar_region=regions["skin_exemplar"] if c7.get("synthesize_skin", True) else None,
                    mesh={"uv_raster": proj.uv_raster(uv, uvf), "faces": faces, "uv": uv, "uv_faces": uvf,
                          "n_verts": len(flame.v_template)},
                    closed_regions={"lips": regions["lips"] | regions["lips_landmark"]},
                    skin_transfer=bool(c7.get("skin_transfer", True)),
                    observed_weight=res["weight_map"] if c7.get("grazing_blend", True) else None)
                fr["sh_coeffs"] = res.get("sh_coeffs")
                fr["delit"] = "albedo_rgb" in res
                texture_maps.update(self._get_filler().save_maps(fr, output_dir))
                return fr
            fr = optional("stage6_7_texture", _texture)
            if fr is not None:
                albedo = fr["albedo_srgb"]
                fill_fractions = fr["fractions"]

        # ── Stage 3: detail ─────────────────────────────────────────────────
        c3 = self._c("stage3")
        res3 = int(c3.get("resolution", 1024))
        detail_maps: Dict[str, str] = dict(texture_maps)
        zeros = np.zeros((res3, res3), np.float32)
        disp_micro = None
        zone_masks = None
        if float(c3.get("weight_macro", 0.0)) > 0 or c3.get("enable_meso", False) or c3.get("mode", "sculpt") != "sculpt":
            raise ValueError(
                "stage3: the v1 detail GAN (weight_macro), luminance meso (enable_meso) and legacy pores were "
                "removed on 2026-09-25 (older/REMOVED_WORK_REPORT_2026-09-25.md). Use stage3.mode: sculpt."
            )
        sculpt = None
        weight_micro = 1.0
        # Phase 4A: photo-derived wrinkles + synthesized pores/grooves, one 0-100 knob
        if fr is None:
            status["stage3_sculpt"] = "skipped: needs the Stage 6/7 texture"
        else:
            from src.stage3_detail.sculpt_detail import build_detail
            level = float(c3.get("detail_level", 75))
            # synthesized pores differ per subject (deterministic for the same photos); a fixed seed
            # gave every head the identical pore layout
            import hashlib
            seed = int(hashlib.sha1(b"".join(Path(p).read_bytes() for p in used)).hexdigest()[:8], 16)
            sculpt = optional("stage3_sculpt", lambda: build_detail(
                fr["albedo_srgb"], fr["provenance"], self.uv_regions(), level,
                out_res=int(c3.get("detail_resolution", 4096)), seed=seed))
            if sculpt is not None and self._mv_ctx is not None and c3.get("measured_detail", False):
                measured = optional("stage3_measured_detail", lambda: self._measured_detail(sculpt, c3))
                if measured is not None:
                    sculpt["measured_mm"] = measured
            if sculpt is not None:
                disp_micro = cv2.resize(sculpt["displacement_mm"], (res3, res3), interpolation=cv2.INTER_AREA)

        fusion = self._get_detail_fusion()
        if sculpt is not None:
            # measured folds can be deeper than the default ±1 mm encoding: widen it (recorded in the manifest)
            need = float(np.ceil(np.abs(sculpt["displacement_mm"]).max() * 10) / 10)
            fusion.max_scale_mm = max(fusion.max_scale_mm, need)
        coupled = fusion.couple_pbr_material_stack(
            meso_disp_mm=zeros,
            micro_disp_mm=disp_micro if disp_micro is not None else zeros,
            zone_masks=zone_masks or {"valid": np.ones((res3, res3), np.float32),
                                      "neck_pinning": self.uv_regions()["neck_pinning"]},
            macro_disp_mm=None,
            weight_meso=float(c3.get("weight_meso", 0.5)),
            weight_micro=weight_micro,
            weight_macro=0.0,
        )
        saved = fusion.save_maps(coupled, output_dir=output_dir, prefix="film")
        sculpt_info = None
        if sculpt is not None:
            sculpt_info = self._save_sculpt(sculpt, fusion.max_scale_mm, saved, neutral_vertices, faces, output_dir, status)
        detail_displacement = coupled["composite_displacement_mm"]
        pin = cv2.resize(self.uv_regions()["neck_pinning"].astype(np.uint8), (res3, res3),
                         interpolation=cv2.INTER_NEAREST) > 0
        collar = detail_displacement[pin]
        if collar.size and float(np.max(np.abs(collar))) > 1e-4:
            raise RuntimeError("Rule 4 invariant violated: neck collar displacement is non-zero.")
        for k, v in saved.items():
            detail_maps[k] = str(v)
        detail_maps.update({
            "displacement_16bit": str(saved["displacement_png"]), "normal_map": str(saved["normal_png"]),
            "cavity": str(saved["cavity_ao_png"]), "roughness": str(saved["roughness_base_png"]),
            "roughness_coat": str(saved["roughness_coat_png"]),
        })
        detail_maps.update(texture_maps)

        # ── Stage 8 ─────────────────────────────────────────────────────────
        if self._c("stage8").get("enabled", True):
            def _pbr():
                from src.stage3_detail.rasterizer import compute_vertex_normals
                s8 = self._get_stage8()
                out = s8.generate(
                    vertices=neutral_vertices, faces=faces,
                    vertex_normals=compute_vertex_normals(neutral_vertices, faces),
                    uv_coords=uv, uv_faces=uvf, flame_faces=faces, displacement_map=detail_displacement,
                    resolution=int(self._c("stage6").get("texture_resolution", 2048)),
                    projected_rgb=albedo.astype(np.float32) if albedo is not None else None,
                )
                return s8.save_maps(out, output_dir)
            pbr = optional("stage8_pbr", _pbr)
            if pbr:
                detail_maps.update(pbr)

        # ── Stage 4 ─────────────────────────────────────────────────────────
        facial_hair_manifest = None
        if self._c("stage4").get("enabled", True):
            c4 = self._c("stage4")
            hair = optional("stage4_facial_hair", lambda: self._get_stage4().generate(
                neutral_vertices=neutral_vertices, faces=faces, detail_displacement_mm=detail_displacement,
                config=c4.get("config", c4.get("preset", "stubble")), output_dir=output_dir,
                resolution=int(c4.get("resolution", res3))))
            if hair:
                facial_hair_manifest = hair.get("manifest")
                if facial_hair_manifest and facial_hair_manifest.get("stubble", {}).get("generated", False):
                    detail_displacement = hair["stubble_displacement_mm"]

        # ── Stage 5 ─────────────────────────────────────────────────────────
        print("[Stage 5] Exporting neutral mesh and production assets...")
        expression_metadata = {
            "per_view": [{"psi": vf.psi.tolist(), "pose_theta": vf.pose_theta.tolist()} for vf in view_fits],
            "note": "Export is neutral (psi=0, theta=0); per-view expression is metadata only.",
        }
        output_paths = self._export(
            vertices=neutral_vertices, faces=faces, detail_maps=detail_maps,
            expression_metadata=expression_metadata, beta=beta, photo_paths=[p for p, _ in pairs],
            output_dir=output_dir, facial_hair_manifest=facial_hair_manifest, status=status,
            extra={
                "view_fits": [vf.to_dict() for vf in view_fits],
                "texture_fractions": fill_fractions,
                "displacement_encoding": {"max_scale_mm": fusion.max_scale_mm,
                                          "png_full_range_m": 2 * fusion.max_scale_mm / 1000.0},
                "flame_source": str(self.flame_path),
                "sculpt_detail": sculpt_info,
            },
        )

        # ── Evaluation ──────────────────────────────────────────────────────
        if self._c("evaluation").get("enabled", True) and albedo is not None:
            def _eval():
                from evaluation.phase0_eval import EvalFace, IdentityJudge, evaluate_run
                judge = IdentityJudge(self.detector.app) if getattr(self.detector, "app", None) is not None else None
                faces_eval = [EvalFace(lm.bbox, judge.embed(im) if judge is not None else None)
                              for lm, im in zip(mps, photos)]
                sh = fr.get("sh_coeffs") if fr is not None else None
                return evaluate_run(output_dir, photos, faces_eval, view_fits, neutral_vertices, faces, uv, uvf, albedo,
                                    judge, extra={"texture_fractions": fill_fractions},
                                    sh_lum=sh[0] if sh is not None and len(sh) else None)
            rep = optional("evaluation", _eval)
            if rep is not None:
                output_paths["report"] = str(output_dir / "report.json")
            detail_mesh = output_dir / "head_mesh_detail.obj"
            if self._c("evaluation").get("clay_renders", True) and detail_mesh.exists():
                def _clay():
                    from scripts.render_clay import render_clay
                    e = np.load(ROOT / self._c("stage2").get("mediapipe_embedding", "data/flame_model/mediapipe_embedding_open.npz"))
                    lm = (neutral_vertices[faces[e["face_idx"]]] * e["bary"][..., None]).sum(1)
                    eye_c = lm[[33, 133]].mean(0)                        # MediaPipe eye corners
                    mouth_c = lm[[13, 14, 61, 291]].mean(0)
                    ev = output_dir / "eval"
                    out = {"clay_front": render_clay(str(detail_mesh), str(ev / "clay_front.png"), 1024, 20)}
                    out["clay_eye"] = render_clay(str(detail_mesh), str(ev / "clay_eye.png"), 1024, 25,
                                                  tuple(eye_c), 0.05)
                    out["clay_mouth"] = render_clay(str(detail_mesh), str(ev / "clay_mouth.png"), 1024, 15,
                                                    tuple(mouth_c + [0, 0.005, 0]), 0.075)
                    return out
                clay = optional("evaluation_clay", _clay)
                if clay:
                    output_paths.update(clay)

        # ── Look-dev render (Blender Cycles) ────────────────────────────────
        rc = self._c("render")
        if rc.get("enabled", False):
            def _render():
                from scripts.render_blender_film import execute_film_render, parse_args
                mesh = output_dir / "face_lod0.obj"
                args = parse_args([
                    "--mesh", str(mesh if mesh.exists() else output_paths["obj_path"]),
                    "--textures_dir", str(output_dir), "--output", str(output_dir / "film_render_cycles.png"),
                    "--save_blend", str(output_dir / "studio_scene.blend"),
                    "--samples", str(rc.get("samples", 128)),
                    "--resolution", str(rc.get("width", 2048)), str(rc.get("height", 2048)),
                    "--device", str(rc.get("device", "AUTO")),
                ])
                return execute_film_render(args)
            r = optional("render", _render)
            if r:
                output_paths["film_render"] = str(r["rendered_image"])

        # status is final only now: rewrite it into the manifest
        with open(output_paths["manifest_path"]) as fh:
            man = json.load(fh)
        man["stage_status"] = status
        with open(output_paths["manifest_path"], "w") as fh:
            json.dump(man, fh, indent=2)
        failed = {k: v for k, v in status.items() if v != "ok"}
        print(f"[Done] Output at {output_dir}" + (f"  (FAILED stages: {list(failed)})" if failed else ""))
        return output_paths

    def _ear_faces(self, faces: np.ndarray) -> list:
        """(F,) bool per ear: photo pixels on an ear texture only that ear (projector exclusive_faces)."""
        from src.utils.flame_regions import load_vertex_masks
        vm = load_vertex_masks()
        out = []
        for k in ("left_ear", "right_ear"):
            v = np.zeros(int(faces.max()) + 1, bool)
            v[vm[k]] = True
            out.append(v[faces].sum(1) >= 2)
        return out

    def _measured_detail(self, sculpt, c3: dict) -> dict:
        """
        Phase 1B detail: a UV displacement map measured by multi-view photo consistency
        (src/fitting/mv_refine.refine_detail), band-passed to folds and grooves (the refinement's vertex
        offsets already carry coarse shape) and added to the sculpt displacement. Ground truth: a
        2.5 mm under-eye groove: see DOCS/04 Phase 1B (measured mesostructure); none from 1 photo.
        """
        from src.fitting.mv_refine import DetailRefineConfig, refine_detail
        from src.stage3_detail.sculpt_detail import normal_map
        refiner, views, fit = self._mv_ctx
        uv, uvf = self.uv_layout()
        print(f"[Stage 3] Measuring folds and grooves from {len(views)} same-session views (multi-view consistency)...")
        fields = DetailRefineConfig.__dataclass_fields__
        dcfg = DetailRefineConfig(**{k: (tuple(v) if isinstance(v, list) else v)
                                     for k, v in (c3.get("measured") or {}).items() if k in fields})
        D = refine_detail(refiner, views, fit, uv, uvf, dcfg)
        R = D.shape[0]
        regions = self.uv_regions()
        R0 = regions["texel_mm"].shape[0]
        tmm = cv2.resize(regions["texel_mm"], (R, R), interpolation=cv2.INTER_NEAREST) * (R0 / R)   # mm per D texel
        m = (D != 0).astype(np.float32)
        hp_mm = float(c3.get("measured_highpass_mm", 6.0))
        sig = hp_mm / float(np.median(tmm[(m > 0) & (tmm > 0)]))
        low = cv2.GaussianBlur(D * m, (0, 0), sig) / np.maximum(cv2.GaussianBlur(m, (0, 0), sig), 1e-3)
        band = (D - low) * m
        # keep measured grooves/creases only: the raw map also carries texture-driven blob relief
        from src.stage3_detail.sculpt_detail import measured_creases
        band = measured_creases(band, float(np.median(tmm[(m > 0) & (tmm > 0)])))
        # feather the region edge so no step appears where the measurement stops
        band *= cv2.GaussianBlur(cv2.erode(m, np.ones((5, 5), np.uint8)), (0, 0), 2.0)
        out_res = sculpt["displacement_mm"].shape[0]
        up = cv2.resize(band, (out_res, out_res), interpolation=cv2.INTER_CUBIC)
        sculpt["displacement_mm"] = (sculpt["displacement_mm"] + up).astype(np.float32)
        tmm_out = cv2.resize(regions["texel_mm"], (out_res, out_res), interpolation=cv2.INTER_NEAREST) * (R0 / out_res)
        sculpt["normal_rgb"] = normal_map(sculpt["displacement_mm"], np.where(tmm_out > 0, tmm_out, 1.0))
        return {"resolution": R, "highpass_mm": hp_mm, "min_mm": float(band.min()), "max_mm": float(band.max()),
                "rms_mm": float(np.sqrt((band[m > 0] ** 2).mean()))}

    def _save_sculpt(self, sculpt, max_scale_mm, saved, neutral_vertices, faces, output_dir, status):
        """Writes 4K displacement/normal maps (replacing the 1K fusion ones) and the sculpt mesh."""
        from src.stage3_detail.sculpt_detail import apply_to_mesh
        from src.utils.flame_regions import load_vertex_masks
        from src.utils.subdivision import export_obj_with_uvs

        from src.stage3_detail.fusion import _collar_falloff
        disp = sculpt["displacement_mm"] * _collar_falloff(sculpt["displacement_mm"].shape[0],
                                                           self.uv_regions()["neck_pinning"])   # Rule 4
        if float(np.abs(disp).max()) > max_scale_mm:
            raise RuntimeError(f"Sculpt displacement exceeds the ±{max_scale_mm} mm encoding range.")
        u16 = np.round(np.clip((disp / max_scale_mm + 1.0) * 0.5, 0, 1) * 65535).astype(np.uint16)
        cv2.imwrite(str(saved["displacement_png"]), u16)
        cv2.imwrite(str(saved["normal_png"]), cv2.cvtColor(sculpt["normal_rgb"], cv2.COLOR_RGB2BGR))
        st = sculpt["settings"]
        info = {"detail_level": st.level, "subdivision": st.subdivision, "meso_gain": st.meso_gain,
                "micro_gain": st.micro_gain, "map_resolution": int(disp.shape[0]),
                "meso_source": "photo (delit texture, Hessian crease detection)",
                "micro_source": "synthesized (pores, micro-grooves, lip striations)"}
        if sculpt.get("measured_mm"):
            info["measured_source"] = "multi-view photo consistency (same-session views)"
            info["measured"] = sculpt["measured_mm"]

        def _mesh():
            uv, uvf = self.uv_layout()
            vm = load_vertex_masks()
            pinned = np.unique(np.concatenate([vm["boundary"], vm["left_eyeball"], vm["right_eyeball"]]))
            V, F, U, UF = apply_to_mesh(neutral_vertices, faces, uv, uvf, disp, st.subdivision, pinned)
            path = Path(output_dir) / "head_mesh_detail.obj"
            export_obj_with_uvs(path, V.astype(np.float32), F, U, UF)
            info.update({"mesh": str(path), "mesh_vertices": int(len(V)), "mesh_triangles": int(len(F))})
            return path
        self._run_optional(status, "stage3_sculpt_mesh", _mesh)
        return info

    # ------------------------------------------------------------------ export
    def _export(
        self,
        vertices: np.ndarray,
        faces: np.ndarray,
        detail_maps: Dict[str, str],
        expression_metadata: dict,
        beta: np.ndarray,
        photo_paths: list,
        output_dir: Path,
        facial_hair_manifest: Optional[dict],
        status: Dict[str, Any],
        extra: Optional[dict] = None,
    ) -> Dict[str, Any]:
        uv, uvf = self.uv_layout()
        obj_path = output_dir / "head_mesh.obj"
        with open(obj_path, "w") as f:
            f.write("# Face Geometry Pipeline - canonical neutral base mesh with UVs\n")
            f.write("mtllib head_mesh.mtl\nusemtl skin\n")
            for v in vertices:
                f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
            for vt in uv:
                f.write(f"vt {vt[0]:.6f} {vt[1]:.6f}\n")
            for fv, fvt in zip(faces + 1, uvf + 1):
                f.write(f"f {fv[0]}/{fvt[0]} {fv[1]}/{fvt[1]} {fv[2]}/{fvt[2]}\n")
        if detail_maps.get("albedo"):
            rel = Path(detail_maps["albedo"]).resolve().relative_to(output_dir.resolve())
            (output_dir / "head_mesh.mtl").write_text(f"newmtl skin\nKd 1 1 1\nmap_Kd {rel}\n")

        stage5_manifest: Dict[str, Any] = {}
        if self._c("stage5").get("enabled", True):
            def _stage5():
                from src.stage5_export.exporter import Stage5Exporter
                c5 = self._c("stage5")
                exporter = Stage5Exporter(correspondence_w_path=c5.get("correspondence_w"),
                                          enable_lods=True, enable_armature=True)
                return exporter.export_production_asset(
                    neutral_vertices=vertices, faces=faces, output_dir=output_dir,
                    export_fbx=bool(c5.get("export_fbx", True)), stylization_params=c5.get("stylize"),
                    detail_maps=detail_maps, facial_hair_manifest=facial_hair_manifest)
            stage5_manifest = self._run_optional(status, "stage5_export", _stage5) or {}

        manifest = {
            "pipeline_version": "0.2.0-phase0",
            "photo_paths": [str(p) for p in photo_paths],
            "beta_shape": beta.tolist(),
            "expression_metadata": expression_metadata,
            "vertex_count": int(vertices.shape[0]),
            "face_count": int(faces.shape[0]),
            "detail_maps": detail_maps,
            "facial_hair": facial_hair_manifest,
            "stage5_production_assets": stage5_manifest,
        }
        if extra:
            manifest.update(extra)
        manifest_path = output_dir / "manifest.json"
        with open(manifest_path, "w") as f:
            json.dump(manifest, f, indent=2, default=_json_default)

        mh = stage5_manifest.get("metahuman_bridge", {}) or {}
        out = {
            "obj_path": str(obj_path),
            "manifest_path": str(manifest_path),
            "blendshapes_path": stage5_manifest.get("blendshapes_json"),
            "armature_path": stage5_manifest.get("armature_json"),
            "fbx_path": stage5_manifest.get("fbx_file"),
            "metahuman_obj": mh.get("obj_path"),
        }
        out.update(detail_maps)
        return out

    @staticmethod
    def _run_optional(status: Dict[str, Any], name: str, fn):
        try:
            out = fn()
            status[name] = "ok"
            return out
        except Exception as e:  # noqa: BLE001 - recorded in the manifest
            status[name] = f"failed: {type(e).__name__}: {e}"
            print(f"[{name} FAILED] {type(e).__name__}: {e}", file=sys.stderr)
            traceback.print_exc()
            return None


def _texel_density_ratio(verts, faces, uv, uvf, ras, target, source) -> float:
    """Median texels-per-mm of the `target` UV area divided by that of the `source` area."""
    t3 = verts[faces]
    a3 = 0.5 * np.linalg.norm(np.cross(t3[:, 1] - t3[:, 0], t3[:, 2] - t3[:, 0]), axis=1)
    t2 = uv[uvf]
    e1 = t2[:, 1] - t2[:, 0]
    e2 = t2[:, 2] - t2[:, 0]
    a2 = 0.5 * np.abs(e1[:, 0] * e2[:, 1] - e1[:, 1] * e2[:, 0])
    dens = np.sqrt(a2 / np.maximum(a3, 1e-12))
    fid = ras.face_id
    dt, ds = fid[target & (fid >= 0)], fid[source & (fid >= 0)]
    if not len(dt) or not len(ds):
        return 1.0
    return float(np.median(dens[dt]) / np.median(dens[ds]))


def _iod(det) -> float:
    lm = det.landmark_3d_68
    if lm is None:
        return float(np.linalg.norm(det.landmarks_5pt[0] - det.landmarks_5pt[1]))
    return float(np.linalg.norm(lm[36:42, :2].mean(0) - lm[42:48, :2].mean(0)))


def _mouth_interior_pixels(photo: np.ndarray, outer_lip_px: np.ndarray, iod: float, skin: np.ndarray) -> np.ndarray:
    """
    Teeth and mouth-cavity pixels inside the (dilated) outer lip contour: much less chromatic
    than skin (teeth) or much darker (cavity). Complements the inner-lip polygon, which misses
    teeth on wide smiles.
    """
    outer = np.zeros(photo.shape[:2], np.uint8)
    cv2.fillPoly(outer, [np.round(outer_lip_px).astype(np.int32)], 1)
    outer = cv2.dilate(outer, np.ones((max(3, int(0.05 * iod)),) * 2, np.uint8)).astype(bool)
    lab = cv2.cvtColor(photo, cv2.COLOR_BGR2LAB).astype(np.float32)
    chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
    ref = skin & ~outer
    if ref.sum() < 100:
        return np.zeros_like(outer)
    c_ref, l_ref = np.median(chroma[ref]), np.median(lab[..., 0][ref])
    bad = outer & ((chroma < 0.45 * c_ref) | (lab[..., 0] < 0.45 * l_ref))
    return cv2.dilate(bad.astype(np.uint8), np.ones((5, 5), np.uint8)).astype(bool)


def _json_default(o):
    if isinstance(o, (np.floating, np.integer)):
        return o.item()
    if isinstance(o, np.ndarray):
        return o.tolist()
    if isinstance(o, Path):
        return str(o)
    raise TypeError(f"not JSON serializable: {type(o)}")
