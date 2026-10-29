 # Connected photo face — working handoff

## Goal
Replace the disconnected photo-face overlay with photo shape/texture/expression transfer onto the existing connected generic body/head surface. User authorizes a dedicated remote branch and asks for frequent repository checkpoints. Do not merge main or alter commissioned/original GLBs.

## Baseline
- main: 9ef880d. Working branch: fix/connected-photo-face.
- Latest experiment/face-cut-candidates: b5c83a4. Its offline deformation preserves topology, but its viewer still adds AvatarAcePhotoFace and trims underlying polygons.
- Both generic models have an exact head bone and the main skin primitive named base (63,750 UV-split vertices); original meshes have no facial morph targets.
- GitHub token stored outside the repository. Never commit credentials.

## Plan / status
- [x] Inspect existing branches, assets, and handoff.
- [x] Install existing locked dependencies (npm reports 5 existing security advisories; no dependency upgrades in this scope).
- [x] Bind photo surface to original head vertices with feathered displacement and morph transfer; bake photo into original UV atlas.
- [x] Replace viewer overlay with reversible connected-head binding; keep commissioned path excluded.
- [x] Five focused tests pass: male/female topology, UVs, normals, skin weights, joint transforms, head turns, generated morph presence, cleanup/repeated fits, missing-rig rejection.
- [x] Typecheck and production build pass. Build has existing bundler warnings.
- [ ] Run the saved scripts/connected-face-browser.mjs end-to-end; validate latest eye/lip texture fix, expressions, save/reopen, new-photo replacement, and export/reimport. Script has not yet been run end-to-end.
- [ ] Run complete legacy npm test suite and CI. Do not claim it passed from the five focused tests.

## Latest handoff
- Remote branch: fix/connected-photo-face. All implementation checkpoints are pushed.
- First visual render proved overlay removal but exposed a forehead shelf and unpainted eye/lip details. Subsequent code reduces relief to a bounded sculpt on the original curved head, retains authored normals, and binds eligible existing eye/lip primitives. These latest visual changes still need screenshot inspection.
- Every new photo uses the existing build-face.ts / detector output and restores/replaces the previous binding. No AI-generated replacement face was introduced.
- Important: this is photo-data transfer onto original skin, NOT literal stitching/welding of the photo-generated mesh triangles. Photo depth is conservatively blended; exact reconstructed-face topology/likeness is not guaranteed.
- No main merge and no original GLB changes. Prototype is NOT approved for production.

## Constraints
No new framework/scaffold or Runable deployment: this is the user's existing repository. No destructive cuts, extra floating meshes, fabricated completed rig claims, or modifications to original binary assets.