import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import type { Weights } from "@/lib/avatar/arkit";
import { bodyUrl, type BodyAssetId, type FaceChoice, type HairId, type OutfitId, type Preset, type SkinId } from "@/lib/avatar/constants";

export type ViewportHandle = { snapshot: () => string; exportGlb: () => Promise<Blob> };
export type ModelInfo = { morphNames: string[]; animationNames: string[] };
type Props = {
  bodyAsset: BodyAssetId; modelUrl: string | null; modelName?: string | null;
  outfit: OutfitId; hair: HairId; skin: SkinId; faceChoice: FaceChoice; preset: Preset;
  headScale: number; headY: number; headZ: number; expression: number; faceRev: number;
  sampleSound: () => Weights | null; sampleTracking?: () => Record<string, number> | null;
  manualMorphs?: Record<string, number>; onModelInfo?: (info: ModelInfo) => void; onError?: (message: string) => void;
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
    placeCamera();
    const pointers = new Map<number, {x:number;y:number}>(); let lastPinch = 0, lastX = 0, lastY = 0;
    const onDown = (e: PointerEvent) => { canvas.setPointerCapture(e.pointerId); pointers.set(e.pointerId,{x:e.clientX,y:e.clientY}); lastX=e.clientX;lastY=e.clientY;lastPinch=0; };
    const onMove = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return; pointers.set(e.pointerId,{x:e.clientX,y:e.clientY});
      if (pointers.size >= 2) { const [a,b]=[...pointers.values()]; if(!a||!b)return; const d=Math.hypot(a.x-b.x,a.y-b.y); if(lastPinch>0)radius=clamp(radius*lastPinch/Math.max(d,1),0.08,30);lastPinch=d;placeCamera();return; }
      yaw -= (e.clientX-lastX)*0.008; pitch=clamp(pitch+(e.clientY-lastY)*0.006,0.15,Math.PI-0.15);lastX=e.clientX;lastY=e.clientY;placeCamera();
    };
    const onUp = (e: PointerEvent) => { pointers.delete(e.pointerId);lastPinch=0; };
    canvas.addEventListener("pointerdown",onDown);canvas.addEventListener("pointermove",onMove);canvas.addEventListener("pointerup",onUp);canvas.addEventListener("pointercancel",onUp);
    const resize = () => { const w=Math.max(1,wrap.clientWidth),h=Math.max(1,wrap.clientHeight);renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix(); };
    const observer = new ResizeObserver(resize);observer.observe(wrap);resize();
    const clock = new THREE.Clock(); let frame=0;
    const loop = () => {
      frame=requestAnimationFrame(loop); const delta=clock.getDelta(); const loaded=modelRef.current; loaded?.mixer?.update(delta);
      const current=propsRef.current; const sound=current.sampleSound(); const tracking=current.sampleTracking?.();
      const allWeights: Record<string,number> = {...(sound ?? {}),...(tracking ?? {}),...(current.manualMorphs ?? {})};
      if (loaded && Object.keys(allWeights).length) applyMorphs(loaded.root,allWeights,current.expression);
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
      camera.position.set(target.x+0.15,target.y+0.12,Math.max(finalSize.y*1.45,0.45));camera.lookAt(target);
      const clips=gltf.animations ?? [];const mixer=clips.length?new THREE.AnimationMixer(root):null;
      modelRef.current={root,clips,mixer};scene.add(root);
      const morphNames=new Set<string>();
      root.traverse((obj)=>{const mesh=obj as THREE.Mesh; if(mesh.isMesh && mesh.morphTargetDictionary)Object.keys(mesh.morphTargetDictionary).forEach(n=>morphNames.add(n));});
      propsRef.current.onModelInfo?.({morphNames:[...morphNames].sort(),animationNames:clips.map(c=>c.name || "Unnamed animation")});
      setBooted(n=>n+1);
    },undefined,(error)=>{
      if(cancelled)return;
      const detail=error instanceof Error?error.message:"Unknown GLB loading error";
      propsRef.current.onError?.("Failed to load required model "+url+": "+detail);
    });
    return ()=>{cancelled=true;};
  },[props.modelUrl,props.bodyAsset,props.modelName]);

  return <div ref={wrapRef} className="h-full w-full" data-viewport-booted={booted} />;
});

function applyMorphs(root: THREE.Object3D, weights: Record<string,number>, expression: number) {
  root.traverse((obj)=>{
    const mesh=obj as THREE.Mesh;if(!mesh.isMesh||!mesh.morphTargetDictionary||!mesh.morphTargetInfluences)return;
    for(const [name,index] of Object.entries(mesh.morphTargetDictionary)){
      const value=weights[name]; if(value!==undefined)mesh.morphTargetInfluences[index]=clamp(value*expression,0,1);
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
