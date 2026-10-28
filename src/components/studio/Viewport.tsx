import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ARKIT_BLENDSHAPE_NAMES, type Weights } from "@/lib/avatar/arkit";
import { getFaceCache } from "@/lib/avatar/face-cache";
import { bodyUrl, SKINS, type BodyAssetId, type FaceChoice, type HairId, type OutfitId, type Preset, type SkinId } from "@/lib/avatar/constants";
import type { FaceFitSnapshot } from "@/lib/avatar/face-fit";

export type ViewportHandle = { snapshot: () => string; exportGlb: () => Promise<Blob>; captureFaceFit: () => FaceFitSnapshot | null };
export type ModelInfo = { morphNames: string[]; animationNames: string[] };
type Props = {
  bodyAsset: BodyAssetId; modelUrl: string | null; modelName?: string | null;
  outfit: OutfitId; hair: HairId; skin: SkinId; faceChoice: FaceChoice; preset: Preset;
  headScale: number; headY: number; headZ: number; expression: number; faceRev: number; faceFitSnapshot?: FaceFitSnapshot | null;
  sampleSound: () => Weights | null; sampleTracking?: () => Record<string, number> | null;
  manualMorphs?: Record<string, number>; animationIndex?: number; animationPlaying?: boolean; onModelInfo?: (info: ModelInfo) => void; onProgress?: (loaded: number, total: number) => void; onError?: (message: string) => void;
};
type LoadedModel = { root: THREE.Group; clips: THREE.AnimationClip[]; mixer: THREE.AnimationMixer | null };
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

export const Viewport = forwardRef<ViewportHandle, Props>(function Viewport(props, ref) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef(props); propsRef.current = props;
  const sceneRef = useRef<THREE.Scene | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const modelRef = useRef<LoadedModel | null>(null);
  const faceMeshRef = useRef<THREE.Mesh | null>(null);
  const [booted, setBooted] = useState(0);

  useImperativeHandle(ref, () => ({
    snapshot: () => { try { return rendererRef.current?.domElement.toDataURL("image/jpeg", 0.72) ?? ""; } catch { return ""; } },
    exportGlb: () => exportGroup(modelRef.current?.root ?? null),
    captureFaceFit: () => {
      const mesh = faceMeshRef.current;
      const loaded = modelRef.current;
      if (!mesh || !loaded) return null;
      mesh.updateMatrixWorld(true);
      const wp = new THREE.Vector3(); const wr = new THREE.Euler(); const ws = new THREE.Vector3();
      mesh.getWorldPosition(wp);
      const worldQ = new THREE.Quaternion(); mesh.getWorldQuaternion(worldQ); wr.setFromQuaternion(worldQ, mesh.rotation.order);
      mesh.getWorldScale(ws);
      return { version: 1, bodyAsset: propsRef.current.bodyAsset, faceChoice: propsRef.current.faceChoice, parentName: mesh.parent?.name ?? "", position: [mesh.position.x,mesh.position.y,mesh.position.z] as [number, number, number], rotation: [mesh.rotation.x,mesh.rotation.y,mesh.rotation.z] as [number, number, number], scale: [mesh.scale.x,mesh.scale.y,mesh.scale.z] as [number, number, number], worldPosition: [wp.x,wp.y,wp.z] as [number, number, number], worldRotation: [wr.x,wr.y,wr.z] as [number, number, number], worldScale: [ws.x,ws.y,ws.z] as [number, number, number], capturedAt: Date.now() };
    },
  }));

  useEffect(() => {
    const wrap = wrapRef.current; if (!wrap) return;
    const canvas = document.createElement("canvas");
    canvas.className = "h-full w-full touch-none"; wrap.appendChild(canvas);
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
    renderer.setClearColor(0x171c23, 1); rendererRef.current = renderer;
    const scene = new THREE.Scene(); scene.background = new THREE.Color(0x171c23); sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(30, 1, 0.01, 1000); cameraRef.current = camera;
    scene.add(new THREE.HemisphereLight(0xfff4e5, 0x1a1f28, 1.1));
    const key = new THREE.DirectionalLight(0xfff1d6, 2.2); key.position.set(1.1, 2.5, 1.8); scene.add(key);
    const rim = new THREE.DirectionalLight(0x7fd0c4, 0.85); rim.position.set(-1.5, 1.5, -1.3); scene.add(rim);
    const ground = new THREE.Mesh(new THREE.CircleGeometry(0.8, 48), new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.24 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.002; scene.add(ground);

    let yaw = 0.2, pitch = 1.18, radius = 2.6, target = new THREE.Vector3(0, 1, 0);
    const placeCamera = () => {
      camera.position.set(target.x + Math.sin(pitch) * Math.sin(yaw) * radius, target.y + Math.cos(pitch) * radius, target.z + Math.sin(pitch) * Math.cos(yaw) * radius);
      camera.lookAt(target);
    };
    placeCamera();
    const pointers = new Map<number, {x:number;y:number}>();
    let lastPinch = 0, lastX = 0, lastY = 0;
    const onDown = (e: PointerEvent) => {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      lastX = e.clientX; lastY = e.clientY; lastPinch = 0;
    };
    const onMove = (e: PointerEvent) => {
      const previous = pointers.get(e.pointerId);
      if (!previous) return;
      const before = [...pointers.values()];
      const current = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, current);
      if (pointers.size >= 2) {
        const [a0, b0] = before;
        const [a1, b1] = [...pointers.values()];
        if (!a0 || !b0 || !a1 || !b1) return;
        const oldDistance = Math.hypot(a0.x - b0.x, a0.y - b0.y);
        const newDistance = Math.hypot(a1.x - b1.x, a1.y - b1.y);
        if (oldDistance > 0) radius = clamp(radius * oldDistance / Math.max(newDistance, 1), 0.08, 30);

        // Two-finger translation pans the camera target in camera space.
        // Scale by the visible world height so the gesture feels consistent
        // across zoom levels and phone/tablet viewport sizes.
        const midpointBefore = { x: (a0.x + b0.x) * 0.5, y: (a0.y + b0.y) * 0.5 };
        const midpointAfter = { x: (a1.x + b1.x) * 0.5, y: (a1.y + b1.y) * 0.5 };
        const dx = midpointAfter.x - midpointBefore.x;
        const dy = midpointAfter.y - midpointBefore.y;
        const viewportHeight = Math.max(1, wrap.clientHeight);
        const worldUnitsPerPixel = (2 * radius * Math.tan(THREE.MathUtils.degToRad(camera.fov * 0.5))) / viewportHeight;
        camera.updateMatrixWorld();
        const cameraRight = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0).normalize();
        const cameraUp = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1).normalize();
        target.addScaledVector(cameraRight, -dx * worldUnitsPerPixel);
        target.addScaledVector(cameraUp, dy * worldUnitsPerPixel);
        lastPinch = newDistance;
        placeCamera();
        return;
      }
      yaw -= (current.x - lastX) * 0.008;
      pitch = clamp(pitch + (current.y - lastY) * 0.006, 0.15, Math.PI - 0.15);
      lastX = current.x; lastY = current.y;
      placeCamera();
    };
    const onUp = (e: PointerEvent) => {
      pointers.delete(e.pointerId);
      lastPinch = 0;
      const remaining = [...pointers.values()][0];
      if (remaining) { lastX = remaining.x; lastY = remaining.y; }
    };
    canvas.addEventListener("pointerdown",onDown);canvas.addEventListener("pointermove",onMove);canvas.addEventListener("pointerup",onUp);canvas.addEventListener("pointercancel",onUp);
    const resize = () => { const w=Math.max(1,wrap.clientWidth),h=Math.max(1,wrap.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize);observer.observe(wrap);resize();
    const clock = new THREE.Clock(); let frame=0;
    const loop = () => {
      frame=requestAnimationFrame(loop); const delta=clock.getDelta(); const loaded=modelRef.current; loaded?.mixer?.update(delta);
      const current=propsRef.current; const sound=current.sampleSound(); const tracking=current.sampleTracking?.();
      const allWeights: Record<string,number> = {...(sound ?? {}),...(tracking ?? {}),...(current.manualMorphs ?? {})};
      if (loaded) applyMorphs(loaded.root,allWeights,current.expression);
      renderer.render(scene,camera);
    };
    loop();setBooted(n=>n+1);
    return () => {
      cancelAnimationFrame(frame);observer.disconnect();
      canvas.removeEventListener("pointerdown",onDown);canvas.removeEventListener("pointermove",onMove);canvas.removeEventListener("pointerup",onUp);canvas.removeEventListener("pointercancel",onUp);
      if(modelRef.current){scene.remove(modelRef.current.root);disposeModel(modelRef.current.root);modelRef.current.mixer?.stopAllAction();modelRef.current=null;}
      ground.geometry.dispose();(ground.material as THREE.Material).dispose();renderer.dispose();canvas.remove();
      rendererRef.current=null;sceneRef.current=null;cameraRef.current=null;
    };
  }, []);

  useEffect(() => {
    const scene=sceneRef.current,camera=cameraRef.current;if(!scene||!camera)return;
    let cancelled=false; const url=props.modelUrl ?? bodyUrl(props.bodyAsset);
    if(modelRef.current){scene.remove(modelRef.current.root);modelRef.current.mixer?.stopAllAction();disposeModel(modelRef.current.root);modelRef.current=null;}
    propsRef.current.onModelInfo?.({morphNames:[],animationNames:[]});
    propsRef.current.onError?.("");
    const loader=new GLTFLoader();
    loader.load(url,(gltf)=>{
      if(cancelled){disposeModel(gltf.scene);return;}
      const root=new THREE.Group();root.name=props.modelName || (props.modelUrl ? "FinishedCommission" : props.bodyAsset+"-base");root.add(gltf.scene);
      root.updateMatrixWorld(true);
      const bounds=new THREE.Box3().setFromObject(root);
      if(bounds.isEmpty() || !Number.isFinite(bounds.min.y) || !Number.isFinite(bounds.max.y)){
        disposeModel(root);propsRef.current.onError?.("The model loaded but has no valid visible geometry: "+url);return;
      }
      const size=bounds.getSize(new THREE.Vector3()); const height=Math.max(size.y,0.0001);
      // Normalize arbitrary source units to a viewer-friendly height, preserving the original mesh and morph data.
      const scale=2/height;root.scale.setScalar(scale);root.position.y=-bounds.min.y*scale;root.updateMatrixWorld(true);
      const center=new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());
      const finalBounds=new THREE.Box3().setFromObject(root);const finalSize=finalBounds.getSize(new THREE.Vector3());
      root.position.x-=center.x;root.position.z-=center.z;
      const target=new THREE.Vector3(0,finalBounds.min.y+finalSize.y*0.52,0);
      // Fit the complete avatar into the actual viewport. Multiplying height by
      // 1.45 clipped the head and feet at the 30° camera FOV, hiding the photo
      // face even when detection and placement had succeeded.
      const verticalFov=THREE.MathUtils.degToRad(camera.fov);
      const horizontalFov=2*Math.atan(Math.tan(verticalFov*0.5)*Math.max(camera.aspect,0.01));
      const fitHeight=finalSize.y/(2*Math.tan(verticalFov*0.5));
      const fitWidth=finalSize.x/(2*Math.tan(horizontalFov*0.5));
      const fitDepth=finalSize.z/(2*Math.tan(verticalFov*0.5));
      const fitDistance=Math.max(fitHeight,fitWidth,fitDepth,0.45)*1.14;
      camera.position.set(target.x+0.08,target.y+0.04,fitDistance);camera.lookAt(target);
      const clips=gltf.animations ?? [];const mixer=clips.length?new THREE.AnimationMixer(root):null;
      modelRef.current={root,clips,mixer};scene.add(root);
      const morphNames=new Set<string>();
      root.traverse((obj)=>{const mesh=obj as THREE.Mesh; if(mesh.isMesh && mesh.morphTargetDictionary)Object.keys(mesh.morphTargetDictionary).forEach(n=>morphNames.add(n));});
      propsRef.current.onModelInfo?.({morphNames:[...morphNames].sort(),animationNames:clips.map(c=>c.name || "Unnamed animation")});
      setBooted(n=>n+1);
    },(event)=>{propsRef.current.onProgress?.(event.loaded,event.total);},(error)=>{
      if(cancelled)return;
      const detail=error instanceof Error?error.message:"Unknown GLB loading error";
      propsRef.current.onError?.("Failed to load required model "+url+": "+detail);
    });
    return ()=>{cancelled=true;};
  },[props.modelUrl,props.bodyAsset,props.modelName]);

  useEffect(() => {
    // Skin suits are treatments on the real male/female base GLBs only.
    // The commissioned model is intentionally view-only and must remain untouched.
    const loaded = modelRef.current;
    if (!loaded || props.modelUrl) return;
    const face = getFaceCache()?.[props.faceChoice];
    const sampledTone = face ? sampleSkinTone(face.texture) : null;
    applySkinSuitMaterial(loaded.root, props.skin, sampledTone);
  }, [props.skin, props.modelUrl, props.bodyAsset, props.faceRev, props.faceChoice, booted]);

  useEffect(() => {
    const loaded = modelRef.current;
    if (!loaded || props.modelUrl) return;
    if (faceMeshRef.current) {
      faceMeshRef.current.parent?.remove(faceMeshRef.current);
      disposeFaceMesh(faceMeshRef.current);
      faceMeshRef.current = null;
    }
    const built = props.faceRev > 0 ? getFaceCache()?.[props.faceChoice] : null;
    if (!built) return;

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute("position", new THREE.BufferAttribute(built.positions.slice(), 3));
    geometry.setAttribute("uv", new THREE.BufferAttribute(built.uvs.slice(), 2));
    geometry.setIndex(new THREE.BufferAttribute(built.indices.slice(), 1));
    geometry.morphAttributes.position = built.morphs.map((delta, index) => {
      const attribute = new THREE.BufferAttribute(delta.slice(), 3);
      attribute.name = ARKIT_BLENDSHAPE_NAMES[index] ?? String(index);
      return attribute;
    });
    geometry.morphTargetsRelative = true;
    geometry.computeVertexNormals();

    const bounds = new THREE.Box3().setFromObject(loaded.root);
    const height = Math.max(0.001, bounds.max.y - bounds.min.y);
    const textureCanvas = makeFeatheredFaceTexture(built.texture, built.uvs);
    const map = new THREE.CanvasTexture(textureCanvas);
    map.colorSpace = THREE.SRGBColorSpace;
    map.needsUpdate = true;
    const material = new THREE.MeshStandardMaterial({
      map, transparent: true, alphaTest: 0.025, roughness: 0.82, metalness: 0,
      side: THREE.DoubleSide, depthWrite: false,
    });
    const faceMesh = new THREE.Mesh(geometry, material);
    faceMesh.name = "AvatarAcePhotoFace";
    const rootScale = Math.abs(loaded.root.scale.x) || 1;
    // The base GLB keeps its own skull/jaw underneath this photo-only surface.
    // Match the head's vertical reach without widening the cheeks; uniform
    // scaling left the original chin visible below the captured face like a mask.
    faceMesh.scale.set(
      props.headScale / rootScale,
      (props.headScale * 0.98) / rootScale,
      props.headScale / rootScale,
    );

    // Place the photo face from the actual head joint, not the whole body's
    // bounding-box front edge (which can be dominated by shoulders/arms).
    // Compute the desired point in world space first, then convert it to the
    // model root's local space before attaching; Object3D.attach preserves the
    // resulting world transform when the head bone becomes the parent.
    loaded.root.updateMatrixWorld(true);
    const headBone = findHeadBone(loaded.root);
    const headWorld = new THREE.Vector3();
    if (headBone) headBone.getWorldPosition(headWorld);
    else headWorld.set(
      (bounds.min.x + bounds.max.x) * 0.5,
      bounds.max.y - height * 0.12,
      (bounds.min.z + bounds.max.z) * 0.5,
    );
    const targetWorld = headWorld.clone();
    // The normalized base body is about 2 viewer units tall (roughly 72 inches).
    // Start lower and slightly shorter than the previous trial: the photo
    // face was sitting too high in the skull and its forehead/chin footprint
    // extended too far vertically. The Head Y control remains the fine adjuster.
    targetWorld.y += height * (0.015 - 1 / 72) + props.headY;
    // Keep the photo surface close to the skull. The former 0.035 + 3/72
    // offset pushed it roughly 4.3 inches forward on a normalized 6-foot avatar,
    // which made the reconstructed face read as a floating mask.
    targetWorld.z += height * 0.015 + props.headZ;
    const targetLocal = loaded.root.worldToLocal(targetWorld.clone());
    faceMesh.position.copy(targetLocal);

    // Normalize photo roll from the detected eye line before attaching the
    // photo surface to the head. Without this, a slightly tilted source photo
    // leaves one eye beyond the mask even though the face center is aligned.
    // MediaPipe's image Y points down; the generated mesh uses Y-up, so this
    // sign levels the 3D eye line while keeping texture UVs and landmarks paired.
    const leftEye = [33, 133].map((index) => built.positions.slice(index * 3, index * 3 + 3));
    const rightEye = [263, 362].map((index) => built.positions.slice(index * 3, index * 3 + 3));
    const eyeCenter = (points: Float32Array[]) => new THREE.Vector3(
      points.reduce((sum, point) => sum + point[0]!, 0) / points.length,
      points.reduce((sum, point) => sum + point[1]!, 0) / points.length,
      points.reduce((sum, point) => sum + point[2]!, 0) / points.length,
    );
    const eyeA = eyeCenter(leftEye);
    const eyeB = eyeCenter(rightEye);
    const eyeLineAngle = Math.atan2(eyeB.y - eyeA.y, eyeB.x - eyeA.x);
    faceMesh.rotation.z = -eyeLineAngle;
    faceMesh.renderOrder = 2;
    faceMesh.updateMorphTargets();
    faceMesh.userData.avatarPhotoFaceBaseline = [...built.influences];
    faceMesh.morphTargetInfluences?.forEach((_, i) => {
      faceMesh.morphTargetInfluences![i] = built.influences[i] ?? 0;
    });
    loaded.root.add(faceMesh);
    loaded.root.updateMatrixWorld(true);
    if (headBone) headBone.attach(faceMesh);
    // Apply a saved exact fit only to the same generic body and face variant.
    // A missing/legacy snapshot leaves the computed default placement untouched.
    const savedFit = props.faceFitSnapshot;
    if (savedFit && savedFit.version === 1 &&
      savedFit.bodyAsset === props.bodyAsset &&
      savedFit.faceChoice === props.faceChoice &&
      (!savedFit.parentName || savedFit.parentName === (faceMesh.parent?.name ?? ""))) {
      faceMesh.position.fromArray(savedFit.position);
      faceMesh.rotation.set(savedFit.rotation[0], savedFit.rotation[1], savedFit.rotation[2]);
      faceMesh.scale.fromArray(savedFit.scale);
    }
    loaded.root.updateMatrixWorld(true);
    // Hide only the old central nose surface that protrudes through the photo
    // face. This clones affected geometry and keeps skin indices, weights, and
    // morph attributes intact; cleanup restores the original geometry.
    const restoreBaseNose = trimUnderlyingNose(loaded.root, faceMesh, headBone, height);
    faceMeshRef.current = faceMesh;
    return () => {
      restoreBaseNose();
      faceMesh.parent?.remove(faceMesh);
      disposeFaceMesh(faceMesh);
      if (faceMeshRef.current === faceMesh) faceMeshRef.current = null;
    };
  }, [props.faceRev, props.faceChoice, props.headScale, props.headY, props.headZ, props.modelUrl, props.bodyAsset, props.faceFitSnapshot, booted]);

  useEffect(() => {
    const loaded = modelRef.current;
    if (!loaded?.mixer) return;
    loaded.mixer.stopAllAction();
    if (!props.animationPlaying) return;
    const clip = loaded.clips[props.animationIndex ?? 0];
    if (clip) loaded.mixer.clipAction(clip).reset().play();
  }, [props.animationIndex, props.animationPlaying, booted]);

  return <div ref={wrapRef} className="h-full w-full" data-viewport-booted={booted} />;
});

function applySkinSuitMaterial(root: THREE.Object3D, skinId: SkinId, sampledTone: THREE.Color | null = null) {
  const swatch = SKINS.find((entry) => entry.id === skinId)?.swatch ?? SKINS[1].swatch;
  const skinColor = sampledTone ? sampledTone.clone() : new THREE.Color(swatch);
  const excluded = /hair|eye|iris|pupil|brow|lash|teeth|tooth|mouth|tongue|gum|cloth|shirt|jacket|shoe|boot|accessor|nail/i;

  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || excluded.test(mesh.name || "")) return;
    const sources = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    const next = sources.map((source) => {
      if (excluded.test(source.name || "")) return source;
      if (source.userData.avatarSkinSuitMaterial) {
        const existing = source as THREE.MeshStandardMaterial;
        existing.color.copy(skinColor);
        return existing;
      }

      // Keep the actual GLB mesh, UVs, and texture maps. The swatch is an albedo
      // multiplier/base tint; scene lights still control highlights and shadows.
      const material = source.clone();
      if (!(material instanceof THREE.MeshStandardMaterial)) return material;
      material.color.copy(skinColor);
      material.roughness = Math.max(material.roughness, 0.72);
      material.metalness = 0;
      if (material instanceof THREE.MeshPhysicalMaterial) {
        material.clearcoat = Math.min(material.clearcoat, 0.08);
        material.clearcoatRoughness = Math.max(material.clearcoatRoughness, 0.72);
        material.sheen = Math.max(material.sheen, 0.08);
        material.sheenRoughness = Math.max(material.sheenRoughness, 0.8);
      }
      if (!material.normalMap) {
        // Low-amplitude pore-scale normal detail, not a painted color texture.
        const width = 96, height = 96, canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) return material;
        const image = context.createImageData(width, height);
        const data = image.data;
        for (let y = 0; y < height; y++) {
          for (let x = 0; x < width; x++) {
            const i = (y * width + x) * 4;
            const wave = Math.sin(x * 1.73 + Math.sin(y * 0.31) * 2.1) * Math.cos(y * 1.37 + Math.sin(x * 0.23));
            data[i] = 128 + Math.round(wave * 3);
            data[i + 1] = 128 + Math.round(Math.cos(x * 0.41 + y * 0.67) * 3);
            data[i + 2] = 255;
            data[i + 3] = 255;
          }
        }
        context.putImageData(image, 0, 0);
        const pores = new THREE.CanvasTexture(canvas);
        pores.wrapS = THREE.RepeatWrapping;
        pores.wrapT = THREE.RepeatWrapping;
        pores.repeat.set(5, 5);
        pores.needsUpdate = true;
        material.normalMap = pores;
        material.normalScale.set(0.025, 0.025);
      }
      material.userData.avatarSkinSuitMaterial = true;
      return material;
    });
    mesh.material = Array.isArray(mesh.material) ? next : next[0]!;
  });
}

function trimUnderlyingNose(
  root: THREE.Object3D,
  photoFace: THREE.Mesh,
  headBone: THREE.Bone | null,
  bodyHeight: number,
): () => void {
  const restorations: Array<{ mesh: THREE.Mesh; geometry: THREE.BufferGeometry }> = [];
  // Keep separate facial details, hair, and accessories intact. Trim the base
  // head surface covered by the photo-face mesh so it cannot poke through.
  const ignored = /hair|eye|iris|pupil|brow|lash|teeth|tooth|mouth|tongue|gum|jaw|accessor|nail/i;
  root.updateMatrixWorld(true);
  photoFace.updateMatrixWorld(true);

  const worldBounds = new THREE.Box3().setFromObject(photoFace);
  const corners: THREE.Vector3[] = [];
  for (const x of [worldBounds.min.x, worldBounds.max.x]) {
    for (const y of [worldBounds.min.y, worldBounds.max.y]) {
      for (const z of [worldBounds.min.z, worldBounds.max.z]) {
        corners.push(root.worldToLocal(new THREE.Vector3(x, y, z)));
      }
    }
  }
  const faceBounds = new THREE.Box3().setFromPoints(corners);
  const faceWidth = faceBounds.max.x - faceBounds.min.x;
  const faceHeight = faceBounds.max.y - faceBounds.min.y;
  if (faceWidth <= 0 || faceHeight <= 0) return () => {};

  const headCenter = new THREE.Vector3();
  if (headBone) headBone.getWorldPosition(headCenter);
  else headCenter.copy(faceBounds.getCenter(new THREE.Vector3()));
  root.worldToLocal(headCenter);

  // Add a small margin beyond the face mesh's bounds to prevent edge pokethrough.
  // Restrict removal to the front surface; preserve skull silhouette, ears, and neck.
  const marginX = faceWidth * 0.035;
  const marginY = faceHeight * 0.025;
  const cutMinX = faceBounds.min.x - marginX;
  const cutMaxX = faceBounds.max.x + marginX;
  const cutMinY = faceBounds.min.y - marginY;
  const cutMaxY = faceBounds.max.y + marginY;
  const frontZ = headCenter.z + bodyHeight * 0.02;

  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || mesh === photoFace || !mesh.geometry || ignored.test(mesh.name || "")) return;
    const position = mesh.geometry.getAttribute("position");
    if (!position || position.count < 3) return;

    mesh.updateMatrixWorld(true);
    const sourceIndex = mesh.geometry.getIndex();
    const indexCount = sourceIndex ? sourceIndex.count : position.count;
    if (indexCount < 3) return;
    const kept: number[] = [];
    const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
    for (let i = 0; i + 2 < indexCount; i += 3) {
      const ia = sourceIndex ? sourceIndex.getX(i) : i;
      const ib = sourceIndex ? sourceIndex.getX(i + 1) : i + 1;
      const ic = sourceIndex ? sourceIndex.getX(i + 2) : i + 2;
      a.fromBufferAttribute(position, ia).applyMatrix4(mesh.matrixWorld);
      b.fromBufferAttribute(position, ib).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(position, ic).applyMatrix4(mesh.matrixWorld);
      root.worldToLocal(a); root.worldToLocal(b); root.worldToLocal(c);
      const x = (a.x + b.x + c.x) / 3;
      const y = (a.y + b.y + c.y) / 3;
      const z = (a.z + b.z + c.z) / 3;
      const underPhotoFace = x >= cutMinX && x <= cutMaxX &&
        y >= cutMinY && y <= cutMaxY && z > frontZ;
      if (!underPhotoFace) kept.push(ia, ib, ic);
    }
    if (kept.length === indexCount) return;

    // Clone and replace only the index: UVs, skin weights, and morph attributes survive.
    const original = mesh.geometry;
    const trimmed = original.clone();
    trimmed.setIndex(kept);
    mesh.geometry = trimmed;
    restorations.push({ mesh, geometry: original });
  });

  return () => {
    for (const { mesh, geometry } of restorations) {
      mesh.geometry.dispose();
      mesh.geometry = geometry;
    }
  };
}

function findHeadBone(root: THREE.Object3D): THREE.Bone | null {
  let exact: THREE.Bone | null = null;
  let neck: THREE.Bone | null = null;
  root.traverse((object) => {
    const bone = object as THREE.Bone;
    if (!bone.isBone) return;
    const name = bone.name.toLowerCase().replace(/[^a-z]/g, "");
    if (/^(head|headjoint|mixamorighead|skull)$/.test(name)) exact = bone;
    else if (!neck && /neck/.test(name)) neck = bone;
  });
  return exact ?? neck;
}

function sampleSkinTone(source: HTMLCanvasElement): THREE.Color | null {
  const context = source.getContext("2d");
  if (!context || source.width < 8 || source.height < 8) return null;
  // Sample both cheek zones rather than the center of the face, where nose,
  // lips, nostrils, and shadows can bias the body's skin color much darker.
  const patches = [
    { x: 0.27, y: 0.40, w: 0.18, h: 0.20 },
    { x: 0.55, y: 0.40, w: 0.18, h: 0.20 },
  ];
  let r = 0, g = 0, b = 0, count = 0;
  for (const patch of patches) {
    const x = Math.floor(source.width * patch.x);
    const y = Math.floor(source.height * patch.y);
    const width = Math.max(1, Math.floor(source.width * patch.w));
    const height = Math.max(1, Math.floor(source.height * patch.h));
    const pixels = context.getImageData(x, y, width, height).data;
    for (let i = 0; i < pixels.length; i += 4) {
      const rr = pixels[i]!, gg = pixels[i + 1]!, bb = pixels[i + 2]!;
      const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
      // Ignore transparent, near-black, and highly saturated background pixels.
      if (pixels[i + 3]! < 200 || max < 48 || max - min > 105) continue;
      r += rr; g += gg; b += bb; count++;
    }
  }
  if (count < 20) return null;
  // Do not darken the sampled tone further; keep the cheek average as the target.
  return new THREE.Color().setRGB(r / count / 255, g / count / 255, b / count / 255, THREE.SRGBColorSpace);
}

const PHOTO_FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377,
  152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

function makeFeatheredFaceTexture(source: HTMLCanvasElement, uvs: Float32Array) {
  const canvas = document.createElement("canvas");
  canvas.width = source.width; canvas.height = source.height;
  const context = canvas.getContext("2d");
  if (!context) return source;
  context.drawImage(source, 0, 0);

  // Derive the alpha cut from the exact same canonical oval used by the face
  // mesh, projected through its UVs. A fixed ellipse drifts relative to the
  // photo crop and can leave opaque corners or cut into the jaw/temples.
  const mask = document.createElement("canvas");
  mask.width = canvas.width; mask.height = canvas.height;
  const maskContext = mask.getContext("2d");
  if (!maskContext) return canvas;
  maskContext.fillStyle = "#fff";
  maskContext.beginPath();
  PHOTO_FACE_OVAL.forEach((index, pointIndex) => {
    const u = uvs[index * 2];
    const v = uvs[index * 2 + 1];
    if (u === undefined || v === undefined) return;
    const x = u * mask.width;
    const y = (1 - v) * mask.height;
    if (pointIndex === 0) maskContext.moveTo(x, y);
    else maskContext.lineTo(x, y);
  });
  maskContext.closePath();
  maskContext.fill();

  // Blur only the cutout alpha so the base head skin can blend through the
  // perimeter. The mesh boundary still defines the maximum face footprint.
  const featherMask = document.createElement("canvas");
  featherMask.width = canvas.width; featherMask.height = canvas.height;
  const featherContext = featherMask.getContext("2d");
  if (!featherContext) return canvas;
  featherContext.filter = "blur(18px)";
  featherContext.drawImage(mask, 0, 0);
  featherContext.filter = "none";

  context.globalCompositeOperation = "destination-in";
  context.drawImage(featherMask, 0, 0);
  context.globalCompositeOperation = "source-over";
  return canvas;
}

function disposeFaceMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose();
  const material = mesh.material as THREE.MeshStandardMaterial;
  material.map?.dispose();
  material.dispose();
}

function applyMorphs(root: THREE.Object3D, weights: Record<string,number>, expression: number) {
  root.traverse((obj)=>{
    const mesh=obj as THREE.Mesh;
    if(!mesh.isMesh||!mesh.morphTargetDictionary||!mesh.morphTargetInfluences)return;
    const isPhotoFace = mesh.name === "AvatarAcePhotoFace";
    const baseline = isPhotoFace ? mesh.userData.avatarPhotoFaceBaseline as number[] | undefined : undefined;
    if (isPhotoFace) {
      // Restore the captured photo expression every frame before applying live drivers.
      // This prevents sparse Audio2Face/tracking frames from leaving stale jaw/blink weights.
      for (const name of ARKIT_BLENDSHAPE_NAMES) {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) {
          const base = baseline?.[index] ?? 0;
          mesh.morphTargetInfluences[index] = clamp(base * expression, 0, 1);
        }
      }
    }
    for(const [name,value] of Object.entries(weights)){
      const index=mesh.morphTargetDictionary[name];
      if(index !== undefined) mesh.morphTargetInfluences[index]=clamp(value*expression,0,1);
    }
  });
}
function disposeModel(root: THREE.Object3D) {
  root.traverse((obj)=>{
    const mesh=obj as THREE.Mesh;if(!mesh.isMesh)return;
    mesh.geometry?.dispose();const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material];
    for(const material of materials){const m=material as THREE.Material & {map?:THREE.Texture;normalMap?:THREE.Texture;roughnessMap?:THREE.Texture;metalnessMap?:THREE.Texture;emissiveMap?:THREE.Texture};
      for(const texture of [m.map,m.normalMap,m.roughnessMap,m.metalnessMap,m.emissiveMap])texture?.dispose();m.dispose();}
  });
}
function exportGroup(root: THREE.Object3D | null): Promise<Blob> {
  if(!root)return Promise.reject(new Error("Nothing loaded to export"));
  const exporter=new GLTFExporter();
  return new Promise((resolve,reject)=>exporter.parse(root,(result)=>{
    if(result instanceof ArrayBuffer)resolve(new Blob([result],{type:"model/gltf-binary"}));
    else reject(new Error("GLB export returned a non-binary result"));
  },(error)=>reject(error instanceof Error?error:new Error("GLB export failed")),{binary:true}));
}
