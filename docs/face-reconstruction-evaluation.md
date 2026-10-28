# Face reconstruction evaluation pipeline

## Goal

Compare the current AvatarAce face builder, the MediaPipe Face Mesh demo, and a DECA reconstruction using the same source portrait without changing the production viewer or commissioned model.

## Current browser pipeline

- `src/lib/avatar/detect.ts` loads the existing `@mediapipe/tasks-vision` Face Landmarker.
- The detector returns facial landmarks and blendshape categories. This branch also requests the facial transformation matrix and retains the result metadata with the cached standard/detail face builds.
- `src/lib/avatar/mediapipe-topology.ts` contains the attributed canonical MediaPipe topology (468 vertices / 898 triangles).
- `src/lib/avatar/build-face.ts` uses those authored triangles for full Face Landmarker results instead of generating new triangles with 2D Delaunay. Photo-derived UVs and the existing ARKit morph-target generation remain in place.
- The existing male/female body viewer remains the integration target; the comparison harness must not replace its body rig, animations, or morph targets.

## Same-image comparison

Use one identical, unmodified portrait file for each candidate. Prefer a front-facing, evenly lit photo with the full chin, forehead, and both cheeks visible. Record the exact file name and dimensions; do not let each demo silently crop a different source before comparison.

Candidates:
1. **AvatarAce current pipeline** — upload the source through the app's Face panel and inspect both Standard and Detail.
2. **MediaPipe Face Mesh demo** — https://huggingface.co/spaces/hysts/mediapipe-face-mesh
3. **3D face reconstruction demo** — https://huggingface.co/spaces/Prashanthsrn/3d_face_reconstruction
4. **DECA** — https://github.com/yfeng95/DECA (isolated research experiment only; see licensing note below).

The Hugging Face Spaces are external demos, not APIs we control. Until an explicit, stable inference endpoint is verified, upload the same local file manually to each demo rather than assuming the browser can send it to them programmatically.

## Score each output

Use the same checklist for every candidate:
- Identity resemblance: eyes, nose, mouth, jaw, and overall likeness.
- Proportions: forehead-to-eye distance, nose-to-mouth distance, mouth-to-chin distance, and total face height/width.
- 3D fit: cheeks, nose projection, jaw/chin volume, and whether it behaves like a head instead of a flat mask.
- Texture: correct face crop, natural skin detail, no severe stretching or seams.
- Integration: can the result be fitted to both generic male and female base heads without altering their shared skeleton?
- Runtime and dependency cost: browser vs service, model size, startup time, memory, and mobile viability.

Keep screenshots and results side by side. Do not select a winner from a single face only; repeat with several different face shapes, skin tones, and image aspect ratios.

## MediaPipe output retained by this branch

The pipeline now retains:
- all detected 3D face landmarks (normally 478)
- face blendshape scores (normally 52)
- the facial transformation matrix and its dimensions
- source image dimensions and aspect ratio
- the canonical 468-point / 898-triangle surface topology used to build the mesh

This is diagnostic data for the fit/evaluation pipeline. It is deliberately retained separately from the rendered mesh so we can validate the coordinate conventions before using the transform to alter placement or orientation.

## DECA license gate

The upstream DECA repository states that its code and model are licensed for **non-commercial scientific research purposes**. Keep DECA isolated in a test-only branch and do not bundle its weights, deploy it as a product feature, or ship its output as a commercial workflow unless the license holder grants the necessary rights. See https://deca.is.tue.mpg.de/license.html and https://github.com/yfeng95/DECA.

## Acceptance gate before merging

- Existing face upload still succeeds and creates Standard and Detail meshes.
- Existing 52 ARKit expression mapping and morph targets are preserved.
- Both generic base bodies can be selected and tested.
- The commissioned model path remains unchanged.
- Type-check/build and a visual mobile-browser test pass.
- No DECA code, weights, or runtime dependency enter the production path in this pipeline PR.
