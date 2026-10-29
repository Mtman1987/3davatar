# Connected photo-face handoff — 2026-10-29

Branch: `fix/connected-photo-face`, based on `main` at `9ef880d`.

## Saved implementation

- `src/lib/avatar/connected-face.ts` samples the existing photo-generated face, transfers bounded depth and 52 generated expression deltas onto eligible original skinned vertices, and bakes its texture into original mesh UVs.
- `src/components/studio/Viewport.tsx` replaces the disconnected photo-face overlay with that reversible binding. No runtime face cuts, extra face objects, reindexing, bone reparenting, or original binary-asset edits.
- Existing eye/lip detail primitives participate where head weights and face overlap allow it. Authored normals are retained across UV seams.
- New photo uploads and fit changes restore the previous binding before applying the new source. The source is the existing `build-face.ts` / MediaPipe pipeline, not an invented replacement face.
- Face panel now frames the head; orbit state is synchronized with fitted cameras and desktop wheel zoom works. Expression preset buttons now drive morph weights.
- Original animation clips are included in GLB exports. The commissioned-model route is excluded from connected-head modification.

## What this is / is not

This implementation uses the original connected head/body topology. It **transfers photo data**, rather than welding the photo-generated mesh's triangles into the body. Relief is conservatively blended onto the original curved head. It does not guarantee the exact reconstructed face's proportions, an authored facial rig, realistic eyelid/tongue motion, or production likeness.

The user accepted transfer as the current method after it was explained, and asked that all work be saved to GitHub. Do not describe this as literal stitching or a finished production face.

## Verified so far

- `npm run typecheck` passed.
- `npm run build` passed, with bundler/chunk warnings and no DATABASE_URL (migration script skips as designed).
- `node --test scripts/connected-face.test.mjs`: 5/5 passed. Tests use actual detector output from the repository's existing sample portrait, compressed under `scripts/fixtures/`.
- Tests cover both bodies, unchanged indices/UVs/normals/skin data/object count/joints, untouched body below the head, generated jaw/blink deltas, head-bone movement, reversible cleanup, repeated fits, and rejection of missing head rigs.
- The first browser render showed that the separate face object was removed. It also exposed excessive depth/forehead distortion and untextured existing eye/lip meshes. Later changes address these but still require fresh visual inspection.

## Next verification gate

1. Start the existing app with `npm run dev` and run `node scripts/connected-face-browser.mjs` (Chrome path is configurable with CHROME_PATH; APP_URL defaults to the dev server).
2. Inspect fresh front/profile/smile/blink screenshots for both bodies. Do not accept untouched-looking eyes/lips, forehead shelves, severe texture seams, or poor likeness.
3. The browser script is saved but has **not yet been run end-to-end**. It exercises export, save/reopen, repeated sample generation, and mobile layout; fix any script/app failures rather than treating its existence as verification.
4. Reimport exported GLBs and check texture orientation, rig, and morph data; inspect the rendered export, not just its JSON.
5. Run the full existing `npm test` suite and GitHub CI. The five focused tests are not a substitute.
6. Keep the branch isolated until visuals/export pass. Do not merge main automatically.

Original GLBs remain unchanged. Existing install reports five dependency advisories; no broad dependency upgrades were attempted in this geometry-focused work.