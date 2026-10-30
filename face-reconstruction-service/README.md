# AvatarAce face reconstruction service

This separate CPU service runs the repository's actual photo-to-head pipeline. PyTorch, OpenCV, MediaPipe, and FLAME are not shipped to the browser.

## Local development (Termux / desktop)

The normal `npm run dev` command starts both Vite and the local FastAPI adapter. It generates a per-run local token and passes it only to the server processes; the browser never receives it. No Fly or Oracle service is involved in local development.

The launcher always runs reconstruction source code from this AvatarAce checkout. It may reuse the existing sibling `../Humanoid-Face-3D/.venv` Python environment on Termux to avoid reinstalling the heavy MediaPipe/PyTorch stack, and may reuse model-only assets from that sibling folder when they are not present in AvatarAce. No Python source files are loaded from the sibling checkout. `FACE_PIPELINE_ROOT` is an explicit advanced override; normal startup sets it to AvatarAce. `FACE_PYTHON_BIN`, `FACE_MODEL_DIR`, and `FACE_MEDIAPIPE_MODEL_DIR` can also be overridden.

Install the adapter's small web-server dependencies into the Python environment selected by the launcher if they are not already installed:

```bash
FACE_PYTHON_BIN=../Humanoid-Face-3D/.venv/bin/python
"$FACE_PYTHON_BIN" -m pip install -r face-reconstruction-service/requirements.txt
```

On Termux, run those commands from the AvatarAce repository root. If the shell does not retain the assignment, use the explicit path on the pip command. The pipeline also needs the documented FLAME 2023 Open model and support assets in `data/flame_model/`, plus `models_cache/mediapipe/face_landmarker.task` inside the selected pipeline checkout. The local health endpoint lists each missing asset before photo submission. Generated job files are stored under `.local/face-reconstruction-jobs/` and are git-ignored.

## Runtime configuration

- `FACE_RECONSTRUCTION_TOKEN`: required shared secret used by the app's server-side proxy and this service.
- `FACE_MODEL_DIR`: mounted directory containing the licensed `flame2023_open.pkl`, `region_masks_open.npz`, `uv_layout_open.npz`, and `mediapipe_embedding_open.npz` clean-room support assets.
- `FACE_PIPELINE_ROOT`: pipeline source root (AvatarAce sets this to its own checkout; the container sets `/opt/humanoid-face`).
- `FACE_MEDIAPIPE_MODEL_DIR`: directory containing the public MediaPipe face-landmarker and selfie-segmentation task files. The local launcher can reuse these model-only files from the sibling checkout while executing all Python source from AvatarAce.
- `FACE_WORK_ROOT`: persistent job output directory.
- `FACE_MAX_UPLOAD_BYTES`: combined photo upload limit (defaults to 12 MiB).
- `FACE_RECONSTRUCTION_DETAIL`: Stage 3 detail level passed to the proven pipeline runner (defaults to `0`, the verified Termux command; set higher values to request additional sculpt detail).

The licensed FLAME 2023 Open model and clean-room support assets are deliberately excluded from the repository and container image; mount them read-only at `/models`. The Docker build installs the CPU PyTorch runtime and downloads the same public MediaPipe Face Landmarker and selfie-segmentation task assets used by the verified Termux flow into the pipeline's `models_cache/mediapipe` directory. No InsightFace/MICA research-only models or Blender binary are required for the commercial MediaPipe/mean-identity path.

The AvatarAce web app also needs these server-only environment variables:

- `FACE_RECONSTRUCTION_URL`: service origin, for example `https://face-service.example.com`.
- `FACE_RECONSTRUCTION_TOKEN`: same secret configured on the service.

Never expose the service token through a `VITE_*` variable or browser code. The app's server functions submit photos, poll job state, and proxy generated assets while keeping the token server-side.

## API

- `GET /health`: service and mounted FLAME readiness.
- `POST /v1/reconstructions`: authenticated multipart `photos` upload (1–5 JPG/PNG/WebP files); returns a queued job.
- `GET /v1/reconstructions/{id}`: authenticated job status.
- `GET /v1/reconstructions/{id}/assets/{name}`: authenticated generated-file download. The app proxies these requests server-side.

On success, the service writes `avatarace_head_manifest.json` beside the original Stage 5 outputs. It references the neutral OBJ, ARKit-52 delta JSON, five-joint armature JSON, and available PBR/detail maps by browser-safe relative filenames. The original Stage 5 manifest is retained for diagnosis.

The browser adapter parses OBJ while preserving source vertex correspondence across UV seams, expands the morph deltas and skin weights against those original vertex indices, rebuilds the neck/head/jaw/eye rig, and loads available albedo, normal, displacement, roughness, and cavity maps. It attaches the resulting native group to the body's head bone. It does not convert the head to a fixed body mesh or discard the morph data.

## Build

Build from the repository root so the container context includes the pipeline source:

`docker build -f face-reconstruction-service/Dockerfile -t avatarace-face-service .`

Run with a persistent work volume and a read-only model volume mounted at `/models`. The health endpoint reports whether the expected FLAME model is present.
