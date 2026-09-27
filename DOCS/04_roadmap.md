# 04 — Roadmap: from `elon_v3` to a production head

> Ordered by **impact ÷ effort**. Each phase has a verification gate measured by the evaluation
> protocol in §9, not by unit tests passing. Time estimates assume one developer working part-time on Kaggle.

---

## Phase 0 — Stop the bleeding (2–4 days, no training) → target L1

The goal is to take the existing code, remove the causes of the worst artifacts, and get a *clean, registered, recognizable* bald head. Do this **before** building v3, because it establishes the evaluation harness and a baseline.

### ✅ Status (2026-09-25): implemented and evaluated on a 9-subject golden set

`python3 scripts/run_golden_set.py --baseline outputs/golden_v1_baseline`. Results are in `outputs/golden_phase0/_summary/` (contact sheet, `summary.md`). The baseline is the **unmodified v1 code at `23e6fe6`**, run on the same photos; only the Multiface GAN weights were no longer available for it.

| Metric (held-out judge: buffalo_l recognition, used by no pipeline stage) | v1 | Phase 0 |
|---|---|---|
| Mean identity cosine, frontal render | 0.383 | **0.782** |
| Mean identity cosine, +30° render | 0.323 | **0.682** |
| Mean identity cosine, −30° render | 0.361 | **0.712** |
| Subjects improved | — | **9 / 9** at every angle |
| 68-landmark reprojection error | not measured | 4.5 – 6.9 % IOD (mean 5.8 %) |

**Gate check:**
- ✅ Overlays aligned, no ghost eyes, no embossing.
- ✅ Identity improved on every subject.
- ❌ **Landmark error ≤ 5 % IOD on only 2 / 9.** The fit keeps MICA's β fixed, so shape errors cannot be absorbed. That moves to Phase 1 (β + Δ fitting, dense correspondences).

**Deviations from the plan below**
- *0.4:* uses InsightFace's 68 **3D-projected** landmarks with FLAME's static embedding, not MediaPipe 478. The 478 → FLAME embedding is deferred to Phase 1.
- *0.5:* eyeballs and the mouth interior are handled by the z-buffer rather than FLAME_masks exclusions. The bbox zones in `material_stack.py` / `anatomical_pores.py` / `blendshapes.py` and the "lowest 20 % Y" seam rule are **not replaced yet**; that moves to Phase 2 with the template assets.
- *0.6:* SMIRK was not vendored (code and weights unavailable). It is **replaced** by a per-view camera/pose/expression/jaw landmark fit (`src/stage2_expression/landmark_fit.py`), which is what texture registration needed.
- *Weights:* FLAME is rebuilt from the MICA checkpoint (`scripts/extract_flame_from_mica.py`), because the Kaggle datasets are not reachable with the current API token.

**Known limitations visible in the results** (all planned in later phases):
- Bald heads (Phase 5).
- Photo lighting baked into the albedo (Phase 3).
- Expression baked into the texture: a smiling photo paints teeth onto the neutral closed lips (Phase 3; interim option: exclude the inner-lip texels when ψ/jaw open the mouth).
- Geometry stays near MICA's shape prior (Phase 1).
- About 55 % of the UV (scalp, back, far side) is interpolated from the observed skin, not observed.

### 0.1 Fix the MICA input (R1)

In `src/stage1_identity/inference.py`, stop using `det.embedding` (buffalo_l). Compute MICA's own feature the way `vendor/MICA/datasets/creation/util.py:get_arcface_input` does:

```python
from insightface.utils import face_align
crop = face_align.norm_crop(image_bgr, landmark=det.landmarks_5pt)            # 112×112
blob = cv2.dnn.blobFromImages([crop], 1.0 / 127.5, (112, 112),
                              (127.5, 127.5, 127.5), swapRB=True)
with torch.no_grad():
    feat = F.normalize(self.arcface(torch.from_numpy(blob).to(self.device)))  # MICA's ArcFace
    beta = self.regressor(feat)
```

Also:
- Make `checkpoint['arcface']` **required**.
- Load the regressor with `strict=True`.
- Add a golden test: β for one sample image must match `vendor/MICA/demo.py` output within 1e-4.

### 0.2 Turn off the fake detail (R5)

- `stage3.weight_macro: 0` (Multiface GAN off) and `stage3.enable_meso: false` (no luminance → height).
- Keep micro pores at a low weight. Derive the normal map from micro detail only.
- Use one displacement scale (mm) written into the manifest and read by `render_blender_film.py`. Remove the hardcoded `0.0008` there and the `max_scale_mm=5.0` in `fusion.py`.

### 0.3 Turn off the Stage 1.5 contour deformer (R3)

Set `stage1_5.enabled: false`. It returns in a correct form as Δ inside the S3 fitter.

### 0.4 Real camera (R2)

Take the focal length from EXIF:

```python
f_px = FocalLength_mm * FocalPlaneXResolution / 25.4
```

This assumes `FocalPlaneResolutionUnit == 2` (inches). If the image was resized after capture, scale by the width ratio. The fallback is `FocalLengthIn35mmFilm × diag_px / 43.27`. For `elon.jpg` this gives 104 × 5773/25.4 ≈ **23,600 px**, not 2,924.

- Replace 5-point PnP with PnP on MediaPipe's 478 landmarks, mapped to FLAME. The MICA/metrical-tracker ecosystem ships a FLAME↔MediaPipe landmark embedding *(verify filename)*. Exclude contour points.
- Pass the same intrinsics to projection, the deformer (if it is ever re-enabled) and the renderer.

### 0.5 Honest projection (R4)

- **Visibility:** replace the unused vertex-splat `_compute_visibility_mask` with a triangle-rasterized depth test (nvdiffrast on Kaggle; a CPU z-buffer per triangle is fine locally).
- **Exclusions:** don't project onto `left_eyeball`, `right_eyeball` or the mouth interior. Use the **official FLAME region masks** that already exist in `vendor/MICA/data/FLAME2020/FLAME_masks/FLAME_masks.pkl`. They include face, lips, nose, ears, scalp, eye regions, eyeballs, neck and **boundary** (114 seam vertices). These masks also replace every bbox "zone" in `material_stack.py`, `anatomical_pores.py` and `blendshapes.py`, and the "lowest 20 % Y" seam rule.
- Add a face-parsing mask (skin/brows/lips/ears only). Hair and background pixels must never land in the skin UV.
- Delete the eye CLAHE/unsharp block.

### 0.6 Expression, or at least honesty about it

- Vendor SMIRK properly (`vendor/smirk` is missing), and apply the resulting jaw and ψ to the mesh **used for projection** (the export stays neutral).
- If SMIRK isn't available, **raise**. Remove `allow_neutral=True` from `pipeline.py:94`.

### 0.7 Remove silent fallbacks (R9)

- Remove every `except Exception: print/pass` in `pipeline.py`, `projector.py` and the Stage 3/7 loaders. Each becomes either a raised error or an explicit `status: skipped_by_config` in the manifest.
- Switch `strict=False` loads to `strict=True`.

### 0.8 Evaluation harness (see §9) — the most important deliverable of Phase 0

**Gate for Phase 0:**
- Overlay renders are aligned: 478-landmark error ≤ 5 % of the inter-ocular distance.
- No ghost eyes or embossed features.
- The held-out identity score on the golden set is **higher than the v1 `elon_v3` settings** for every subject.

### 0.9 Repository hygiene

- Delete `legacy_flame_pipeline/` (an identical duplicate; git history keeps the old code).
- Stop the `[gitbrain]` auto-commit automation and delete `utils/dateCalculators.js` and `activity_log.md`.
- Update `AGENTS.md`, `roadmap.md`, `GUIDE.md` and `remember.md` so that agents follow v3, not v1.

---

## Phase 1 — Perception + analysis-by-synthesis fitter (1–2 weeks) → L2 geometry

1. `src/perception/`: EXIF, MediaPipe 478 + ARKit scores, Pixel3DMM dense UV + normals, parsing, matte, quality gates.
2. `src/fitting/`: renderer interface, FLAME layer (PyTorch, including subdivision-2 with a fixed subdivision matrix), losses, and the 5-step schedule from `02 §S3`. Adapt from metrical-tracker or VHAP rather than writing from scratch.
3. Δ residual on subdivision-2 with Laplacian + ARAP + symmetry, and seam pinning using the FLAME `boundary` mask.
4. Multi-view support: shared β, f and Δ; per-view ψ, R, t and SH.

**Gate:**
- 478-landmark error ≤ 3 % IOD on the golden set.
- Identity score (held-out judge) improves over Phase 0 on ≥ 90 % of subjects.
- On NoW (or REALY), fitted geometry is no worse than MICA alone.

### ✅ Status (2026-09-26): fitter implemented (`src/fitting/fitter.py`)
- 478 MediaPipe landmarks through the clean-room embedding.
- Fits EXIF focal (trusted: a free focal drifted 13–26% by trading focal against depth), β, ψ, jaw and pose.
- Optional photometric SH stage. It gave no gain on ground truth, so it is off.
- Landmark error 2.1–3.1 % IOD on the golden set.
- Ground-truth scan, single photo: 1.205 / 0.659 mm mean / median, the best of all our single-photo
  paths including the non-commercial MICA one (1.342 mm).
- Not done: Pixel3DMM dense UV / normals (non-commercial weights; needs a self-trained replacement),
  subdivision-2 Δ residual, NoW / REALY evaluation.

## Phase 1B — Multi-view photo-consistency refinement ✅ implemented 2026-09-26

`src/fitting/mv_refine.py`, config `stage2.mv_refine`.

**Why.** Detector landmarks drift across views: the same index lands on different skin. Joint
multi-view *landmark* fitting therefore does not help (1.567 → 1.597 mm).

**How.** Starting from the Phase 1 fit, the refiner jointly optimises shared β, per-vertex normal
offsets and relative poses so that every visible surface point matches across views:
- NCC on model-tied surface samples;
- coarse to fine;
- z-buffer visibility.

**Guards.**
- EXIF same-session check (camera model, capture times within 30 min).
- The fit reverts if views still disagree (NCC < 0.6).

**Result.** Ground-truth scan, 3 photos (front, ±25°): **0.680 / 0.496 mm**, versus 1.339 / 0.713 mm
for landmarks alone. About 90 s on a CPU.

**Next:**
- validate on real same-session captures (none exist yet);
- a silhouette term for profile views;
- per-view expression inside the refinement;
- ~~full-resolution levels for measured mesostructure~~ (done, below).

**Measured mesostructure: built, off by default (2026-09-26).**
`refine_detail` solves a UV displacement map (64 → 512, NCC across views) on top of the refined fit.
Stage 3 can band-pass it (6 mm), keep only elongated valleys (`measured_creases`) and add it to the sculpt
displacement (`stage3.measured_detail`, ≥ 2 same-session views).

Ground truth: a 2.5 mm deep, σ 2 mm tear-trough groove cut into the scan (`scripts/make_groove_scan.py`),
3 views, groove run minus plain control. The table uses the exported displacement map sampled on the
centreline. That sampling is now in `scripts/eval_groove.py`; the vertex-snapping mesh rows under-read
narrow grooves.

| Variant | Groove recovered | False relief elsewhere |
|---|---|---|
| Before (no measured detail) | 0.04–0.22 mm | none |
| Raw measured map | **2.07 mm** | honeycomb ±0.7 mm over the whole face (skin texture read as relief), clearly visible in clay |
| + elongated-valley filter | 0.73 mm | 0.17 mm RMS, but visible short false creases everywhere |

Verdict: the multi-view signal is real, and the raw map sees 80 % of the groove. The texture-driven false
relief is not solved, so the feature is off by default.

Next ideas:
- regularise D with a crease prior learned from scans, rather than a hand filter;
- use the two-sided (both views) consistency residual as a per-texel confidence;
- test on a real same-session capture.

## Phase 1C — Single-photo identity: what does and does not work (2026-09-26)

**The complaint, measured.** Golden-set heads differ from each other by 2.0 mm RMS over the face
(rigid-aligned). FLAME's own population differs by 4.8 mm. From one photo, the fit stays near the mean face.

**The render → compare → correct loop already exists.** It is the Phase 1 fitter: camera distance
(EXIF focal), pose, expression and shape are optimised so the render matches the photo. The multi-view
refiner runs the same loop across photos.

**Why "loss → 0" is not the goal.** A render textured with the same photo matches that photo for *any*
shape, so the only comparisons that constrain geometry are ones the texture cannot fake: landmarks,
outlines, shading/normals, and other views.

Single-photo experiments on the ground-truth scan (mean face error, 3–5 views each run as a single photo):

| Change | Result |
|---|---|
| Weaker shape prior (λ 5e-5 → 1e-5 → 2e-6) | Landmark loss drops and \|β\| grows 5 → 14 (more "distinct"), but error goes **up** 1.25 → 1.33 → 1.43 mm: overfitting |
| DAViD predicted normals as a render-and-compare loss (`FitConfig.w_normal`) | **Worse**: 1.21 → 1.26 → 1.32 mm. DAViD normals are 10–12° off the true scan normals and bias toward the camera at yaw. Kept, default 0 |
| Face-outline (silhouette) check | The fitted jaw and chin already follow the photo outline; no loss term added |
| DAViD normals → integrated relief (normal residual, Frankot-Chellappa, high-pass) | About 0.3 mm of the 2.5 mm groove; 0.6 mm noise |

**What will work:**
1. **More than one photo of one sitting.** This is proven: 1.21 → 0.68 mm shape, and folds are measured.
   Guided capture (bet #8 in `05`) is the product answer.
2. **A dense-landmark network trained on synthetic renders.** Wood et al., ECCV 2022 ("3D face
   reconstruction with dense landmarks") fit a morphable model to 703 predicted landmarks trained only on
   synthetic data, and were state of the art on NoW. Renders of FLAME 2023 Open with our own textures
   are commercially clean training data. This is the C5 identity prior, and it plugs straight into the
   Phase 1 fitter's landmark loss.
3. **An identity loss.** This needs a commercially licensed recogniser. OpenCV Zoo's SFace weights are
   Apache-2.0, but their training data is undocumented; legal review first.

## Phase 1D — Character mode for CG cut-outs ✅ 2026-09-27

Triggered automatically when an input has an alpha matte, i.e. a cut-out, usually a game or film
character render (`stage2.character`).

**Problem.** `data/real/Hero.png` is a very muscular CG hero. Tripo and Meshy reconstruct it closely; we
produced a puffy, average-looking head. Nothing constrained the skull, ears, jaw or neck, and FLAME's
prior pulled the shape toward an average human.

**What character mode does:**
1. **Outline render-and-compare.** The model's occluding contour is matched two-sided to the alpha
   outline (`FitConfig.w_silhouette`): skull, ears, jaw and neck sides. Perspective follows; the lens
   estimate went ×1.23 → ×1.7.
2. **Normal sculpt.** Free-form offsets along the normals are carved until the rendered normals match
   DAViD's predicted normals over the whole head (`w_normal 3`, `normal_region: head`,
   `lambda_offset_lap 0.02`). On clean CG renders DAViD's normals read like a clay sculpt of the
   character. On real photos they were 10–12° off, which is why this stays off for ordinary photos.
3. **Pinned offsets.** No offsets on the eyeballs, neck seam (Rule 4) or lips (they open the neutral mouth);
   ears get 30 %.
4. **Ear texture.** Photo pixels on the model's ears texture only the ears, so no ghost ear on the cheek.
   Character mode only: on the golden set this cost −0.03 identity on every subject.

**Result on `Hero.png`.** Identity (held-out judge) at 0° / +30° / −30°:

| Run | 0° | +30° | −30° |
|---|---|---|---|
| Before | 0.685 | 0.645 | 0.681 |
| Character mode | **0.766** | **0.673** | **0.701** |

Visually, the puffy cheeks, round jaw and thin neck become a lean, squared jaw, cheek planes, a heavy
brow and a thick neck.

**Ordinary photos are unchanged.** Golden Obama scores are identical.

**Limits:**
- Profile depth is only as good as the normals from one frontal view; a side render of the character
  would constrain it.
- FLAME's 5k vertices cap the sharpness of carved planes. Finer relief (neck cords, creases) should come
  from DAViD normals as a displacement map (next step).

## Phase 3A+ — skin transfer and grazing blend ✅ 2026-09-27

Requested after the hero test. The side and back of the head were a flat, distinguishable colour, and a
dark line ran under the jaw.

**Skin transfer** (`stage7.skin_transfer`). Unseen skin is now quilted from full-detail patches (≈1 mm band,
56 px) of the subject's clean forehead and cheek skin.
- Only the calmest 50 % of candidate patches are used, which drops wrinkles, furrows and shine.
- The patches sit on the tone of the observed skin bordering the gap, not an edge-interpolated colour
  that drifts toward neck and ear tones.

**Grazing blend** (`stage7.grazing_blend`). Texels the photo sees only edge-on (beyond about 70°) fade
into the filled skin. They carried the jaw's cast shadow onto the under-jaw and neck.

**Results:**
- Hero identity is unchanged (0.765 / 0.672 / 0.702).
- Golden spot-check (Obama, Elon, Moghbeli), mean change: frontal +0.007, +30° +0.008, −30° −0.003.
- Colour casts in the photo (Elon's magenta light) carry into the transferred skin; cast removal is
  still Phase 3B.

## Phase C1b — own UV layout ✅ 2026-09-26

`scripts/build_clean_uv.py` → `data/flame_model/uv_layout_open.npz` (config `flame.uv_layout`). The
build uses only FLAME 2023 Open geometry and our clean-room masks.
- Islands: face, head halves, ears, eyeballs.
- Flattening: LSCM; packing: raster packer with rotations.
- Face: 10.7 texels/mm at 4K (old layout 12.2), with lower area distortion (p90/p10 2.2 vs 3.4).

Golden set (`outputs/golden_commercial_v4` vs `v3`), mean identity: frontal 0.725 → 0.721, +30°
0.623 → 0.617, −30° 0.672 → 0.669. No subject drops more than 0.024. This counts as within noise; the
layout is now the default.

The switch exposed layout assumptions, now fixed:
- a mirror-map cache keyed only by resolution;
- skin grain quilted in texels (now scaled by the texel-density ratio);
- "bottom 15 % of UV rows = neck" in `fusion.py` and `sculpt_detail.py` (now the `neck_pinning` UV mask
  built from the neck and boundary vertices).

---

## Phase 2 — Production template and real rig (1–2 weeks) → L2 complete

1. `tools/authoring/`: import ICT-FaceKit and build `assets/template/ict/`:
   - FLAME-mean ↔ ICT-mean dense correspondence (one-time NRICP, reviewed by eye)
   - painted region masks and seam set
   - LOD meshes + barycentric maps
   - skeleton + skin weights
   - eye / teeth / tongue / lash meshes
2. `src/production/`: per-subject registration (NRICP refinement), deformation transfer of the 52 ARKit shapes, joint re-positioning, and FBX export with morph targets.
3. Delete `blendshapes.py` bands, the `lod.py` clustering and the `metahuman_bridge.py` fake format.
4. UE5 test: import the FBX, drive it with Live Link Face (iPhone ARKit) and record a clip.

**Gate:**
- Every ARKit shape's displacement lies ≥ 95 % inside its authored region mask.
- Seam vertices are exactly 0 on all morphs.
- UE5 imports with no warnings about the skeleton or morphs.

---

## Phase 3 — Texture: complete, delit, still recognizably the photo

Requested 2026-09-25: unseen areas (back of head, far side, scalp) must carry **the subject's own skin texture** instead of a flat interpolated colour, and the photo's lighting must be removed without losing the person's look.

### 3A — No training ✅ implemented 2026-09-25

**Results (golden set, `outputs/golden_phase3a4a/_summary/`):**
- The unseen ~55 % of the UV now carries the subject's own skin grain; 0–1 % is flat-interpolated.
- The back-of-head UV seam is gone: colour is interpolated on the mesh, not in UV.
- Identity vs Phase 0: frontal 0.782 → 0.763, +30° 0.681 → 0.664, −30° 0.712 → 0.706.
  - The two largest drops (−0.05) are smiling photos, where teeth are no longer painted onto neutral lips.
  - An ablation attributed the rest to delighting. At `delight_strength` 1.0 it costs ~0.05; the default 0.5 costs ~0.01.

**What changed vs the plan:**
- Delighting is luminance-only first-order SH with a clamped correction, applied at half strength in eye and lip areas. The planned 2nd-order per-channel fit bleached eye sockets and jaws.
- Gray-edge white balance was built but defaults **off**: clothing dominated the estimate (a blue flight suit turned skin green).
- Added: lip-only fill for lip texels, a mouth-interior rejection mask, and an upper-face-only skin exemplar (beards made the grain blotchy).

**Still open (→ 3B):**
- Colour cast from coloured light (Elon's magenta stage light).
- Smile-stretched lips on the neutral mesh (a pale band on wide smiles).
- Hair (Phase 5).
1. **Lighting from geometry.** Fit 2nd-order spherical-harmonic lighting per view from the fitted mesh normals and the observed skin (a least-squares solve). Divide the shading out, normalized so the average skin tone is kept. This removes the key-light gradient and shadow sides. It does not change the overall colour cast (a single photo cannot separate skin colour from light colour).
2. **Mouth and teeth exclusion.** Photo pixels inside the inner-lip contour (landmarks 60–67) are never sampled, so a smiling photo stops painting teeth onto the neutral closed lips.
3. **Own-skin texture synthesis.** Build a skin exemplar from the observed, delit high-frequency layer (forehead and cheeks via the FLAME region masks). Synthesize the unseen UV area with patch-based image quilting (Efros & Freeman 2001). Result = smooth low-frequency colour field + the subject's own skin grain. Mirrored real detail keeps priority where it exists.
4. The provenance map gains a fourth class: `synthesized`.

**Gate:** no flat-colour regions in the UV (local high-frequency energy in synthesized areas is within 50–150 % of the observed skin's). Golden-set identity scores do not regress.

### 3B — Learned completion + delighting (needs Kaggle + a dataset)
**T1** (`03 §3`) is a LaMa-style UV inpainting and delighting network trained on self-supervised degradations of clean UV textures.
- It fixes what 3A cannot: semantic completion (ears, eyelids, a hairline consistent with the person), baked expression wrinkles, and residual colour cast.
- **Needs (commercial-safe, see `07`):** Kaggle (token verified 2026-09-25), plus a corpus of portraits you hold commercial rights to (public-domain US-government portraits, your own captures, optionally Unsplash Lite after legal review). Training pairs are made self-supervised from our own Phase 0/3A outputs. FFHQ-UV and FaceScape are non-commercial and are not used.
- Budget: about 20–40 T4-hours.

## Phase 4 — Geometric detail: a sculpt-quality mesh with a 0–100 detail knob

Requested 2026-09-25: the mesh itself (not only the painted texture) should carry skin unevenness, wrinkles and pores, controlled by `detail_level` (0–100, where 100 looks like a studio sculpt).

**What a photo can and cannot give.** A 150 mm-wide face spanning ~1000 px is ~0.15 mm/px.
- Wrinkles, folds, crow's feet, nasolabial and forehead lines (0.5–3 mm) **are resolvable** and come from the photo.
- Pores (0.05–0.2 mm) and lip striations are **at or below the pixel limit**, so they are synthesized with anatomically placed statistics. That is also how studio sculpts get them (scan-derived alpha libraries).

### 4A — No training ✅ implemented 2026-09-25

**Results:**
- `stage3.detail_level` (default 75) produces 4K displacement and normal maps plus `head_mesh_detail.obj`: 20k / 80k / 320k / 1.28M vertices across the knob range.
- Blender Workbench clay renders are written to `eval/clay_*.png`.
- Photo-derived crow's feet, under-eye folds, forehead and nasolabial lines appear in the geometry. Pores, micro-grooves and lip striations are synthesized.

**What changed vs the plan:**
- The planned band-pass "dark is deep" produced crumpled-paper relief from skin-tone blotches. It was replaced by multi-scale Hessian crease detection (Frangi line measure) plus an elongation filter, which removes the rings that moles and freckles leave.
- Unit test: a synthetic crease becomes a groove, a round spot does not.

**Still open (→ 4B):**
- A few pigment lumps survive the filter.
- Expression wrinkles from a smiling photo are baked into the neutral sculpt (see `05` bet #3).
- Pores are statistical, not the person's own.
1. **Sculpt mesh.** Loop-subdivided FLAME: `detail_level` 0–24 → level 1 (20k verts), 25–59 → level 2 (80k), 60–89 → level 3 (320k), 90–100 → level 4 (1.3M). Exported as `head_mesh_detail.obj` with UVs. The low-poly `head_mesh.obj` stays the rig/export base.
2. **Photo-derived meso detail.** Band-passed (≈0.4–3 mm) luminance of the *delit* texture, "dark is deep" (Beeler et al. 2010 mesoscopic augmentation), restricted to skin. Brows, eyes, lash lines, nostrils and the lip colour border are masked by FLAME regions; amplitude is capped per region. Unlike v1 Tier 2 it runs on delit, registered texture and never integrates low frequencies, so it cannot emboss whole features.
3. **Synthesized micro detail (4K UV).**
   - pores: Poisson-disk distributed pits, density and size per region (nose > cheeks > forehead > chin, none on lips)
   - skin cross-hatch micro-grooves
   - lip vertical striations
   - all driven by UV masks built from the official FLAME region masks
4. **The knob** scales meso amplitude, micro amplitude and subdivision level together. Displacement and normal maps are written at 4K in one unit system (mm), and the value is recorded in the manifest.
5. **Clay renders** (Blender Workbench, studio matcap) of the sculpt mesh for review, like a ZBrush viewport.

**Gate:**
- Detail is visible on the geometry at `detail_level` ≥ 60.
- The anti-embossing test holds: |corr(displacement, albedo luminance)| < 0.2 inside brow, eye and lip-border masks.
- Identity scores do not regress.

### 4B — Learned wrinkle geometry (needs Kaggle + FaceScape)
**T2** (`03 §3`) is a photo-texture + normals → displacement network trained on FaceScape's scan-derived displacement maps.
- It replaces the "dark is deep" heuristic with learned shape, which separates pigment from relief properly.
- **Needs (commercial-safe, see `07`):** Kaggle, plus the same licensed portrait corpus with DECA-style self-supervised shading loss. Validation on the CC-BY 3.0 Lee Perry-Smith scan; optional Triplegangers scans with an ML licence for supervised relief. FaceScape is non-commercial and is not used.
- Budget: about 10–30 T4-hours.
- (The pretrained DECA detail decoder is non-commercial; not an option for the commercial build.)

## Phase C — Commercial switch (parallel track, see `07_commercial_licensing.md §6`)

C1 FLAME 2023 Open (CC-BY-4.0) · C2 MediaPipe replaces InsightFace detection/landmarks · C3 MICA removed, β from the Phase 1 fitter · C4 licensed evaluation judge · C5 commercial training corpus. Gates in `07 §6`.

Status 2026-09-26:
- ✅ C1 model.
- ✅ C1a clean-room masks + embedding (`scripts/build_clean_assets.py`), which are also more accurate.
- ⏳ **C1b UV layout**: MPI permission or our own layout; blocks selling textured assets.
- ✅ C2.
- ✅ C3, with the single-photo identity gap about 0.02–0.03. Close it with a self-trained identity
  prior (C5) and multi-photo capture (Phase 1B).
- ⏳ C4, C5.

Results: `07 §7`.

## Phase 5 — Hair and grooming (2–4 weeks)

1. Single-image strands (DiffLocks-style) or, when multiple views or a video exist, strand fitting.
2. Alembic export → UE5 Groom. Automatic cards for LODs.
3. Brows, lashes and facial hair from measured densities (replaces the Stage 4 presets).

**Gate:**
- Hair-region IoU between the render and the photo's hair mask ≥ 0.8 from the input view.
- Plausible at ±60° (manual check).

---

## Phase 6 — Single-image view completion (research, 2–4 weeks)

1. S2 with a pretrained head multi-view model conditioned on FLAME renders.
2. View validation (identity + landmark agreement) and provenance weighting.
3. Ablation: fit with and without generated views.

**Gate:** On multi-view test subjects, fitting from **1 photo + generated views** gets closer to the **all-real-views** fit than 1 photo alone does (vertex error and held-out-view LPIPS).

---

## Phase 7 — Capture path for film grade (parallel, optional)

A single uncontrolled photo cannot produce film-grade (L4) skin; the information is not in the pixels.
If film grade is the goal, build the capture path from `older/data_collection_protocol.md`:
- 8–16 synchronized or turntable views, cross-polarized flash (separates diffuse from specular)
- a photometric-stereo pass for pore normals
- the same v3 fitter with every view real

This also produces **commercially owned data** (with talent releases) that removes the license problems in `03 §6`.

---

## Phase 8 — Personalized animation (innovation track)

From a 10–20 s selfie video, fit per-subject corrective blendshapes on top of the transferred ARKit set, using MediaPipe's per-frame ARKit scores as weak labels and the fitter as supervision. See `05_innovation_bets.md`.

---

## 9. Evaluation protocol (build in Phase 0, run on every change)

**Golden set:** 20–30 subjects, each with 1 hero photo and, where possible, 2–4 extra views.
- Vary lens (phone 26 mm to 105 mm+), pose, age, skin tone, facial hair, glasses on and off.
- Include `elon.jpg` as the regression anchor.
- Store it outside git, with a manifest in git.

**Per-subject metrics** (written to `report.json`):

| Metric | Definition |
|---|---|
| `id_judge` | cos(AdaFace(render), AdaFace(photo)) at the fitted camera. The judge network is **never** used in any loss. |
| `id_judge_novel` | same, on a real held-out view if one exists (catches frontal-only overfitting) |
| `lmk_err_iod` | mean 478-landmark error / inter-ocular distance |
| `lpips_skin` | LPIPS between the render and the photo, on the skin mask |
| `coverage_observed` | % of face UV that is observed (vs inferred or generated) |
| `emboss_corr` | the Phase 4 anti-embossing statistic |
| `rig_region_ok` | fraction of ARKit shapes that pass the region test |

**Artifacts per run:** overlay per view, a turntable (0/±45/±90), a UV provenance map, and a contact sheet across the golden set.

**Rule:** a change that lowers the median `id_judge` or raises the median `lmk_err_iod` on the golden set is a regression, no matter how many unit tests pass.
