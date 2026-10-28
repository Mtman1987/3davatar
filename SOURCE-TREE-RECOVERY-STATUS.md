# AvatarAce source-tree recovery status

Branch: `work/avatarace-source-tree`

This branch converts the repository's `grok-workspace.zip` into a normal checked-in source tree. It also places the two generic base-body GLBs and the commissioned Neon Gamer model under `public/models/`.

## Important: recovery branch, not merge-ready

- The source extracted from the repository archive is older than the user's latest local Termux workspace at `~/AvatarAce`.
- `src/components/studio/Viewport.tsx` is still the procedural-body implementation. The male/female GLBs are present, but **the GLB body selector and face attachment are not yet wired in**.
- The commissioned file in the repository was `neon-gamer-facial-poc.glb`. It was copied byte-for-byte to `public/models/neon-gamer-facial-v2.glb` to match the app's expected path. Do not edit or re-export its geometry/materials.
- Do not blindly apply the archived `previous-body-integration-patch.zip`: its diff removes existing imported animation playback, live face tracking, and manual morph controls. Preserve existing speech/audio, photo detection, face generation, expressions, textures, and finished-model preview when porting the body loader.
- The root `main` branch has not been changed by this recovery.

## Required next work

1. Compare this source tree with the latest local `~/AvatarAce` before treating it as authoritative.
2. Port the existing finished-model viewer and morph-relative fix, then add male/female body selection and attach the generated face to a measured `HeadAnchor`.
3. Keep the commissioned finished model view-only and keep it separate from the generic body/photo-face flow.
4. Run typecheck/build and verify the actual viewer before opening a merge-ready PR.
