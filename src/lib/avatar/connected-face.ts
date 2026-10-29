import * as THREE from "three";
import { ARKIT_BLENDSHAPE_NAMES } from "./arkit.ts";
import type { BuiltFace } from "./face-cache.ts";

const OVAL = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
type Sample = { ids: [number, number, number]; weights: [number, number, number] };
export type ConnectedFaceOptions = { headScale: number; headY: number; headZ: number; bakeTexture?: boolean };
export type ConnectedFaceReport = { method: string; meshes: number; changedVertices: number; vertexCount: number; triangleCount: number; morphNames: string[] };
export type ConnectedFaceBinding = { report: ConnectedFaceReport; restore: () => void };
const smooth = (x: number) => { const t = THREE.MathUtils.clamp(x, 0, 1); return t * t * (3 - 2 * t); };

/** Accelerated interpolation over the captured face; never creates rendered geometry. */
export function faceSampler(face: BuiltFace) {
  const cells = new Map<string, number[]>();
  const step = 0.012;
  for (let t = 0; t < face.indices.length; t += 3) {
    const ids = [face.indices[t]!, face.indices[t + 1]!, face.indices[t + 2]!];
    const xs = ids.map(i => face.positions[i * 3]!);
    const ys = ids.map(i => face.positions[i * 3 + 1]!);
    for (let x = Math.floor(Math.min(...xs) / step); x <= Math.floor(Math.max(...xs) / step); x++) {
      for (let y = Math.floor(Math.min(...ys) / step); y <= Math.floor(Math.max(...ys) / step); y++) {
        const key = `${x},${y}`;
        if (!cells.has(key)) cells.set(key, []);
        cells.get(key)!.push(t);
      }
    }
  }
  return (x: number, y: number): Sample | null => {
    for (const t of cells.get(`${Math.floor(x / step)},${Math.floor(y / step)}`) ?? []) {
      const a = face.indices[t]!, b = face.indices[t + 1]!, c = face.indices[t + 2]!;
      const ax = face.positions[a * 3]!, ay = face.positions[a * 3 + 1]!;
      const bx = face.positions[b * 3]!, by = face.positions[b * 3 + 1]!;
      const cx = face.positions[c * 3]!, cy = face.positions[c * 3 + 1]!;
      const d = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy);
      if (Math.abs(d) < 1e-10) continue;
      const wa = ((by - cy) * (x - cx) + (cx - bx) * (y - cy)) / d;
      const wb = ((cy - ay) * (x - cx) + (ax - cx) * (y - cy)) / d;
      const wc = 1 - wa - wb;
      if (Math.min(wa, wb, wc) >= -1e-5) return { ids: [a, b, c], weights: [wa, wb, wc] };
    }
    return null;
  };
}

function interpolate(data: Float32Array, size: number, component: number, sample: Sample) {
  return sample.ids.reduce((sum, id, k) => sum + (data[id * size + component] ?? 0) * sample.weights[k]!, 0);
}

/** Signed distance inside the actual face oval, not a body-sized bounding box. */
function ovalWeight(face: BuiltFace, x: number, y: number) {
  const polygon = OVAL.filter(i => i * 3 + 1 < face.positions.length);
  if (polygon.length < 3) return 0;
  let inside = false, distance = Infinity;
  for (let k = 0, j = polygon.length - 1; k < polygon.length; j = k++) {
    const a = polygon[j]!, b = polygon[k]!;
    const ax = face.positions[a * 3]!, ay = face.positions[a * 3 + 1]!;
    const bx = face.positions[b * 3]!, by = face.positions[b * 3 + 1]!;
    if ((ay > y) !== (by > y) && x < (bx - ax) * (y - ay) / (by - ay) + ax) inside = !inside;
    const dx = bx - ax, dy = by - ay;
    const t = THREE.MathUtils.clamp(((x - ax) * dx + (y - ay) * dy) / Math.max(dx * dx + dy * dy, 1e-10), 0, 1);
    distance = Math.min(distance, Math.hypot(x - ax - t * dx, y - ay - t * dy));
  }
  return inside ? smooth(distance / 0.015) : 0;
}

/** Full vertex skin transform, so transferred morphs stay in the original bind space. */
function posedMatrix(mesh: THREE.SkinnedMesh, index: number) {
  const indices = mesh.geometry.getAttribute("skinIndex");
  const weights = mesh.geometry.getAttribute("skinWeight");
  const sum = new THREE.Matrix4(); sum.elements.fill(0);
  const bone = new THREE.Matrix4();
  for (let k = 0; k < 4; k++) {
    const weight = weights.getComponent(index, k);
    if (!weight) continue;
    bone.fromArray(mesh.skeleton.boneMatrices!, indices.getComponent(index, k) * 16);
    for (let j = 0; j < 16; j++) sum.elements[j]! += bone.elements[j]! * weight;
  }
  return mesh.matrixWorld.clone().multiply(mesh.bindMatrixInverse).multiply(sum).multiply(mesh.bindMatrix);
}

/**
 * Photo -> existing skin vertices/UVs/morphs. No overlay, cuts, reindexing, new
 * vertices, bone reparenting, or binary asset edits. Owned clones are reversible.
 */
export function bindConnectedFace(root: THREE.Object3D, face: BuiltFace, options: ConnectedFaceOptions): ConnectedFaceBinding {
  const heads: THREE.Bone[] = [];
  root.traverse(o => { if ((o as THREE.Bone).isBone && o.name === "head") heads.push(o as THREE.Bone); });
  if (heads.length !== 1) throw new Error(`Connected face requires one exact head bone; found ${heads.length}.`);
  root.updateMatrixWorld(true);
  const head = heads[0]!;
  const headWorld = head.getWorldPosition(new THREE.Vector3());
  const sampleAt = faceSampler(face);
  const scale = THREE.MathUtils.clamp(options.headScale, 0.8, 1.35) * 1.12;
  // Derive the center from the existing head joint. Slider values are viewer units.
  const origin = headWorld.clone(); origin.y += 0.015 + options.headY;
  const candidates: THREE.SkinnedMesh[] = [];
  root.traverse(o => {
    const mesh = o as THREE.SkinnedMesh;
    // Preserve existing eye/lip detail primitives too. Their head skin weights
    // and spatial overlap decide eligibility; nothing is added or detached.
    if (mesh.isSkinnedMesh && mesh.geometry.getAttribute("skinIndex")) candidates.push(mesh);
  });
  if (!candidates.length) throw new Error("Connected face: standardized connected skin primitive 'base' is missing.");
  const saved: Array<{ mesh: THREE.SkinnedMesh; geometry: THREE.BufferGeometry; material: THREE.Material | THREE.Material[]; dictionary?: Record<string, number>; influences?: number[] }> = [];
  const report: ConnectedFaceReport = { method: "photo transferred onto original connected skin", meshes: 0, changedVertices: 0, vertexCount: 0, triangleCount: 0, morphNames: [] };
  const restore = () => {
    for (const item of saved.splice(0)) {
      const owned = item.mesh.material;
      if (owned !== item.material) for (const material of Array.isArray(owned) ? owned : [owned]) {
        const map = (material as THREE.MeshStandardMaterial).map;
        if (map?.userData.connectedFaceAtlas) map.dispose();
        material.dispose();
      }
      item.mesh.geometry.dispose();
      item.mesh.geometry = item.geometry; item.mesh.material = item.material;
      item.mesh.morphTargetDictionary = item.dictionary; item.mesh.morphTargetInfluences = item.influences;
      delete item.mesh.userData.connectedPhotoFaceBaseline;
    }
  };
  try {
    for (const mesh of candidates) {
      mesh.skeleton.update();
      const source = mesh.geometry;
      const sourcePosition = source.getAttribute("position");
      const sourceNormal = source.getAttribute("normal");
      const count = sourcePosition.count;
      const skinIndex = source.getAttribute("skinIndex"), skinWeight = source.getAttribute("skinWeight");
      // A front projection must not paint the temples or back-facing side wall.
      // Z-depth alone admitted those vertices and stretched the photo sideways.
      const normalMatrix = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
      const headJoints = new Set<number>();
      mesh.skeleton.bones.forEach((bone, index) => {
        let p: THREE.Object3D | null = bone;
        while (p) { if (p === head) { headJoints.add(index); break; } p = p.parent; }
      });
      const samples: Array<Sample | null> = Array(count).fill(null);
      const blend = new Float32Array(count);
      const worldPositions: Array<THREE.Vector3 | null> = Array(count).fill(null);
      const eligibleZ: number[] = [];
      for (let i = 0; i < count; i++) {
        let headInfluence = 0;
        for (let k = 0; k < 4; k++) if (headJoints.has(skinIndex.getComponent(i, k))) headInfluence += skinWeight.getComponent(i, k);
        if (headInfluence < 0.4) continue;
        const world = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        // +Z is the standardized GLBs' front. Back-of-skull and neck stay intact.
        if (world.z < headWorld.z + 0.025 || !sourceNormal) continue;
        // Reject grazing-angle vertices: projecting a 2D portrait onto them
        // stretches the eye/temple pixels into long horizontal bands in profile.
        const facing = new THREE.Vector3().fromBufferAttribute(sourceNormal, i).applyMatrix3(normalMatrix).normalize().z;
        if (facing <= 0.25) continue;
        const projectionWeight = smooth((facing - 0.25) / 0.4);
        const x = (world.x - origin.x) / scale, y = (world.y - origin.y) / scale;
        const weight = ovalWeight(face, x, y) * smooth((headInfluence - 0.4) / 0.4) * projectionWeight;
        if (weight <= 1e-5) continue;
        const sample = sampleAt(x, y);
        if (!sample) continue;
        samples[i] = sample; blend[i] = weight; worldPositions[i] = world; eligibleZ.push(world.z);
      }
      if (!eligibleZ.length) continue;
      // Sculpt onto the existing curved skin, rather than flattening it onto a
      // photo plane (which exposed eyes and created a forehead shelf).
      const geometry = source.clone();
      const position = geometry.getAttribute("position") as THREE.BufferAttribute;
      const originalMorphs = source.morphAttributes.position ?? [];
      const namedMorphs = new Map<string, THREE.BufferAttribute>();
      for (let m = 0; m < originalMorphs.length; m++) {
        const name = Object.keys(mesh.morphTargetDictionary ?? {}).find(n => mesh.morphTargetDictionary![n] === m) ?? originalMorphs[m]!.name;
        const attribute = new THREE.BufferAttribute(new Float32Array(count * 3), 3); attribute.name = name;
        for (let i = 0; i < count; i++) for (let k = 0; k < 3; k++) attribute.setComponent(i, k, originalMorphs[m]!.getComponent(i, k) - (source.morphTargetsRelative ? 0 : sourcePosition.getComponent(i, k)));
        namedMorphs.set(name, attribute);
      }
      for (const name of ARKIT_BLENDSHAPE_NAMES) if (!namedMorphs.has(name)) {
        const attribute = new THREE.BufferAttribute(new Float32Array(count * 3), 3); attribute.name = name; namedMorphs.set(name, attribute);
      }
      for (let i = 0; i < count; i++) {
        const sample = samples[i], world = worldPositions[i]; if (!sample || !world) continue;
        const weight = blend[i]!;
        const inverse = posedMatrix(mesh, i).invert();
        const target = world.clone();
        const relief = interpolate(face.positions, 3, 2, sample) * scale * 0.18;
        // A single image is not a complete skull reconstruction. Keep original
        // eye sockets/profile and use bounded photo relief, smoothly blended.
        target.z += THREE.MathUtils.clamp(relief + options.headZ * 0.2, -0.012, 0.012) * weight;
        const local = target.applyMatrix4(inverse); position.setXYZ(i, local.x, local.y, local.z);
        const direction = new THREE.Matrix3().setFromMatrix4(inverse);
        ARKIT_BLENDSHAPE_NAMES.forEach((name, m) => {
          const delta = face.morphs[m]; if (!delta) return;
          const localDelta = new THREE.Vector3(interpolate(delta, 3, 0, sample), interpolate(delta, 3, 1, sample), interpolate(delta, 3, 2, sample)).multiplyScalar(scale * weight).applyMatrix3(direction);
          const attribute = namedMorphs.get(name)!;
          attribute.setXYZ(i, attribute.getX(i) + localDelta.x, attribute.getY(i) + localDelta.y, attribute.getZ(i) + localDelta.z);
        });
        report.changedVertices++;
      }
      geometry.morphAttributes.position = [...namedMorphs.values()]; geometry.morphTargetsRelative = true;
      // Retain authored smooth normals across original UV splits; recalculating
      // each split independently produces faceted seams on these base assets.
      geometry.computeBoundingBox(); geometry.computeBoundingSphere();
      const material = options.bakeTexture === false ? mesh.material : bakeAtlas(mesh, face, samples, blend);
      saved.push({ mesh, geometry: source, material: mesh.material, dictionary: mesh.morphTargetDictionary, influences: mesh.morphTargetInfluences });
      mesh.geometry = geometry; mesh.material = material; mesh.updateMorphTargets();
      mesh.userData.connectedPhotoFaceBaseline = Object.fromEntries(ARKIT_BLENDSHAPE_NAMES.map((name, i) => [name, face.influences[i] ?? 0]));
      report.meshes++; report.vertexCount += count; report.triangleCount += (source.index?.count ?? count) / 3;
      report.morphNames = [...namedMorphs.keys()];
    }
    if (!report.changedVertices) throw new Error("The photo did not overlap the existing head. Reset the face fit and try a frontal portrait.");
    return { report, restore };
  } catch (error) { restore(); throw error; }
}

/** Bake projected photo triangles into the skin's ORIGINAL UV atlas for GLB export. */
function bakeAtlas(mesh: THREE.Mesh, face: BuiltFace, samples: Array<Sample | null>, blend: Float32Array): THREE.Material | THREE.Material[] {
  const uv = mesh.geometry.getAttribute("uv");
  if (!uv) throw new Error("Connected head has no original UV atlas.");
  const sourceMaterials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
  const canvas = document.createElement("canvas"); canvas.width = canvas.height = 2048;
  const context = canvas.getContext("2d"); if (!context) throw new Error("Unable to bake the head texture.");
  const source = sourceMaterials[0] as THREE.MeshStandardMaterial;
  const swatch = source.color?.getStyle(THREE.SRGBColorSpace) ?? "#e0b08a";
  context.fillStyle = swatch; context.fillRect(0, 0, canvas.width, canvas.height);
  if (source.map?.image) {
    context.drawImage(source.map.image as CanvasImageSource, 0, 0, canvas.width, canvas.height);
    context.globalCompositeOperation = "multiply"; context.fillStyle = swatch;
    context.fillRect(0, 0, canvas.width, canvas.height); context.globalCompositeOperation = "source-over";
  }
  const photo = featherPhoto(face);
  const indices = mesh.geometry.index; const count = indices?.count ?? uv.count;
  for (let t = 0; t < count; t += 3) {
    const ids = [0,1,2].map(k => indices ? indices.getX(t + k) : t + k);
    const refs = ids.map(id => samples[id]);
    if (refs.some(ref => !ref)) continue;
    const from = refs.map(ref => [interpolate(face.uvs, 2, 0, ref!) * photo.width, (1 - interpolate(face.uvs, 2, 1, ref!)) * photo.height]);
    const to = ids.map(id => [uv.getX(id) * canvas.width, (1 - uv.getY(id)) * canvas.height]);
    const affine = triangleAffine(from, to); if (!affine) continue;
    context.save(); context.beginPath(); context.moveTo(to[0]![0]!, to[0]![1]!); context.lineTo(to[1]![0]!, to[1]![1]!); context.lineTo(to[2]![0]!, to[2]![1]!); context.closePath(); context.clip();
    context.globalAlpha = (blend[ids[0]!]! + blend[ids[1]!]! + blend[ids[2]!]!) / 3;
    context.transform(...affine); context.drawImage(photo, 0, 0); context.restore();
  }
  const map = new THREE.CanvasTexture(canvas); map.colorSpace = THREE.SRGBColorSpace;
  map.userData.connectedFaceAtlas = true;
  // glTF UVs and CanvasTexture disagree on Y; our atlas has already been baked
  // in image coordinates. CanvasTexture default flipY=true matches (1-v) above.
  map.flipY = true;
  const materials = sourceMaterials.map(original => {
    const material = original.clone() as THREE.MeshStandardMaterial;
    material.map = map; material.color.set(0xffffff); material.roughness = 0.82; material.metalness = 0;
    material.userData.connectedPhotoSkin = true; return material;
  });
  return Array.isArray(mesh.material) ? materials : materials[0]!;
}

function featherPhoto(face: BuiltFace) {
  const canvas = document.createElement("canvas"); canvas.width = face.texture.width; canvas.height = face.texture.height;
  const ctx = canvas.getContext("2d")!; ctx.drawImage(face.texture, 0, 0);
  const mask = document.createElement("canvas"); mask.width = canvas.width; mask.height = canvas.height;
  const m = mask.getContext("2d")!; m.fillStyle = "white"; m.filter = "blur(8px)"; m.beginPath();
  OVAL.forEach((id, k) => { const x = face.uvs[id * 2]! * mask.width, y = (1 - face.uvs[id * 2 + 1]!) * mask.height; if (k === 0) m.moveTo(x,y); else m.lineTo(x,y); });
  m.closePath(); m.fill(); ctx.globalCompositeOperation = "destination-in"; ctx.drawImage(mask,0,0); return canvas;
}

function triangleAffine(from: number[][], to: number[][]): [number,number,number,number,number,number] | null {
  const [a,b,c] = from as [number[],number[],number[]];
  const d = a[0]! * (b[1]! - c[1]!) + b[0]! * (c[1]! - a[1]!) + c[0]! * (a[1]! - b[1]!);
  if (Math.abs(d) < 1e-5) return null;
  const solve = (k: number) => {
    const [p,q,r] = to.map(point => point[k]!) as [number,number,number];
    return [(p*(b[1]!-c[1]!)+q*(c[1]!-a[1]!)+r*(a[1]!-b[1]!))/d, (p*(c[0]!-b[0]!)+q*(a[0]!-c[0]!)+r*(b[0]!-a[0]!))/d, (p*(b[0]!*c[1]!-c[0]!*b[1]!)+q*(c[0]!*a[1]!-a[0]!*c[1]!)+r*(a[0]!*b[1]!-b[0]!*a[1]!))/d];
  };
  const x = solve(0), y = solve(1); return [x[0]!,y[0]!,x[1]!,y[1]!,x[2]!,y[2]!];
}