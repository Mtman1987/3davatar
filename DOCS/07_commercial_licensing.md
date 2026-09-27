# 07 — Commercial Use: Licence Audit, Commercial-Safe Data and Switch Plan

> Written 2026-09-25 after web research (sources at the end). **This is an engineering audit, not legal advice.** Have a lawyer confirm before you ship, especially the face and biometric points in §5.

## 1. Bottom line

- **Today the pipeline is research-only.** Four components carry non-commercial licences: FLAME 2020, MICA, InsightFace's pretrained models, and the FLAME masks and embeddings taken from MICA.
- **All four have commercial-safe replacements.** The most important one now exists: **FLAME 2023 Open is CC-BY-4.0** (released 11/2025), so the core head model can stay.
- **Almost every public face dataset is non-commercial.** That includes FaceScape, FFHQ-UV, NPHM, NeRSemble, Multiface, Ava-256, RenderMe-360 and Face Synthetics.
- **MetaHuman's EULA explicitly forbids** using MetaHumans to train AI.
- The practical commercial route for the learned models (3B, 4B) is:
  1. **Self-supervised training on photos you have commercial rights to.** The pipeline turns each photo into its own training pair, so no licensed 3D or UV dataset is needed.
  2. Optionally **paid scans with an explicit ML licence** (Triplegangers).
  3. **Your own consented captures** (the protocol is in `older/data_collection_protocol.md`).

## 2. Component audit

| Component | Used for | Licence | Commercial? | Replacement | Action |
|---|---|---|---|---|---|
| FLAME 2020 (`generic_model.pkl`, rebuilt from MICA) | head model everywhere | MPI non-commercial | ❌ | **FLAME 2023 Open**, CC-BY-4.0 (attribution required) | **You:** register at flame.is.tue.mpg.de and download `FLAME2023Open.zip`. **Me:** adapt the loader and check topology, UVs and landmark embedding |
| MICA (`mica.tar`, `vendor/MICA`) | initial identity β | non-commercial (also trained on non-commercial scans) | ❌ | Drop it. β comes from the Phase 1 fitter (landmarks + dense correspondences + photometric), starting from the FLAME mean | Phase C3 |
| FLAME masks / 68-landmark embedding (from MICA repo) | region masks, landmark fit | FLAME 2020 / MICA terms | ❌ | Whatever ships with FLAME 2023 Open; otherwise author our own (Phase 2 template assets) | Phase C1 |
| InsightFace `buffalo_l` models | detection, 68 landmarks, ArcFace | code MIT; **models non-commercial** | ❌ | **MediaPipe** Face Detector + Face Landmarker (478 pts), Apache-2.0. We build our own 478→FLAME correspondence once by fitting to MediaPipe's canonical face mesh | Phase C2 |
| InsightFace recognizer as eval "judge" | golden-set metric | non-commercial | ⚠️ | Buy InsightFace's commercial licence, or a recognizer trained on commercially licensed data. Even internal evaluation for a commercial product is outside "non-commercial research" | Decide (C4) |
| MediaPipe multiclass segmenter | skin parsing | Apache-2.0 | ✅ | — | — |
| Our code (soft rasterizer, fitter, texture, sculpt detail) | everything | yours | ✅ | — | — |
| PyTorch, NumPy, SciPy, OpenCV, trimesh, Pillow | runtime | BSD / MIT / Apache | ✅ | — | — |
| Blender (clay renders, FBX packaging) | tooling | GPL | ✅ as a tool | Don't ship `bpy` scripts inside a closed product; outputs are yours | — |
| ICT-FaceKit (Phase 2 template) | production topology + ARKit shapes | MIT | ✅ | — | — |
| Golden-set photos | evaluation | public domain (US gov) + one CC BY-SA | ✅ for internal eval | Keep out of training and marketing (personality rights) | — |

## 3. Datasets: what you can and cannot use

### ❌ Not usable commercially (do not train shipped models on these)

| Dataset / asset | Why |
|---|---|
| FaceScape, NPHM, NeRSemble, RenderMe-360, Ava-256, Multiface | non-commercial research licences |
| FFHQ, FFHQ-UV, FFHQ-UV-Intrinsics | NC-licensed (FFHQ-UV-Intrinsics is CC BY-NC-ND); about half the source Flickr photos are NC |
| Microsoft Face Synthetics | non-commercial research |
| MetaHuman renders | Epic EULA forbids use for training or testing AI/ML |
| 3DScanStore scans (standard licence) | terms prohibit AI-training datasets and AI-derived character generators; a custom deal is needed |
| Ten24 free head scans | not licensed for commercial use |
| Triplegangers scans (standard purchase) | ML use prohibited **without** their separate ML licence |

### ✅ Commercial-safe sources

| Source | What you get | Terms (check the current text) | Use in this project |
|---|---|---|---|
| **Your own captures** with talent releases | multi-view, cross-polarized photos of consenting people | yours | Best data for everything, including film grade (Phase 7) |
| **US federal government photos** (NASA, DoD/DVIDS, official portraits) | tens of thousands of high-res portraits, often with EXIF | public domain in the US (17 U.S.C. §105) | Self-supervised 3B/4B training photos. Personality rights and no-endorsement rules still apply |
| **Unsplash Lite dataset** | 25k photos (a portrait subset) | licence to *internally* train ML models for internal business purposes; must not infringe publicity or privacy rights; no redistribution | Extra training photos, **after legal review** of the publicity clause |
| **Triplegangers** + ML licence (contact them) | high-res face scans (9M polys, 8K textures), 21 FACS expressions per person | paid; NVIDIA bought a commercially licensed Triplegangers set for SOMA-X | True displacement and albedo ground truth for 4B and 3B |
| **Lee Perry-Smith head scan** (Infinite-Realities) | one high-res scan with textures | **CC BY 3.0** (attribution) | Pore and micro-detail exemplar library; 4B validation. One subject only |
| Paid stock with explicit AI-training rights (e.g. Generated Photos, stock-agency AI licences) | licensed portraits | per contract | More training photos if needed |

## 4. How 3B and 4B train without a licensed 3D dataset

The key idea: **the pipeline makes its own training pairs.** For every commercially licensed portrait, Phases 0 and 3A already produce:
- a registered, partially delit UV texture,
- an observed-texel mask,
- a fitted mesh, camera and SH lighting.

**T1, texture completion + delighting (3B)**
- Hide random regions of the *observed* texels, shaped like real occlusion (grazing angles, far side, hair) and taken from other subjects' masks, and train a LaMa-style network to restore them. The ground truth is real pixels of the same person.
- Delighting: add a self-supervised loss where predicted albedo × the fitted SH shading must re-render the photo, plus a smoothness prior on albedo chroma.
- **Scale:** 5–20k portraits make a useful first model. Roughly 20–40 T4-hours.

**T2, wrinkle geometry (4B)**
- DECA-style self-supervision: predict a displacement map, re-shade the fitted mesh (+ displacement) under the fitted lighting, and match the photo's high-frequency band. A regularizer keeps displacement away from pigment (chroma-correlated) edges.
- The CC-BY Lee Perry-Smith scan and any Triplegangers ML-licensed scans become the **validation set** (true relief). With enough licensed scans, add a supervised loss.
- Roughly 10–30 T4-hours.

Your Kaggle token works (verified 2026-09-25). Kaggle's own terms allow training; the licence question is only about the data.

## 5. Face-specific legal points to clear before shipping

- **Biometric laws:** processing face geometry can count as biometric data (e.g. Illinois BIPA, GDPR Art. 9, CCPA/CPRA). You need consent and retention policies for users' photos, and for training data you collect yourself.
- **Likeness and publicity rights:** public-domain *copyright* status of a photo does not waive the depicted person's publicity rights. Avoid training on, or demoing with, recognizable celebrities in commercial material.
- **Attribution:** CC-BY assets (FLAME 2023 Open, Lee Perry-Smith scan) need attribution in the product credits.
- **Models trained on non-commercial data are non-commercial.** Anything trained so far on Multiface (the removed GAN) must not ship. It is already deleted; see `older/REMOVED_WORK_REPORT_2026-09-25.md`.

## 6. Switch plan (Phase C, can run in parallel with Phase 1)

| Step | Work | Gate | Status (2026-09-26) |
|---|---|---|---|
| **C1** | Load FLAME 2023 Open; check vertex count, UVs, landmark embedding and masks; regenerate mirror and region maps | All tests pass on FLAME Open; golden-set identity within 0.02 of the FLAME 2020 run | **Done.** Masks and embedding rebuilt clean-room (C1a); own UV layout (C1b) |
| **C1a** | Clean-room region masks + MediaPipe→FLAME embedding from FLAME 2023 Open geometry and MediaPipe's canonical mesh only (`scripts/build_clean_assets.py`) | No MICA / FLAME 2020 input; ground truth no worse | **Done.** Ground truth *better*: single view 1.438 → 1.205 mm, 3-view 0.861 → 0.680 mm |
| **C1b** | UV layout: `data/flame_model/head_template.obj` came via the MICA repository, and the CC-BY licence names only the FLAME 2023 Open model | Written permission from MPI (flame@tuebingen.mpg.de) **or** our own layout | **Done (own layout), 2026-09-26.** `scripts/build_clean_uv.py`: 7 islands (face, 2 head halves, 2 ears, 2 eyeballs), LSCM + raster packing, no MICA input. Face 10.7 texels/mm at 4K (old layout 12.2) with less stretch (p90/p10 density 2.2 vs 3.4). Golden-set identity within 0.006 of the old layout (DOCS/04 Phase C1b) |
| **C2** | Replace InsightFace detection and 68 landmarks with MediaPipe (478); build our own 478→FLAME Open barycentric correspondence | Landmark error ≤ current (mean 5.8 % IOD) | **Done.** 2.1–3.1 % IOD on the golden set (478-point metric) |
| **C3** | Remove MICA: β from the Phase 1 fitter (landmarks + dense + photometric), initialized at the FLAME mean | Golden-set identity ≥ the Phase 3A/4A run. Expect a dip until the Phase 1 fitter is complete | **Done, gate not met on single photos** (see §7). Multi-photo input more than closes the gap on ground truth |
| **C4** | Evaluation judge: license InsightFace commercially, or adopt a commercially licensed recognizer | Decision recorded | Open (InsightFace stays evaluation-only) |
| **C5** | Build the commercial training corpus (PD government portraits + your captures, optionally Unsplash Lite after review; Triplegangers ML licence if budget allows); train T1/T2 on Kaggle | Phase 3B / 4B gates | Open |

**What I need from you:**
1. ~~Download FLAME 2023 Open~~ (done 2026-09-25).
2. ~~Email MPI about the FLAME texture space (C1b)~~: no longer needed, we ship our own layout.
3. Decide on the evaluation judge (C4).
4. Decide whether to contact Triplegangers for an ML licence.
5. Legal sign-off on Unsplash Lite (optional).

## 7. Results: FLAME 2020 vs FLAME 2023 Open, and what the commercial switch costs

**The model version is not the issue.**

Capacity, fitting FLAME directly to the CC-BY Lee Perry-Smith scan (face region, mean / median):

| Components | FLAME 2020 | FLAME 2023 Open |
|---|---|---|
| 100 | 0.338 / 0.233 mm | 0.348 / 0.223 mm |
| 300 | 0.351 / 0.187 mm | 0.388 / 0.189 mm |

The two are equivalent. Same topology; the templates differ by 1.9 mm on average.

**Reconstruction from photos.** Ground-truth renders of the same scan, mean / median face error.

| Pipeline | Licence | 1 photo (4 scenes) | 3 photos, same session |
|---|---|---|---|
| Old: MICA + 68 landmarks | non-commercial | 1.396 / ~0.65 mm | n/a |
| New fitter, FLAME 2020 + MICA prior (best) | non-commercial | 1.342 / 0.811 mm | n/a |
| New fitter, FLAME 2023 Open, old embedding | **commercial model**, non-commercial-derived assets | 1.438 / 0.849 mm (EXIF focal trusted) | 0.861 / 0.677 mm (+ multi-view refinement) |
| **New fitter, FLAME 2023 Open, clean-room assets** | **commercial** | **1.205 / 0.659 mm** | **0.680 / 0.496 mm** (+ multi-view refinement) |

**Real single photos.** The 9-subject golden set, mean identity similarity of our render to the input
photo (front / +30° / −30°; InsightFace judge, evaluation only):

| Pipeline | Front | +30° | −30° |
|---|---|---|---|
| old research path (MICA + 68) | 0.762 | 0.663 | 0.706 |
| research (FLAME 2020 + MICA + new fitter) | 0.741 | 0.651 | 0.691 |
| commercial, first cut | 0.731 | 0.634 | 0.668 |
| commercial + EXIF focal trusted | 0.736 | 0.651 | 0.678 |
| **commercial + clean-room assets (shipping config)** | **0.725** | **0.623** | **0.672** |

**Reading.**
- Use FLAME 2023 Open.
- The clean-room assets score slightly lower on this golden set than the old embedding (−0.011 /
  −0.028 / −0.006). Two reasons:
  - The old embedding was built from fits of these same nine subjects, so the set favours it.
  - It carried per-landmark reliability weights (cross-subject spread) that the clean map does not
    have yet.

  On the unbiased ground-truth scan the clean assets are 16–27% more accurate and 5× better in scale.
  The old embedding is non-commercial-derived and cannot ship anyway. Next experiment: reliability
  weights from a clean source (MediaPipe jitter under test-time augmentation on public-domain
  portraits).
- On single photos, a MICA-like identity prior is worth about 0.02–0.03 identity similarity. The
  commercial replacement is a self-trained prior (C5 / Phase 3B).
- With 2–3 photos from one sitting, dense multi-view photo-consistency (Phase 1B) beats every
  single-photo path, including the non-commercial ones, by 40–50% on ground truth.
- Caveat: one ground-truth head. Add more CC-BY scans before generalizing.

**Provenance finding (2026-09-26).** The first commercial cut still used three non-commercial-derived
inputs:
- FLAME 2020 masks from MICA;
- a MediaPipe→FLAME embedding whose anchors came from MICA + FLAME 2020 fits;
- the MICA-distributed UV layout.

The first two are replaced by clean-room builds (C1a), the UV layout by our own (C1b).

## Sources

- FLAME 2023 Open, CC-BY-4.0: https://flame.is.tue.mpg.de/ · https://flame.is.tue.mpg.de/modellicense.html
- InsightFace model licensing: https://github.com/deepinsight/insightface · https://www.insightface.ai/solutions/face-recognition-licensing
- MediaPipe (Apache-2.0): https://github.com/google-ai-edge/mediapipe/blob/master/LICENSE
- MetaHuman / UE EULA AI restriction: https://www.unrealengine.com/eula/mhc · https://www.cgchannel.com/2025/06/you-can-now-sell-metahumans-or-use-them-in-unity-or-godot/
- Triplegangers terms (ML licence required): https://triplegangers.com/terms-of-use · https://triplegangers.com/blog/technology/face-scan-library-facs
- NVIDIA SOMA-X (commercially licensed Triplegangers data): https://huggingface.co/nvidia/SOMA-X
- 3DScanStore licensing: https://www.3dscanstore.com/terms-and-conditions-licensing
- Ten24 free head scan terms: https://www.cgchannel.com/2023/09/download-ten24s-free-hi-res-3d-scan-of-a-female-human-head/
- Lee Perry-Smith scan, CC BY 3.0: https://github.com/keijiro/InfiniteScan · https://www.cgchannel.com/2010/09/infinite-realities-releases-free-photorealistic-head-model/
- Unsplash dataset terms: https://github.com/unsplash/datasets/blob/master/TERMS.md
- Microsoft Face Synthetics (non-commercial): https://github.com/microsoft/FaceSynthetics
- FFHQ-UV and FFHQ-UV-Intrinsics: https://github.com/csbhr/FFHQ-UV · https://github.com/ubisoft/ubisoft-laforge-FFHQ-UV-Intrinsics
