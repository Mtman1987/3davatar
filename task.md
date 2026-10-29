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
- [ ] Bind photo surface to original head vertices with feathered displacement and morph transfer; bake photo into original UV atlas.
- [ ] Replace viewer overlay with reversible connected-head binding; keep commissioned path excluded.
- [ ] Test topology, rig, untouched outside region, expressions, cleanup, both bodies, save/reopen, and export/reimport.
- [ ] Run typecheck, tests, build, browser QA; push verified checkpoint and deliver code/evidence.

## Constraints
No new framework/scaffold or Runable deployment: this is the user's existing repository. No destructive cuts, extra floating meshes, fabricated completed rig claims, or modifications to original binary assets.