# START HERE — current repair branch and remaining acceptance

## GitHub update — 2026-11-02

Authentication is resolved. Branch `fix/contour-eyes-and-stable-motion` has been pushed to `Mtman1987/3davatar`. Pull request **#44** is open: https://github.com/Mtman1987/3davatar/pull/44. Implementation commit remains `cee2a6e`; `4673e84` recorded the earlier blocker, which is now historical. This handoff update is committed on the same PR branch. Main has NOT been merged or changed by this repair.

Re-ran the 14 TypeScript eye/morph tests, 12 Python service tests and typecheck after authentication: all pass. Final production build previously passed on unchanged implementation. GitHub CI must be checked on the latest PR head; local passing tests are not a claim that remote CI has completed. Do not merge until remaining real-head acceptance below is addressed. The token is stored outside the repository and is not included in patches, commits or archives.

## Latest continuation — 2026-10-31

This section supersedes the archived candidate-only status below. The original SHA-256-verified patch has now been applied, with additional reviewed source changes, on branch `fix/contour-eyes-and-stable-motion`, based on main `be4c37ba950361488c5e4c2a67390d96e5bdbd96`. Implementation commit: `cee2a6e`. Main and protected model files are unchanged. The earlier authentication failure has been resolved; see PR #44 above. The downloadable git patch/source archive also preserves the work.

### User clarification and actual supplied files

The user reports that head tilt/turn and eyes respond, but facial blendshapes do not. They do not know where the native reconstruction files are stored. Do not repeatedly ask them to locate a website or JSON files: the repository defines the fetch path.

They supplied `first-face.glb`, a turntable JPG, overlay JPG and skin PNG privately. Binary GLB inspection confirmed generator `trimesh`, one textured mesh named `head_mesh.obj`, zero morph targets, zero skins and zero animation clips. This static file cannot perform expressions. It is NOT proven to be the same asset the generated-head editor is loading. Do not fabricate missing rig data or publicly upload those private attachments. They are not included in this branch or source archive.

### Fetch/storage path, traced from source

- `gallery.ts`: browser IndexedDB database `streamweaver`, store `avatars`, stores generated-head job reference and fit; not the native mesh bundle.
- `generated-head.ts` parses `/v1/reconstructions/<32-hex-job-id>/assets/<name>` from the reference URL. `avatarace.invalid` is a placeholder, NOT a storage website.
- `reconstruction.ts` proxies through server-only `FACE_RECONSTRUCTION_URL` and `FACE_RECONSTRUCTION_TOKEN`.
- Normal `scripts/dev-local.mjs` launches the local service at `127.0.0.1:8001` and sets `FACE_WORK_ROOT` to repo `.local/face-reconstruction-jobs`. Hosted runtime can override the service URL/work root; no production origin or token is committed.

### Additional implementation in this continuation

1. `job_storage.py` and service integration: atomic disk job-state writes; legacy completed-job recovery after service restart; interrupted jobs become failed instead of polling forever. Recovery requires the manifest's native assets to exist. Job IDs, output paths, asset names and symlinks are checked; authentication remains required.
2. Private head bundle: authenticated `assets/avatarace_head_bundle.zip` returns only manifest-referenced mesh/morph/rig/landmark/map files, not inputs, logs or credentials. 96 MiB uncompressed limit; no-store responses. Save panel exposes **Download head repair package** for the active generated head.
3. `morph-driver.ts`: native generated morphs reset each frame before sparse live/manual/audio inputs; finite clamped weights; authored photo baseline preserved; unrelated commissioned/body animation weights retained. Diagnostics distinguish absent channels, all-zero buffers and partially inactive targets.
4. Studio: persistent rig warning and per-channel sliders in Face tab, with **Release controls** to stop overriding tracking. Tracking samples with both fields null no longer suppress idle expressions.
5. GLB exporter now passes the existing animation clips instead of silently omitting them. Export/reimport acceptance remains pending; custom eye/aperture shaders are still NOT portable to GLB. Save text no longer promises shader export parity.
6. `test:face`, `test:face-service` and mandatory targeted test steps added to existing integrated-candidate CI. No JS dependency upgrades or licensed asset substitutions.

### Verification in this continuation

- 14 eye/morph tests passed, including independently driving all 52 channels on a synthetic morph mesh, sparse-frame reset, NaN handling and preserving other model animation weights.
- 12 Python service tests passed: legacy recovery, atomic state, interruption, corrupt state, missing assets, authentication, bounded private ZIP, traversal/symlink rejection and package limit. Uses minimal adapter deps only; no FLAME reconstruction.
- Final typecheck and production build passed INCLUDING the animation-export option change. DATABASE_URL unset; migration skipped.
- Actual Chrome/SwiftShader fixture compiled eye shaders and verified closure/reopen and native morph vertex movement/reset, with no fixture page errors.
- Desktop 1280x800 and mobile 390x844 app entry rendered with zero console/page errors. Uploaded static GLB loaded through a local test-only browser interception and displayed the new missing-blendshape warning, with zero page errors. Those checks do NOT constitute real rig acceptance.
- Full `npm test`: 181 passed / 16 failed in unchanged template/branding/app-env script tests; chained TS tests skipped. 19 existing npm vulnerabilities remain.
- Protected commission SHA-256 remains `ab8684c30f9fc5110a38b73a9ed88ebac373d635867ae0b2f03a45f6d51028ba`.

### Next agent

Read this section, inspect PR #44 and its latest CI results, and run the targeted gates. Once the user runs the updated source, use **Save → Download head repair package** to obtain the real native head from its service without manual file hunting. If unavailable, the UI now reports the actual service error; verify the service environment and on-disk job output rather than inventing a storage website.

Still open: actual subject morph amplitudes/channel semantics; saved fit; male/female and both Z conventions; strong morph/aperture alignment; head/body/jaw/audio/tracking combinations; complete GLB eye/aperture and animation export/reimport parity; face-perimeter/chin seams; production-browser verification. Do not claim the user's blendshapes or all movements fixed until the real native package passes acceptance.

---

## Archived original handoff — candidate before this continuation

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
