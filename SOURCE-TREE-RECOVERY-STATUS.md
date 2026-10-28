# AvatarAce integration and pre-test status

## Current integrated baseline

This work is based on `main` at commit `6b8b95d62473f9635b2d6c9bba1a5139bc241559`, which already contains the real GLB viewer, finished-commission selection, facial morph preview controls, and embedded animation playback. This branch adds the remaining known application fixes before a user test.

## Finished-model rules

- The commissioned asset is `public/models/neon-gamer-facial-v2.glb` (SHA-256 `ab8684c30f9fc5110a38b73a9ed88ebac373d635867ae0b2f03a45f6d51028ba`). Do not regenerate, re-export, substitute, or otherwise alter it.
- The generic male and female base models are separate assets under `public/models/`.
- The finished commission is a separate, view-only route; it must not be replaced by the generic base-body/photo-face flow.
- Saved finished commissions now retain their model URL/name and reopen into the finished-model panel. Legacy/damaged save records are normalized and invalid saved photos are handled without an uncaught rejection.
- GLB download progress is surfaced in the studio; selected states are announced with `aria-pressed`.

## Known asset limitation — not silently papered over

The commissioned GLB has 43 facial morph targets. The expected nine controls that are absent are the eight `eyeLook*` targets and `tongueOut`. Those targets are not present in the source asset, so the UI cannot create them. Do not claim a 52-target face, and do not modify the commissioned GLB to fabricate them. Resolving this requires an authoritative rigged source asset/export containing those targets or an explicit decision to accept the commission as delivered. This is still an open limitation and must be reported before the user is asked to test if those controls are required.

## Cleanup

Tracked Vercel build output, root ZIP artifacts, and duplicate/root GLB copies were removed from this branch. `.gitignore` now excludes build outputs and those root-level artifacts. The runtime assets remain at their intended locations:

- `public/models/neon-gamer-facial-v2.glb`
- `public/models/male-base-mesh-base_male.glb`
- `public/models/female-base-mesh-base_female.glb`

## Explicitly deferred

- Outfits remain disabled for the new base bodies until real clothing meshes are available.
- Multiplayer `p2p.ts` still requires a signaling relay.
- `build-body.ts` is legacy unused procedural-body code; it is not a source for the finished commission.
- The IndexedDB database remains named `streamweaver` to avoid orphaning existing saves.

## Validation gate

Before this branch is offered as a test download, GitHub Actions must pass asset verification, dependency installation, typecheck, tests, and production build. A successful build does not replace visual verification of the commissioned model and save/reopen behavior.
