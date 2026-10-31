# START HERE — generated-face eyes, eyelids and movement

Updated: 2026-10-31. This is the current handoff for the user's photo/generated-head defects.

## Status — do not call this finished

The repair was developed against main `a7ded4fcfdbbc0f9cb935a0bdb80665e2d2f4e21`. **This documentation commit does not apply the implementation to main.** The candidate implementation is preserved as a downloadable, SHA-256-verifiable git patch below. Apply it on a fresh repair branch, review it, and validate against the user's actual generated head before merging.

The user's exact OBJ, textures, morph JSON, rig JSON and facial-landmark JSON are not present in this sandbox. Synthetic tests passed; they are not acceptance of the real avatar. No Blender/Faceit/MetaHuman conversion or full reconstruction was performed.

## User's actual complaint

- The eyes DO blink. The defect is still visible while the eyes are OPEN.
- Sclera/eye whites are much too bright, giving a creepy, wide/staring appearance.
- Eyelids are too pale and too large; conspicuous lid geometry remains visible around open eyes.
- Movements are also broken. The user has not isolated every affected motion yet.
- Screenshot: generated/photo-face editor, bald textured male head, localhost:8080, Face tab, Eye depth 0.00, Expression 1.04, Blink speed 0.28. This is not the finished neon-gamer commission.
- Earlier handoff also called out face-perimeter/chin gaps. Keep that issue open separately; moving the whole face backward or changing blink speed is not an adequate fix.

## Recover the candidate code

Patch: https://storage.googleapis.com/runable-templates/cli-uploads%2FLO79DpYWJvJw0tEXFhCRN4xVL2WwJmBh%2FMfypW8xLSzwTKX6WjGkEq%2F3davatar-eye-motion.patch

Patch SHA-256: `8119610fbe547216784de2b5dd79218f4a4e4588d2ba6e0937d63240130846f5`

Patch size: 44,905 bytes. Seven source/test files; no licensed models, photos, credentials, dependencies, or commissioned GLB changes. The patch is linked here rather than stored as an applied source change.

```sh
git fetch origin
git switch -c fix/contour-eyes-and-stable-motion origin/main
curl --fail --location 'https://storage.googleapis.com/runable-templates/cli-uploads%2FLO79DpYWJvJw0tEXFhCRN4xVL2WwJmBh%2FMfypW8xLSzwTKX6WjGkEq%2F3davatar-eye-motion.patch' -o /tmp/3davatar-eye-motion.patch
printf '%s  %s\n' '8119610fbe547216784de2b5dd79218f4a4e4588d2ba6e0937d63240130846f5' '/tmp/3davatar-eye-motion.patch' | sha256sum --check
git apply --check /tmp/3davatar-eye-motion.patch
git apply /tmp/3davatar-eye-motion.patch
npm ci --ignore-scripts
node --experimental-strip-types --test src/lib/avatar/generated-eye.test.ts
npm run typecheck
npm run build
```

If main has moved and apply-check fails, manually port the seven files; do not force the patch. Local work was on `fix/contour-eyes-and-stable-motion-2026-10-31` under `/home/user/3davatar`, but that branch was not pushed. Use the durable patch link, not a presumed shared sandbox.

## Confirmed source problems and candidate changes

1. `src/lib/avatar/generated-anatomy.ts` made flattened full spheres larger than the measured eye opening. The candidate replaces them with curved surfaces bounded by the exported MediaPipe lash contour.
2. The old upper lid is a flat patch with travel/height 1.45 times the eye aperture, visibly covering the brow area even at rest. New lid strips have narrow neutral margins, fixed canthi, and upper/lower edges meeting at full closure.
3. Old gaze rotates the entire eye group around the HEAD origin, including eyelids. New gaze translates a shaded iris/pupil inside each fixed socket and mirrors paired anatomical In/Out inputs.
4. Sclera shading is subdued and socket-shadowed; iris/pupil share the same surface so they cannot disappear inside a white globe or float in front of lids.
5. New fitted lids use the generated head's existing albedo map with nearest-surface barycentric UV sampling OUTSIDE the lash contour, avoiding source-photo eye whites. Textured lids must keep material tint white; untextured lids inherit sampled skin tone.
6. Native FLAME/textured eye surfaces could occlude the replacement. The candidate opens measured apertures with a head-material shader, limited in depth to avoid punching through the back of the skull. Geometry, skinning and morph buffers are retained.
7. `Viewport.tsx`: autonomous idle expressions no longer override explicit presets. Manual morphs remain highest priority.
8. `generated-motion.ts`: tracked head offsets preserve bind quaternion, are bounded and slerp-smoothed. Jaw movement now preserves its bind quaternion instead of overwriting rotation.x.
9. `live-face-tracker.ts`: rejects non-finite samples and expires stale tracking after 300 ms instead of retaining a frozen last face.
10. Animation inputs and delta are sanitized; eye-depth adjustment retains each eye's measured base Z instead of moving its origin to zero.

## Files in patch

- New: `src/lib/avatar/generated-eye.ts`
- New: `src/lib/avatar/generated-eye.test.ts`
- New: `src/lib/avatar/generated-motion.ts`
- Updated: `src/lib/avatar/generated-anatomy.ts`
- Updated: `src/lib/avatar/generated-head.ts`
- Updated: `src/lib/avatar/live-face-tracker.ts`
- Updated: `src/components/studio/Viewport.tsx`

## Verification already done

- Seven targeted regression tests PASS: neutral socket bounds/thin lids; full closure and reopen; paired gaze without moving lids; manual/live blink precedence; skin UV/material inheritance; bind pose, depth offsets and NaN handling; bounded/smooth head pose.
- Final candidate `npm run typecheck` PASS.
- Final candidate `npm run build` PASS. Database migration skipped because DATABASE_URL is unset; this is unrelated to facial rendering.
- Chrome/SwiftShader WebGL fixture compiled and rendered with zero browser errors. Neutral, gaze, half-blink, closed, reopened and turned states were exercised. Both replacement eye surfaces hide at full closure and reappear on reopen.
- App entry screen rendered on desktop and 390x844 mobile with zero browser errors.
- Full `npm test` is NOT green: script stage reports 181 passed / 16 failed. Failures are in unchanged template tests involving missing `.grok` skill/app-env files and share-card expectations. The chained TypeScript stage is consequently skipped. Do not report the complete suite as passed.
- `npm ci` reports 19 dependency vulnerabilities (2 low, 15 moderate, 1 high, 1 critical). No audit-fix or dependency upgrade was attempted.

## Required next steps / acceptance gate

1. Recover/apply the patch on a branch. Get the user's ACTUAL generated-head manifest and all referenced OBJ, maps, morphs, armature and 478-point landmarks. These are the essential missing inputs, not another screenshot of sliders. Do not expose private photos or face assets publicly.
2. Reproduce the open-eye appearance at the user's saved fit before/after under the same camera and lighting. Test both male and female generated heads and both Z conventions. Validate UV matching on the real albedo.
3. Check eye channel semantics: existing code calls ring 33/133 Left while common MediaPipe/FLAME conventions can label it anatomical Right. Paired-gaze tests pass, but unilateral blink/look must be checked against the native morph rig and mirrored camera. Do not assume labels agree.
4. The head-aperture shader uses neutral/rest-space contours. Verify socket edges remain aligned during strong native head morphs, jaw motion, squint, wide and head turns. Check displacement, near/far angles and both face sides. Do not mask a gap by disabling depth testing globally.
5. Runtime eye/iris/aperture behavior uses `onBeforeCompile` shaders. GLTF export does NOT preserve those custom shaders automatically. Do not promise corrected downloaded GLB eyes until export parity is explicitly implemented/tested.
6. Check full blink closure, natural reopen, low/bright lighting, restrained gaze, manual controls, voice-driven articulation and live tracking loss/reacquisition. Check lid stretching over actual texture.
7. Body animation faults are NOT comprehensively repaired or verified by this pass. Test every existing animation clip, head/neck attachment, jaw, saved reopen and audio/tracking together. Record exact remaining failures rather than claiming all movements fixed.
8. Keep face-perimeter/chin seam work separate; this patch does not close those gaps.
9. If the subject-specific geometry cannot pass these checks, use the existing FLAME/MediaPipe pipeline and Blender/Faceit to repair a real rig/source export rather than stacking more floating primitives. Do not buy tools or regenerate/substitute the commissioned asset without approval.
10. Commit reviewed code, open a PR, run CI, and update this handoff with PR/commit and real-avatar visual results.

## Existing pipeline and protected assets

Use the existing AvatarAce/3davatar pipeline, not a replacement app. `npm run dev` runs the local Python reconstruction adapter plus Vite. The launcher can reuse the sibling `Humanoid-Face-3D/.venv` and model-only assets while executing this repo's Python source. See `face-reconstruction-service/README.md`.

Real reconstruction could not run here: licensed `flame2023_open.pkl`, `region_masks_open.npz`, `uv_layout_open.npz`, `mediapipe_embedding_open.npz`, plus the MediaPipe task assets are missing. Do not install fabricated substitutes or claim a real photo reconstruction was performed.

Do not alter `public/models/neon-gamer-facial-v2.glb`. Its separately documented 43-target / missing-nine limitation in `SOURCE-TREE-RECOVERY-STATUS.md` is not a diagnosis of this photo-head bug. Preserve original body animations and existing save data.
