#!/usr/bin/env python3
"""Restore AvatarAce's complete co-host editor on top of the body/viewer recovery."""
from pathlib import Path
import sys

root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path("recovered-workspace")

def edit(path, old, new, count=1):
    p = root / path
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"Expected source block missing in {path}: {old[:100]!r}")
    p.write_text(s.replace(old, new, count))

# Keep the existing male/female rigged GLBs and separate finished-model viewer,
# while restoring the styling and co-host motion controls in the editor.
edit("src/lib/avatar/constants.ts",
'export type Panel = "body" | "look" | "face" | "voice" | "save";',
'''export type MotionId = "idle" | "wave" | "cheer" | "clap" | "laugh" | "talk" | "think" | "listen";
export const MOTIONS: { id: MotionId; label: string; note: string }[] = [
  { id: "idle", label: "Idle", note: "Subtle standing idle" },
  { id: "wave", label: "Wave", note: "Greet your chat" },
  { id: "cheer", label: "Cheer", note: "Hype and celebration" },
  { id: "clap", label: "Clap", note: "Applause" },
  { id: "laugh", label: "Laugh", note: "Laughing reaction" },
  { id: "talk", label: "Talk", note: "Conversational gestures" },
  { id: "think", label: "Think", note: "Thinking / skeptical" },
  { id: "listen", label: "Listen", note: "Attentive listening" },
];
export type Panel = "body" | "look" | "motion" | "face" | "voice" | "save";''')
edit("src/lib/avatar/store.ts",
'import type { BodyId, FaceChoice, HairId, OutfitId, Panel, Preset, Screen, SkinId } from "@/lib/avatar/constants";',
'import type { BodyId, FaceChoice, HairId, MotionId, OutfitId, Panel, Preset, Screen, SkinId } from "@/lib/avatar/constants";')
edit("src/lib/avatar/store.ts", '  modelUrl: string | null;\n', '  modelUrl: string | null;\n  motion: MotionId;\n')
edit("src/lib/avatar/store.ts", '  modelUrl: null,\n', '  modelUrl: null,\n  motion: "idle",\n')

edit("src/components/studio/StudioApp.tsx",
'  AudioLines,\n',
'  AudioLines,\n  Activity,\n')
edit("src/components/studio/StudioApp.tsx", '  Smile,\n', '  Smile,\n  Shirt,\n')
edit("src/components/studio/StudioApp.tsx",
'import { VOICES, type Panel } from "@/lib/avatar/constants";',
'import { BODIES, HAIR, MOTIONS, OUTFITS, SKINS, VOICES, type Panel } from "@/lib/avatar/constants";')
edit("src/components/studio/StudioApp.tsx",
'''const PANELS: { id: Panel; label: string; icon: typeof UserRound }[] = [
  { id: "body", label: "Body", icon: UserRound },
  { id: "face", label: "Face", icon: Smile },
  { id: "voice", label: "Voice", icon: AudioLines },
  { id: "save", label: "Save", icon: Save },
];''',
'''const PANELS: { id: Panel; label: string; icon: typeof UserRound }[] = [
  { id: "body", label: "Body", icon: UserRound },
  { id: "look", label: "Clothes & hair", icon: Shirt },
  { id: "motion", label: "Motion", icon: Activity },
  { id: "face", label: "Face", icon: Smile },
  { id: "voice", label: "Audio", icon: AudioLines },
  { id: "save", label: "Save", icon: Save },
];''')
edit("src/components/studio/StudioApp.tsx",
'          {!state.modelUrl && state.panel === "face" ? (',
'''          {!state.modelUrl && state.panel === "look" ? <LookPanel /> : null}
          {!state.modelUrl && state.panel === "motion" ? <MotionPanel /> : null}
          {!state.modelUrl && state.panel === "face" ? (''')
edit("src/components/studio/StudioApp.tsx",
'          expression={state.expression}\n          faceRev={state.faceRev}',
'          expression={state.expression}\n          motion={state.motion}\n          faceRev={state.faceRev}')
edit("src/components/studio/StudioApp.tsx",
'<nav className="grid grid-cols-4 border-t border-border">',
'<nav className="grid grid-cols-3 border-t border-border sm:grid-cols-6">')

# Replace the reduced body panel with a real GLB selector plus existing body/style settings.
p = root / "src/components/studio/StudioApp.tsx"
s = p.read_text()
a = s.index("function BodyPanel() {")
b = s.index("\n\nfunction FacePanel(", a)
s = s[:a] + '''function BodyPanel() {
  const state = useStudio();
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-fg">Choose the real 3D body</h2>
        <p className="mt-1 text-sm text-muted">The supplied male and female rigged GLB meshes are used here. The commissioned model remains separate and view-only.</p>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Choice on={state.bodyAsset === "male"} label="Male body" note="Rigged GLB" onClick={() => state.patch({ bodyAsset: "male", modelUrl: null })} />
          <Choice on={state.bodyAsset === "female"} label="Female body" note="Rigged GLB" onClick={() => state.patch({ bodyAsset: "female", modelUrl: null })} />
        </div>
      </div>
      <div>
        <h3 className="font-medium text-fg">Build proportions</h3>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {BODIES.map((item) => <Choice key={item.id} on={state.body === item.id} label={item.label} note={item.note} onClick={() => state.patch({ body: item.id })} />)}
        </div>
      </div>
      <div>
        <h3 className="font-medium text-fg">Skin tone</h3>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {SKINS.map((item) => <button key={item.id} type="button" onClick={() => state.patch({ skin: item.id })} className={`rounded-xl border p-2 text-xs ${state.skin === item.id ? "border-primary text-fg" : "border-border text-muted"}`}><span className="mx-auto mb-1 block size-6 rounded-full" style={{ background: item.swatch }} />{item.label}</button>)}
        </div>
      </div>
    </div>
  );
}

function LookPanel() {
  const state = useStudio();
  return (
    <div className="space-y-4">
      <h2 className="font-display text-xl text-fg">Clothing & hair</h2>
      <div>
        <h3 className="mb-2 text-sm font-medium text-fg">Outfit</h3>
        <div className="grid grid-cols-2 gap-2">{OUTFITS.map((item) => <Choice key={item.id} on={state.outfit === item.id} label={item.label} note={item.note} onClick={() => state.patch({ outfit: item.id })} />)}</div>
      </div>
      <div>
        <h3 className="mb-2 text-sm font-medium text-fg">Hair</h3>
        <div className="grid grid-cols-3 gap-2">{HAIR.map((item) => <Choice key={item.id} on={state.hair === item.id} label={item.label} note={item.id === "none" ? "No hair" : item.id === "short" ? "Short style" : "Long style"} onClick={() => state.patch({ hair: item.id })} />)}</div>
      </div>
      <p className="text-xs text-muted">Styling controls apply only to the generic avatar. The commissioned finished model is not edited.</p>
    </div>
  );
}

function MotionPanel() {
  const motion = useStudio((s) => s.motion);
  const patch = useStudio((s) => s.patch);
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl text-fg">Co-host motion</h2>
      <p className="text-sm text-muted">Choose subtle streamer-friendly movement or a reaction. Idle is the default.</p>
      <div className="grid grid-cols-2 gap-2">{MOTIONS.map((item) => <Choice key={item.id} on={motion === item.id} label={item.label} note={item.note} onClick={() => patch({ motion: item.id })} />)}</div>
    </div>
  );
}''' + s[b:]
p.write_text(s)

# Restore style overlays and procedural motion on the rigged generic bodies. Audio/face driving stays intact.
edit("src/components/studio/Viewport.tsx",
'import { disposeCharacter } from "@/lib/avatar/build-body";',
'import { buildCharacter, disposeCharacter } from "@/lib/avatar/build-body";\nimport { SKINS } from "@/lib/avatar/constants";')
edit("src/components/studio/Viewport.tsx",
'import type { BodyAsset } from "@/lib/avatar/store";',
'import type { BodyAsset } from "@/lib/avatar/store";\nimport type { MotionId } from "@/lib/avatar/constants";')
edit("src/components/studio/Viewport.tsx", '  expression: number;\n  faceRev: number;', '  expression: number;\n  motion: MotionId;\n  faceRev: number;')
edit("src/components/studio/Viewport.tsx",
'      const root = characterRef.current;\n      if (root) {',
'      const root = characterRef.current;\n      if (root) {\n        if (root.name === "AvatarBody") applyMotion(root, current.motion, performance.now());')
edit("src/components/studio/Viewport.tsx",
'''      if (!props.modelUrl) {
        const bounds = new THREE.Box3().setFromObject(group);''',
'''      if (!props.modelUrl) {
        applySkinTone(group, props.skin);
        applyClothingAndHair(group, { body: props.body, outfit: props.outfit, hair: props.hair, skin: props.skin });
        const bounds = new THREE.Box3().setFromObject(group);''')
edit("src/components/studio/Viewport.tsx",
'}, [props.modelUrl, props.bodyAsset, props.faceChoice, props.faceRev, booted]);',
'}, [props.modelUrl, props.bodyAsset, props.body, props.outfit, props.hair, props.skin, props.faceChoice, props.faceRev, booted]);')

viewport = root / "src/components/studio/Viewport.tsx"
s = viewport.read_text()
marker = "function fitModelToViewport(model: THREE.Object3D) {"
helpers = '''function applySkinTone(model: THREE.Group, skin: SkinId) {
  const color = SKINS.find((item) => item.id === skin)?.swatch;
  if (!color) return;
  model.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const material of materials) {
      const mat = material as THREE.MeshStandardMaterial;
      if (mat.color && (mat.name.toLowerCase().includes("clay") || mat.name === "")) mat.color.set(color);
    }
  });
}

function applyClothingAndHair(model: THREE.Group, options: { body: BodyId; outfit: OutfitId; hair: HairId; skin: SkinId }) {
  const source = buildCharacter(options);
  source.updateMatrixWorld(true);
  const sourceBounds = new THREE.Box3().setFromObject(source);
  const sourceHeight = Math.max(0.001, sourceBounds.getSize(new THREE.Vector3()).y);
  const targetBounds = new THREE.Box3().setFromObject(model);
  const targetHeight = Math.max(0.001, targetBounds.getSize(new THREE.Vector3()).y);
  const overlay = new THREE.Group();
  overlay.name = "AvatarStyleOverlays";
  overlay.scale.setScalar(targetHeight / sourceHeight);
  overlay.position.set(0, targetBounds.min.y, 0);
  source.traverse((object) => {
    if (!(object instanceof THREE.Mesh) || !["Outfit", "Hair"].includes(object.name)) return;
    const clone = object.clone(false);
    clone.geometry = object.geometry.clone();
    clone.material = Array.isArray(object.material)
      ? object.material.map((material) => material.clone())
      : object.material.clone();
    clone.matrixAutoUpdate = false;
    clone.matrix.copy(object.matrixWorld);
    clone.matrixWorldNeedsUpdate = true;
    overlay.add(clone);
  });
  model.add(overlay);
  disposeCharacter(source);
}

function applyMotion(root: THREE.Object3D, motion: MotionId, now: number) {
  const t = now / 1000;
  const find = (name: string) => root.getObjectByName(name) as THREE.Bone | undefined;
  const names = ["head", "neck03", "spine03", "spine05", "upperarm01.L", "lowerarm01.L", "upperarm01.R", "lowerarm01.R"];
  for (const name of names) {
    const bone = find(name);
    if (!bone) continue;
    if (!bone.userData.avatarAceBaseRotation) bone.userData.avatarAceBaseRotation = { x: bone.rotation.x, y: bone.rotation.y, z: bone.rotation.z };
    const base = bone.userData.avatarAceBaseRotation as { x: number; y: number; z: number };
    bone.rotation.set(base.x, base.y, base.z);
  }
  const add = (name: string, axis: "x" | "y" | "z", value: number) => {
    const bone = find(name);
    if (!bone) return;
    const base = bone.userData.avatarAceBaseRotation as { x: number; y: number; z: number } | undefined;
    if (base) bone.rotation[axis] = base[axis] + value;
  };
  add("spine03", "z", Math.sin(t * 1.6) * 0.025);
  add("head", "z", Math.sin(t * 1.1) * 0.018);
  switch (motion) {
    case "wave": add("upperarm01.L", "z", -0.9 + Math.sin(t * 6) * 0.28); add("lowerarm01.L", "z", -0.55 + Math.sin(t * 6) * 0.22); break;
    case "cheer": add("upperarm01.L", "z", -1.8 + Math.sin(t * 4) * 0.12); add("upperarm01.R", "z", 1.8 - Math.sin(t * 4) * 0.12); break;
    case "clap": add("upperarm01.L", "z", -0.8); add("upperarm01.R", "z", 0.8); add("lowerarm01.L", "x", Math.sin(t * 8) * 0.4); add("lowerarm01.R", "x", -Math.sin(t * 8) * 0.4); break;
    case "laugh": add("spine03", "x", -0.08 + Math.sin(t * 5) * 0.07); add("head", "x", Math.sin(t * 5) * 0.06); break;
    case "talk": add("upperarm01.L", "z", -0.18 + Math.sin(t * 2.7) * 0.16); add("upperarm01.R", "z", 0.18 + Math.sin(t * 2.7 + 1) * 0.16); add("lowerarm01.L", "x", Math.sin(t * 2.7) * 0.14); break;
    case "think": add("head", "z", -0.12); add("head", "x", 0.06); add("upperarm01.L", "z", -0.22); break;
    case "listen": add("head", "z", Math.sin(t * 0.8) * 0.07); add("neck03", "x", Math.sin(t * 0.7) * 0.035); break;
    case "idle": default: add("upperarm01.L", "z", Math.sin(t * 1.3) * 0.018); add("upperarm01.R", "z", Math.sin(t * 1.3 + 1) * 0.018); break;
  }
}

'''
if marker not in s:
    raise SystemExit("Viewport insertion point missing")
viewport.write_text(s.replace(marker, helpers + marker, 1))

print("Restored editor panels, styling overlays, and co-host motion controls.")
