#!/usr/bin/env python3
"""Apply the AvatarAce body + separate finished-model viewer integration."""
from pathlib import Path

root = Path(__file__).resolve().parents[1]

def replace(path, old, new):
    p = root / path
    s = p.read_text()
    if old not in s:
        raise SystemExit(f"Expected source block not found in {path}: {old[:90]!r}")
    p.write_text(s.replace(old, new, 1))

replace("src/lib/avatar/store.ts",
'export type TalkPhase = "off" | "gen" | "play" | "mic";',
'export type TalkPhase = "off" | "gen" | "play" | "mic";\nexport type BodyAsset = "male" | "female";')
replace("src/lib/avatar/store.ts",
'  screen: Screen;\n  panel: Panel;',
'  screen: Screen;\n  panel: Panel;\n  bodyAsset: BodyAsset;\n  modelUrl: string | null;')
replace("src/lib/avatar/store.ts",
'  screen: "home",\n  panel: "body",',
'  screen: "home",\n  panel: "body",\n  bodyAsset: "male",\n  modelUrl: null,')

vp = root / "src/components/studio/Viewport.tsx"
s = vp.read_text()
s = s.replace('import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";',
'import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";\nimport { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";')
s = s.replace('import { buildCharacter, disposeCharacter } from "@/lib/avatar/build-body";',
'import { disposeCharacter } from "@/lib/avatar/build-body";\nimport type { BodyAsset } from "@/lib/avatar/store";')
s = s.replace('type Props = {\n  body: BodyId;',
'type Props = {\n  bodyAsset: BodyAsset;\n  modelUrl: string | null;\n  body: BodyId;')
old = '''  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    if (characterRef.current) {
      scene.remove(characterRef.current);
      disposeCharacter(characterRef.current);
      characterRef.current = null;
      faceRef.current = null;
    }
    const group = buildCharacter({
      body: props.body,
      outfit: props.outfit,
      hair: props.hair,
      skin: props.skin,
    });
    const built = getFaceCache()?.[props.faceChoice];
    if (built) {
      const face = makeFace(built);
      group.getObjectByName("HeadAnchor")?.add(face);
      faceRef.current = face;
      setProxyVisible(group, false);
    }
    scene.add(group);
    characterRef.current = group;
  }, [props.body, props.outfit, props.hair, props.skin, props.faceChoice, props.faceRev, booted]);'''
new = '''  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;
    let cancelled = false;
    if (characterRef.current) {
      scene.remove(characterRef.current);
      disposeCharacter(characterRef.current);
      characterRef.current = null;
      faceRef.current = null;
    }

    const loader = new GLTFLoader();
    const source = props.modelUrl ?? (props.bodyAsset === "female"
      ? "/models/female-base-mesh-base_female.glb"
      : "/models/male-base-mesh-base_male.glb");
    loader.load(source, (gltf) => {
      if (cancelled) {
        disposeCharacter(gltf.scene);
        return;
      }
      const group = gltf.scene;
      group.name = props.modelUrl ? "FinishedCommissionedModel" : "AvatarBody";
      fitModelToViewport(group);
      if (!props.modelUrl) {
        const bounds = new THREE.Box3().setFromObject(group);
        const size = bounds.getSize(new THREE.Vector3());
        const center = bounds.getCenter(new THREE.Vector3());
        const anchor = new THREE.Group();
        anchor.name = "HeadAnchor";
        anchor.position.set(center.x, bounds.min.y + size.y * 0.885, center.z + size.z * 0.12);
        group.add(anchor);
        const built = getFaceCache()?.[props.faceChoice];
        if (built) {
          const face = makeFace(built);
          anchor.add(face);
          faceRef.current = face;
        }
      }
      // The commissioned model is displayed as-is in a separate viewer. No face/body
      // composition or geometry edits are applied to that asset.
      scene.add(group);
      characterRef.current = group;
    }, undefined, (error) => {
      if (!cancelled) console.error("Could not load avatar model", error);
    });
    return () => { cancelled = true; };
  }, [props.modelUrl, props.bodyAsset, props.faceChoice, props.faceRev, booted]);'''
if old not in s:
    raise SystemExit("Expected Viewport render effect not found")
s = s.replace(old, new, 1)
s = s.replace('function makeFace(built: BuiltFace) {',
'''function fitModelToViewport(model: THREE.Object3D) {
  const bounds = new THREE.Box3().setFromObject(model);
  const size = bounds.getSize(new THREE.Vector3());
  const center = bounds.getCenter(new THREE.Vector3());
  const maxDimension = Math.max(size.x, size.y, size.z, 0.001);
  const scale = 1.8 / maxDimension;
  model.scale.multiplyScalar(scale);
  model.position.set(-center.x * scale, -bounds.min.y * scale, -center.z * scale);
}

function makeFace(built: BuiltFace) {''', 1)
vp.write_text(s)

app = root / "src/components/studio/StudioApp.tsx"
s = app.read_text()
s = s.replace('  Shirt,\n', '')
s = s.replace('import { BODIES, HAIR, OUTFITS, SKINS, VOICES, labelOf, type Panel } from "@/lib/avatar/constants";',
              'import { VOICES, type Panel } from "@/lib/avatar/constants";')
s = s.replace('listAvatars, saveAvatar, setPendingPhoto, type SavedAvatar',
              'listAvatars, saveAvatar, type SavedAvatar')
s = s.replace('''const PANELS: { id: Panel; label: string; icon: typeof UserRound }[] = [
  { id: "body", label: "Body", icon: UserRound },
  { id: "look", label: "Look", icon: Shirt },
  { id: "face", label: "Face", icon: Smile },
  { id: "voice", label: "Voice", icon: AudioLines },
  { id: "save", label: "Save", icon: Save },
];''',
'''const PANELS: { id: Panel; label: string; icon: typeof UserRound }[] = [
  { id: "body", label: "Body", icon: UserRound },
  { id: "face", label: "Face", icon: Smile },
  { id: "voice", label: "Voice", icon: AudioLines },
  { id: "save", label: "Save", icon: Save },
];''')
s = s.replace('onBrowse={() => patch({ screen: "studio", panel: "body", error: null, status: "idle" })}',
'''onBrowse={() => patch({ screen: "studio", panel: "body", modelUrl: null, error: null, status: "idle" })}
          onFinishedModel={() => patch({ screen: "studio", modelUrl: "/models/commissioned-finished-model.glb", error: null, status: "idle", talk: "off" })}''')
s = s.replace('patch({ screen: "home", talk: "off" });','patch({ screen: "home", modelUrl: null, talk: "off" });', 1)
s = s.replace('''  onBrowse,
  onSaved,
}: {
  savedCount: number;
  onCamera: () => void;
  onLibrary: () => void;
  onSample: () => void;
  onBrowse: () => void;
  onSaved: () => void;''',
'''  onBrowse,
  onFinishedModel,
  onSaved,
}: {
  savedCount: number;
  onCamera: () => void;
  onLibrary: () => void;
  onSample: () => void;
  onBrowse: () => void;
  onFinishedModel: () => void;
  onSaved: () => void;''')
s = s.replace('''            <button type="button" className="h-12 rounded-full text-muted" onClick={onBrowse}>
              Browse the studio first
            </button>''',
'''            <button type="button" className="h-12 rounded-full text-muted" onClick={onBrowse}>
              Build an avatar with a real 3D body
            </button>
            <button type="button" className="h-12 rounded-full border border-border bg-surface text-fg" onClick={onFinishedModel}>
              View my finished commissioned model
            </button>''')
s = s.replace('title: `${labelOf(BODIES, snap.body)} · ${labelOf(OUTFITS, snap.outfit)}`,',
              'title: `${snap.bodyAsset === "female" ? "Female" : "Male"} avatar`,')
s = s.replace('''        <Viewport
          ref={viewRef}
          body={state.body}''',
'''        <Viewport
          ref={viewRef}
          bodyAsset={state.bodyAsset}
          modelUrl={state.modelUrl}
          body={state.body}''')
s = s.replace('          {state.panel === "look" ? <LookPanel /> : null}\n', '')
s = s.replace('''        {state.talk === "play" || state.talk === "mic" ? (''',
'''        {!state.modelUrl && (state.talk === "play" || state.talk === "mic") ? (''')
s = s.replace('''          {state.panel === "body" ? <BodyPanel /> : null}
          {state.panel === "face" ? (''',
'''          {!state.modelUrl && state.panel === "body" ? <BodyPanel /> : null}
          {!state.modelUrl && state.panel === "face" ? (''')
s = s.replace('          {state.panel === "voice" ? (', '          {!state.modelUrl && state.panel === "voice" ? (')
s = s.replace('          {state.panel === "save" ? (', '          {!state.modelUrl && state.panel === "save" ? (')
s = s.replace('''        <nav className="grid grid-cols-5 border-t border-border">''',
'''        {state.modelUrl ? (
          <div className="border-t border-border px-4 py-4 text-sm text-muted">
            Finished model viewer — this model is loaded separately and is not combined with the avatar body or face editor.
          </div>
        ) : <nav className="grid grid-cols-4 border-t border-border">''')
s = s.replace('''          })}
        </nav>
      </section>''', '''          })}
        </nav>} 
      </section>''', 1)
start = s.index('function BodyPanel() {')
end = s.index('\nfunction LookPanel() {', start)
s = s[:start] + '''function BodyPanel() {
  const bodyAsset = useStudio((s) => s.bodyAsset);
  const patch = useStudio((s) => s.patch);
  return (
    <div>
      <h2 className="font-display text-xl text-fg">Choose a real 3D body</h2>
      <p className="mt-1 text-sm text-muted">These are the supplied male and female GLB body meshes. No procedural body is used.</p>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Choice on={bodyAsset === "male"} label="Male body" note="Generic male GLB" onClick={() => patch({ bodyAsset: "male", modelUrl: null })} />
        <Choice on={bodyAsset === "female"} label="Female body" note="Generic female GLB" onClick={() => patch({ bodyAsset: "female", modelUrl: null })} />
      </div>
    </div>
  );
}
''' + s[end:]
start = s.index('function LookPanel() {')
end = s.index('\nfunction FacePanel(', start)
s = s[:start] + s[end:]
app.write_text(s)
