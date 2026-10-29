import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { ARKIT_BLENDSHAPE_NAMES, type Weights } from "@/lib/avatar/arkit";
import { getFaceCache } from "@/lib/avatar/face-cache";
import { bindConnectedFace, type ConnectedFaceBinding } from "@/lib/avatar/connected-face";
import { bodyUrl, SKINS, type BodyAssetId, type FaceChoice, type HairId, type OutfitId, type Preset, type SkinId } from "@/lib/avatar/constants";

export type ViewportHandle = { snapshot: () => string; exportGlb: () => Promise<Blob> };
export type ModelInfo = { morphNames: string[]; animationNames: string[] };
type Props = {
  bodyAsset: BodyAssetId; modelUrl: string | null; modelName?: string | null;
  outfit: OutfitId; hair: HairId; skin: SkinId; faceChoice: FaceChoice; preset: Preset;
  headScale: number; headY: number; headZ: number; expression: number; faceRev: number;
  focusFace?: boolean;
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
  const faceBindingRef = useRef<ConnectedFaceBinding | null>(null);
  const fitCameraRef = useRef<((center: THREE.Vector3, distance: number) => void) | null>(null);
  const [booted, setBooted] = useState(0);

  useImperativeHandle(ref, () => ({
    snapshot: () => { try { return rendererRef.current?.domElement.toDataURL("image/jpeg", 0.72) ?? ""; } catch { return ""; } },
    exportGlb: () => exportGroup(modelRef.current?.root ?? null),
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
    fitCameraRef.current = (center, distance) => { target = center.clone(); radius = distance; yaw = 0.08; pitch = Math.PI / 2 - 0.02; placeCamera(); };
    placeCamera();
    const pointers = new Map<number, {x:number;y:number}>(); let lastPinch = 0, lastX = 0, lastY = 0;
    const onDown = (e: PointerEvent) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); lastX=e.clientX;lastY=e.clientY;lastPinch=0; };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pointers.size >= 2) { const [a,b]=[...pointers.values()]; if(!a||!b)return; const d=Math.hypot(a.x-b.x,a.y-b.y); if(lastPinch>0)radius=clamp(radius*lastPinch/Math.max(d,1),0.08,30);lastPinch=d;placeCamera();return; }
      yaw -= (e.clientX-lastX)*0.008; pitch=clamp(pitch+(e.clientY-lastY)*0.006,0.15,Math.PI-0.15);lastX=e.clientX;lastY=e.clientY;placeCamera();
    };
    const onUp = (e: PointerEvent) => { pointers.delete(e.pointerId);lastPinch=0; };
    const onWheel = (e: WheelEvent) => { e.preventDefault(); radius = clamp(radius * Math.exp(e.deltaY * 0.001), 0.08, 30); placeCamera(); };
    canvas.addEventListener("pointerdown",onDown);canvas.addEventListener("pointermove",onMove);canvas.addEventListener("pointerup",onUp);canvas.addEventListener("pointercancel",onUp);
    canvas.addEventListener("wheel",onWheel,{passive:false});
    const resize = () => { const w=Math.max(1,wrap.clientWidth),h=Math.max(1,wrap.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize);observer.observe(wrap);resize();
    const clock = new THREE.Clock(); let frame=0;
    const loop = () => {
      frame=requestAnimationFrame(loop); const delta=clock.getDelta(); const loaded=modelRef.current; loaded?.mixer?.update(delta);
      const current=propsRef.current; const sound=current.sampleSound(); const tracking=current.sampleTracking?.();
      const allWeights: Record<string,number> = {...(sound ?? {}),...(tracking ?? {}),...(current.manualMorphs ?? {})};
      if (current.preset === "smile") Object.assign(allWeights, { mouthSmileLeft: 0.8, mouthSmileRight: 0.8 });
      if (current.preset === "blink") Object.assign(allWeights, { eyeBlinkLeft: 1, eyeBlinkRight: 1 });
      if (current.preset === "wow") Object.assign(allWeights, { jawOpen: 0.65, eyeWideLeft: 0.7, eyeWideRight: 0.7, browInnerUp: 0.6 });
      if (loaded) applyMorphs(loaded.root,allWeights,current.expression);
      renderer.render(scene,camera);
    };
    loop();setBooted(n=>n+1);
    return () => {
      cancelAnimationFrame(frame);observer.disconnect();
      canvas.removeEventListener("pointerdown",onDown);canvas.removeEventListener("pointermove",onMove);canvas.removeEventListener("pointerup",onUp);canvas.removeEventListener("pointercancel",onUp);
      canvas.removeEventListener("wheel",onWheel);fitCameraRef.current=null;
      faceBindingRef.current?.restore();faceBindingRef.current=null;
      if(modelRef.current){scene.remove(modelRef.current.root);disposeModel(modelRef.current.root);modelRef.current.mixer?.stopAllAction();modelRef.current=null;}
      ground.geometry.dispose();(ground.material as THREE.Material).dispose();renderer.dispose();canvas.remove();
      rendererRef.current=null;sceneRef.current=null;cameraRef.current=null;
    };
  }, []);

  useEffect(() => {
    const scene=sceneRef.current,camera=cameraRef.current;if(!scene||!camera)return;
    let cancelled=false; const url=props.modelUrl ?? bodyUrl(props.bodyAsset);
    faceBindingRef.current?.restore();faceBindingRef.current=null;
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
      const fov=THREE.MathUtils.degToRad(camera.fov);
      const fitDistance=Math.max(finalSize.y/(2*Math.tan(fov/2)),finalSize.x/(2*Math.tan(fov/2)*camera.aspect))*1.12;
      fitCameraRef.current?.(target,fitDistance);
      const clips=gltf.animations ?? [];const mixer=clips.length?new THREE.AnimationMixer(root):null;
      root.userData.exportAnimations=clips;
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
    faceBindingRef.current?.restore(); faceBindingRef.current = null;
    const built = props.faceRev > 0 ? getFaceCache()?.[props.faceChoice] : null;
    if (!built) return;
    let binding: ConnectedFaceBinding;
    try {
      binding = bindConnectedFace(loaded.root, built, { headScale: props.headScale, headY: props.headY, headZ: props.headZ });
      faceBindingRef.current = binding;
      wrapRef.current?.setAttribute("data-connected-face", JSON.stringify(binding.report));
      propsRef.current.onError?.("");
      propsRef.current.onModelInfo?.({ morphNames: binding.report.morphNames, animationNames: loaded.clips.map(c => c.name || "Unnamed animation") });
    } catch (error) {
      propsRef.current.onError?.(error instanceof Error ? error.message : "Unable to connect the photo to the head mesh.");
      return;
    }
    return () => {
      binding.restore();
      wrapRef.current?.removeAttribute("data-connected-face");
      if (faceBindingRef.current === binding) faceBindingRef.current = null;
    };
  }, [props.faceRev, props.faceChoice, props.headScale, props.headY, props.headZ, props.skin, props.modelUrl, props.bodyAsset, booted]);

  useEffect(() => {
    const loaded = modelRef.current;
    if (!loaded || props.modelUrl) return;
    const head = loaded.root.getObjectByName("head");
    if (props.focusFace && head) {
      const center = head.getWorldPosition(new THREE.Vector3()); center.y += 0.035;
      fitCameraRef.current?.(center, 0.75);
    } else {
      const bounds = new THREE.Box3().setFromObject(loaded.root);
      const size = bounds.getSize(new THREE.Vector3()); const camera = cameraRef.current;
      if (camera) fitCameraRef.current?.(bounds.getCenter(new THREE.Vector3()), Math.max(size.y, size.x / camera.aspect) / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2)) * 1.12);
    }
  }, [props.focusFace, props.faceRev, props.modelUrl, props.bodyAsset, booted]);

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
      if (source.userData.connectedPhotoSkin) return source;
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

function sampleSkinTone(source: HTMLCanvasElement): THREE.Color | null {
  const context = source.getContext("2d");
  if (!context || source.width < 8 || source.height < 8) return null;
  const x0 = Math.floor(source.width * 0.34), x1 = Math.floor(source.width * 0.66);
  const y0 = Math.floor(source.height * 0.38), y1 = Math.floor(source.height * 0.66);
  const pixels = context.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0)).data;
  let r = 0, g = 0, b = 0, count = 0;
  for (let i = 0; i < pixels.length; i += 4) {
    const rr = pixels[i]!, gg = pixels[i + 1]!, bb = pixels[i + 2]!;
    const max = Math.max(rr, gg, bb), min = Math.min(rr, gg, bb);
    // Ignore transparent, near-black, and highly saturated background pixels.
    if (pixels[i + 3]! < 200 || max < 48 || max - min > 105) continue;
    r += rr; g += gg; b += bb; count++;
  }
  if (count < 20) return null;
  const tone = new THREE.Color().setRGB(r / count / 255, g / count / 255, b / count / 255, THREE.SRGBColorSpace);
  // Keep a little headroom so the body does not inherit a photo's strongest highlight.
  tone.multiplyScalar(0.92);
  return tone;
}

function applyMorphs(root: THREE.Object3D, weights: Record<string,number>, expression: number) {
  root.traverse((obj)=>{
    const mesh=obj as THREE.Mesh;
    if(!mesh.isMesh||!mesh.morphTargetDictionary||!mesh.morphTargetInfluences)return;
    const baseline = mesh.userData.connectedPhotoFaceBaseline as Record<string, number> | undefined;
    if (baseline) {
      // Restore the captured photo expression every frame before applying live drivers.
      // This prevents sparse Audio2Face/tracking frames from leaving stale jaw/blink weights.
      for (const name of ARKIT_BLENDSHAPE_NAMES) {
        const index = mesh.morphTargetDictionary[name];
        if (index !== undefined) {
          const base = baseline[name] ?? 0;
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
  },(error)=>reject(error instanceof Error?error:new Error("GLB export failed")),{binary:true,animations:modelAnimations(root)}));
}

function modelAnimations(root: THREE.Object3D): THREE.AnimationClip[] {
  return root.userData.exportAnimations ?? [];
}
