# AvatarAce face reconstruction service

This is a separate Python service; PyTorch, OpenCV, MediaPipe, and FLAME never enter the browser bundle.

## Runtime configuration

- `FACE_RECONSTRUCTION_TOKEN`: required shared secret. The service refuses job and asset requests when unset.
- `FACE_MODEL_DIR`: directory containing the licensed `flame2023_open.pkl` model and the matching clean-room UV/region assets.
- `FACE_PIPELINE_ROOT`: pipeline checkout (defaults to `/opt/humanoid-face`).
- `FACE_WORK_ROOT`: persistent job output directory.
- `FACE_MAX_UPLOAD_BYTES`: combined upload limit (defaults to 12 MiB).

The FLAME model and other model weights are deliberately not included in this repository or image. Mount only model files whose licenses permit the intended use and preserve the attribution in `THIRD_PARTY_NOTICES.md`.

## API

- `GET /health`: deployment/model readiness (does not expose secrets).
- `POST /v1/reconstructions`: multipart `photos` (1–5 JPG/PNG/WebP), authenticated by `X-Face-Reconstruction-Token`; returns a queued job.
- `GET /v1/reconstructions/{id}`: authenticated job status.
- `GET /v1/reconstructions/{id}/assets/{name}`: authenticated allowlisted output download.

Jobs run outside the request lifecycle and are retained under the configured work directory. This initial service exports the pipeline's OBJ and ARKit JSON outputs. It does **not** claim that those outputs are already AvatarAce-compatible GLB geometry or validated morph targets; the viewer adapter and retargeting validation are a separate integration gate.

## Build

Build from the repository root so the Docker context includes the pipeline source:

`docker build -f face-reconstruction-service/Dockerfile -t avatarace-face-service .`
