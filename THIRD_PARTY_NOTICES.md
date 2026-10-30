# Third-party notices

This project uses the following third-party assets and software. Product builds that ship
generated heads must reproduce the **attribution** entries below, for example in the credits or the
About screen. Licence status is also tracked in `DOCS/07_commercial_licensing.md`.

## Shipped with or baked into generated assets

| Component | Use | Licence | Attribution / obligations |
|---|---|---|---|
| **FLAME 2023 Open** (`data/flame_model/flame2023_open.pkl`), Max Planck Institute for Intelligent Systems | head model: template, shape and expression space, topology | **CC BY 4.0** | "FLAME 2023 Open model © Max Planck Institute for Intelligent Systems, used under CC BY 4.0 (https://flame.is.tue.mpg.de/modellicense.html)." Cite *T. Li, T. Bolkart, M. J. Black, H. Li, J. Romero, "Learning a model of facial shape and expression from 4D scans", ACM TOG (Proc. SIGGRAPH Asia) 2017* in scientific publications. |
| **MediaPipe** Face Landmarker, selfie multiclass segmenter, canonical face mesh (Google) | landmarks, skin parsing, landmark→FLAME correspondence | **Apache-2.0** | Keep the Apache-2.0 licence text and NOTICE when redistributing MediaPipe or its models. |
| Our clean-room assets: `mediapipe_embedding_open.npz`, `region_masks_open.npz` (`scripts/build_clean_assets.py`), UV layout `uv_layout_open.npz` (`scripts/build_clean_uv.py`) | landmark embedding, region masks, texture space | derived from FLAME 2023 Open (CC BY 4.0) and MediaPipe (Apache-2.0) | FLAME attribution above. |
| Microsoft **DAViD** surface-normal model (`models_cache/david/normal-model-vitb16_384.onnx`, runtime in `vendor/david_runtime/`) | per-pixel normals (`src/stage0_preprocess/normals.py`): used in character mode (alpha cut-outs); off for ordinary photos | code and weights **MIT**; trained on SynthHuman (CDLA-Permissive-2.0) | Keep the MIT licence text (`vendor/david_runtime/LICENSE-MIT.txt`). |

## Used for evaluation only (not shipped)

| Component | Use | Licence | Notes |
|---|---|---|---|
| **Lee Perry-Smith head scan** (Infinite Realities, via Triplegangers) | ground-truth benchmark renders | **CC BY 3.0** | "Based on a work at www.triplegangers.com", licensed CC BY 3.0 (`data/external/lee_perry_smith/LeePerrySmith_License.txt`). |
| InsightFace `buffalo_l` models | identity judge (golden-set metric) | models: non-commercial research | Evaluation only; never in the product (DOCS/07 C4). |
| FLAME vertex masks from the MICA repository (`vendor/MICA/.../FLAME_masks.pkl`) | fixed evaluation region in `evaluation/gt_scan_eval.py`; research config | MICA licence: non-commercial research | Evaluation and research config only. |
| MICA, FLAME 2020 (`configs/research.yaml`) | research comparison path | non-commercial research | Never shipped (AGENTS.md rule 7). |

## Resolved licence item: UV layout (C1b, 2026-09-26)

The commercial config uses our own UV layout (`data/flame_model/uv_layout_open.npz`, built from FLAME
2023 Open geometry and our clean-room masks by `scripts/build_clean_uv.py`). The FLAME texture space
distributed with MICA (`data/flame_model/head_template.obj`) is now used only by `configs/research.yaml`
and by `tests/test_subdivision.py`; treat it as non-commercial.

## Build and runtime software (not redistributed with assets)

PyTorch (BSD-3-Clause), NumPy / SciPy (BSD-3-Clause), OpenCV (Apache-2.0), trimesh (MIT), Pillow
(HPND), PyYAML (MIT), Blender (GPL-3.0; used as an external tool, and its output is not GPL-encumbered),
onnxruntime (MIT).
