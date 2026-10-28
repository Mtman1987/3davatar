import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ARKIT_BLENDSHAPE_NAMES, PRESETS, type ArkitName, type Weights } from "@/lib/avatar/arkit";
import { buildCharacter, disposeCharacter } from "@/lib/avatar/build-body";
import type { BodyId, FaceChoice, HairId, OutfitId, Preset, SkinId } from "@/lib/avatar/constants";
import { getFaceCache, type BuiltFace } from "@/lib/avatar/face-cache";

export type ViewportHandle = {
  snapshot: () => string;
  exportGlb: () => Promise<Blob>;
};

type Props = {
  body: BodyId;
  outfit: OutfitId;
  hair: HairId;
  skin: SkinId;
  faceChoice: FaceChoice;
  preset: Preset;
  headScale: number;
  headY: number;
  headZ: number;
  expression: number;
  faceRev: number;
  sampleSound: () => Weights | null;
};

const DRIVEN = new Set<string>([
  "jawForward", "jawLeft", "jawRight", "jawOpen",
  "mouthClose", "mouthFunnel", "mouthPucker", "mouthRight", "mouthLeft",
  "mouthSmileLeft", "mouthSmileRight", "mouthFrownLeft", "mouthFrownRight",
  "mouthDimpleLeft", "mouthDimpleRight", "mouthStretchLeft", "mouthStretchRight",
  "mouthRollLower", "mouthRollUpper", "mouthShrugLower", "mouthShrugUpper",
  "mouthPressLeft", "mouthPressRight", "mouthLowerDownLeft", "mouthLowerDownRight",
  "mouthUpperUpLeft", "mouthUpperUpRight",
  "cheekPuff", "cheekSquintLeft", "cheekSquintRight", "tongueOut", "browInnerUp",
]);

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props);
  propsRef.current = props;
  const sceneRef = useRef<THREE.Scene | null>(null);
  const characterRef = useRef<THREE.Group | null>(null);
  const faceRef = useRef<THREE.Mesh | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const [booted, setBooted] = useState(0);

  useImperativeHandle(ref, () => ({
    snapshot: () => {
      try {
        return rendererRef.current?.domElement.toDataURL("image/jpeg", 0.72) ?? "";
      } catch {
        return "";
      }
    },
    exportGlb: () => exportGroup(characterRef.current),
  }));

  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const canvas = document.createElement("canvas");
    canvas.className = "h-full w-full touch-none";
    wrap.appendChild(canvas);

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x171c23, 1);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x171c23);
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.05, 20);

    scene.add(new THREE.HemisphereLight(0xfff4e5, 0x1a1f28, 0.9));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2);
    key.position.set(1.1, 2.5, 1.8);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fd0c4, 0.85);
    rim.position.set(-1.5, 1.5, -1.3);
    scene.add(rim);
    const warm = new THREE.DirectionalLight(0xf0a202, 0.22);
    warm.position.set(-0.4, 1.1, 2.2);
    scene.add(warm);
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(0.62, 40),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.28 }),
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0.002;
    scene.add(ground);

    let yaw = 0.2;
    let pitch = 1.18;
    let radius = 2.15;
    const pointers = new Map<number, { x: number; y: number }>();
    let lastPinch = 0;
    let lastX = 0;
    let lastY = 0;
    const placeCamera = () => {
      camera.position.set(
        Math.sin(pitch) * Math.sin(yaw) * radius,
        1.02 + Math.cos(pitch) * radius,
        Math.sin(pitch) * Math.cos(yaw) * radius,
      );
      camera.lookAt(0, 1.02, 0);
    };
    placeCamera();

    const onDown = (event: PointerEvent) => {
      canvas.setPointerCapture(event.pointerId);
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      lastX = event.clientX;
      lastY = event.clientY;
      lastPinch = 0;
    };
    const onMove = (event: PointerEvent) => {
      if (!pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size >= 2) {
        const [a, b] = [...pointers.values()];
        if (!a || !b) return;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        if (lastPinch > 0) radius = clamp(radius * (lastPinch / dist), 1.25, 4.2);
        lastPinch = dist;
        placeCamera();
        return;
      }
      yaw -= (event.clientX - lastX) * 0.008;
      pitch = clamp(pitch + (event.clientY - lastY) * 0.006, 0.78, 1.55);
      lastX = event.clientX;
      lastY = event.clientY;
      placeCamera();
    };
    const onUp = (event: PointerEvent) => {
      pointers.delete(event.pointerId);
      lastPinch = 0;
    };
    canvas.addEventListener("pointerdown", onDown);
    canvas.addEventListener("pointermove", onMove);
    canvas.addEventListener("pointerup", onUp);
    canvas.addEventListener("pointercancel", onUp);

    const resize = () => {
      const w = Math.max(1, wrap.clientWidth);
      const h = Math.max(1, wrap.clientHeight);
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(wrap);
    resize();

    let frame = 0;
    const loop = () => {
      frame = requestAnimationFrame(loop);
      const current = propsRef.current;
      const face = faceRef.current;
      const sound = current.sampleSound();
      const blink = blinkCurve(performance.now());
      if (face?.morphTargetInfluences && face.morphTargetDictionary) {
        const influences = sound
          ? soundInfluences(face, sound, current.expression)
          : presetInfluences(face, current.preset, current.expression);
        const left = face.morphTargetDictionary.eyeBlinkLeft;
        const right = face.morphTargetDictionary.eyeBlinkRight;
        if (left !== undefined) influences[left] = Math.max(influences[left] ?? 0, blink);
        if (right !== undefined) influences[right] = Math.max(influences[right] ?? 0, blink);
        for (let i = 0; i < face.morphTargetInfluences.length; i++) {
          face.morphTargetInfluences[i] = influences[i] ?? 0;
        }
        face.scale.setScalar(current.headScale);
        face.position.y = current.headY;
        face.position.z = 0.055 + current.headZ;
      }
      const root = characterRef.current;
      if (root) {
        const jaw = sound ? (sound.jawOpen ?? 0) * current.expression : face ? readMorph(face, "jawOpen") : current.preset === "wow" ? 0.55 : 0.05;
        const smile = sound
          ? (((sound.mouthSmileLeft ?? 0) + (sound.mouthSmileRight ?? 0)) / 2) * current.expression
          : current.preset === "smile"
            ? 0.7 * current.expression
            : 0;
        poseProxies(root, jaw, smile, Math.max(blink, (sound?.eyeBlinkLeft ?? 0) * current.expression));
      }
      renderer.render(scene, camera);
    };
    loop();
    setBooted((n) => n + 1);

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      canvas.removeEventListener("pointerdown", onDown);
      canvas.removeEventListener("pointermove", onMove);
      canvas.removeEventListener("pointerup", onUp);
      canvas.removeEventListener("pointercancel", onUp);
      if (characterRef.current) {
        scene.remove(characterRef.current);
        disposeCharacter(characterRef.current);
        characterRef.current = null;
        faceRef.current = null;
      }
      ground.geometry.dispose();
      (ground.material as THREE.Material).dispose();
      renderer.dispose();
      canvas.remove();
      rendererRef.current = null;
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
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
  }, [props.body, props.outfit, props.hair, props.skin, props.faceChoice, props.faceRev, booted]);

  return <div ref={wrapRef} className="h-full w-full" />;
});

function makeFace(built: BuiltFace) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(built.positions.slice(), 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(built.uvs.slice(), 2));
  geometry.setIndex(new THREE.BufferAttribute(built.indices, 1));
  geometry.computeVertexNormals();
  geometry.morphAttributes.position = built.morphs.map((morph) => new THREE.BufferAttribute(morph.slice(), 3));
  const texture = new THREE.CanvasTexture(built.texture);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.flipY = true;
  texture.anisotropy = 4;
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: 0.55,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "ARKitFace";
  mesh.morphTargetDictionary = Object.fromEntries(ARKIT_BLENDSHAPE_NAMES.map((name, index) => [name, index]));
  mesh.morphTargetInfluences = built.influences.slice();
  mesh.userData.base = built.influences.slice();
  return mesh;
}

function presetInfluences(mesh: THREE.Mesh, preset: Preset, expression: number) {
  const base = (mesh.userData.base as number[] | undefined) ?? [];
  const count = mesh.morphTargetInfluences?.length ?? 0;
  const out = new Array<number>(count).fill(0);
  if (preset === "captured") {
    for (let i = 0; i < count; i++) out[i] = (base[i] ?? 0) * expression;
    return out;
  }
  for (const [name, value] of Object.entries(PRESETS[preset])) {
    const index = mesh.morphTargetDictionary?.[name];
    if (index !== undefined) out[index] = (value ?? 0) * expression;
  }
  return out;
}

function soundInfluences(mesh: THREE.Mesh, weights: Weights, expression: number) {
  const count = mesh.morphTargetInfluences?.length ?? 0;
  const out = new Array<number>(count).fill(0);
  const dict = mesh.morphTargetDictionary ?? {};
  for (const name of Object.keys(dict)) {
    if (!DRIVEN.has(name) && !name.startsWith("eye")) continue;
    const index = dict[name];
    if (index === undefined) continue;
    out[index] = (weights[name as ArkitName] ?? 0) * expression;
  }
  return out;
}

function readMorph(mesh: THREE.Mesh, name: string) {
  const index = mesh.morphTargetDictionary?.[name];
  if (index === undefined) return 0;
  return mesh.morphTargetInfluences?.[index] ?? 0;
}

function poseProxies(root: THREE.Object3D, jaw: number, smile: number, blink: number) {
  const mouth = root.getObjectByName("ProxyMouth");
  const eyeL = root.getObjectByName("ProxyEyeL");
  const eyeR = root.getObjectByName("ProxyEyeR");
  if (mouth) {
    mouth.scale.set(1.15 + smile * 0.55, 0.22 + Math.max(0, jaw) * 1.35, 0.5);
    mouth.position.y = -0.045 - Math.max(0, jaw) * 0.02;
  }
  const shut = 1 - 0.88 * clamp(blink, 0, 1);
  if (eyeL) eyeL.scale.y = shut;
  if (eyeR) eyeR.scale.y = shut;
}

function setProxyVisible(root: THREE.Object3D, visible: boolean) {
  for (const name of ["ProxyMouth", "ProxyEyeL", "ProxyEyeR"]) {
    const obj = root.getObjectByName(name);
    if (obj) obj.visible = visible;
  }
}

function blinkCurve(now: number) {
  const x = now % 4200;
  if (x > 150) return 0;
  if (x < 70) return x / 70;
  return 1 - (x - 70) / 80;
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v));
}

function exportGroup(root: THREE.Object3D | null) {
  if (!root) return Promise.reject(new Error("Nothing to export yet"));
  const exporter = new GLTFExporter();
  return new Promise<Blob>((resolve, reject) => {
    exporter.parse(
      root,
      (result) => {
        if (result instanceof ArrayBuffer) {
          resolve(new Blob([result], { type: "model/gltf-binary" }));
          return;
        }
        reject(new Error("Export failed"));
      },
      (error) => reject(error instanceof Error ? error : new Error("Export failed")),
      { binary: true },
    );
  });
}
