# AvatarAce face reconstruction service

This separate CPU service runs the repository's actual photo-to-head pipeline. PyTorch, OpenCV, MediaPipe, and FLAME are not shipped to the browser.

## Runtime configuration

- `FACE_RECONSTRUCTION_TOKEN`: required shared secret used by the app's server-side proxy and this service.
- `FACE_MODEL_DIR`: mounted directory containing the licensed `flame2023_open.pkl`, `region_masks_open.npz`, `uv_layout_open.npz`, and `mediapipe_embedding_open.npz` clean-room support assets.
- `FACE_PIPELINE_ROOT`: pipeline checkout (defaults to `/opt/humanoid-face`).
- `FACE_WORK_ROOT`: persistent job output directory.
- `FACE_MAX_UPLOAD_BYTES`: combined photo upload limit (defaults to 12 MiB).

The model files are deliberately excluded from the repository and container image. Mount only model files whose licenses permit the intended use and preserve required attribution in `THIRD_PARTY_NOTICES.md`.

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
