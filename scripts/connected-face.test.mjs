import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { gunzipSync } from "node:zlib";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { bindConnectedFace } from "../src/lib/avatar/connected-face.ts";

// Recorded from the repository's /samples/portrait.jpg via its actual detector,
// not a mocked face. The source photo is already a supplied runtime sample.
const raw = JSON.parse(gunzipSync(fs.readFileSync(new URL("./fixtures/connected-face-sample.json.gz", import.meta.url))));
const face = { positions: new Float32Array(raw.positions), uvs: new Float32Array(raw.uvs), indices: new Uint32Array(raw.indices), morphs: raw.morphs.map(m => new Float32Array(m)), influences: raw.influences, texture: null };
const options = { headScale: 1, headY: 0, headZ: 0, bakeTexture: false };
async function load(sex) {
  const buffer = fs.readFileSync(new URL(`../public/models/${sex}-base-mesh-base_${sex}.glb`, import.meta.url));
  const gltf = await new GLTFLoader().parseAsync(buffer.buffer.slice(buffer.byteOffset,buffer.byteOffset+buffer.byteLength), "");
  const root = new THREE.Group();root.add(gltf.scene);root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);const scale=2/(bounds.max.y-bounds.min.y);
  root.scale.setScalar(scale);root.position.y=-bounds.min.y*scale;root.updateMatrixWorld(true);
  const center=new THREE.Box3().setFromObject(root).getCenter(new THREE.Vector3());root.position.x-=center.x;root.position.z-=center.z;root.updateMatrixWorld(true);
  return root;
}
for (const sex of ["male", "female"]) {
  test(`${sex}: same topology, skin, UVs, joints, object count; reversible morph transfer`, async () => {
    const root = await load(sex);
    const headBone = root.getObjectByName("head");
    const headWorld = headBone.getWorldPosition(new THREE.Vector3());
    const oval = [10,338,297,332,284,251,389,356,454,323,361,288,397,365,379,378,400,377,152,148,176,149,150,136,172,58,132,93,234,127,162,21,54,103,67,109];
    const sourceBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity };
    for (const id of oval) {
      sourceBounds.minX = Math.min(sourceBounds.minX, face.positions[id * 3]);
      sourceBounds.maxX = Math.max(sourceBounds.maxX, face.positions[id * 3]);
      sourceBounds.minY = Math.min(sourceBounds.minY, face.positions[id * 3 + 1]);
      sourceBounds.maxY = Math.max(sourceBounds.maxY, face.positions[id * 3 + 1]);
    }
    const targetBounds = { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity, minZ: Infinity, maxZ: -Infinity, count: 0 };
    root.traverse(mesh => {
      if (!mesh.isSkinnedMesh || !mesh.geometry.getAttribute("skinIndex")) return;
      const si = mesh.geometry.getAttribute("skinIndex"), sw = mesh.geometry.getAttribute("skinWeight");
      const headJoints = new Set();
      mesh.skeleton.bones.forEach((bone, index) => { for (let p = bone; p; p = p.parent) if (p === headBone) { headJoints.add(index); break; } });
      for (let i = 0; i < mesh.geometry.getAttribute("position").count; i++) {
        let influence = 0;
        for (let k = 0; k < 4; k++) if (headJoints.has(si.getComponent(i, k))) influence += sw.getComponent(i, k);
        if (influence < 0.4) continue;
        const p = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        if (p.z < headWorld.z + 0.025) continue;
        targetBounds.minX = Math.min(targetBounds.minX, p.x); targetBounds.maxX = Math.max(targetBounds.maxX, p.x);
        targetBounds.minY = Math.min(targetBounds.minY, p.y); targetBounds.maxY = Math.max(targetBounds.maxY, p.y);
        targetBounds.minZ = Math.min(targetBounds.minZ, p.z); targetBounds.maxZ = Math.max(targetBounds.maxZ, p.z);
        targetBounds.count++;
      }
    });
    console.log("CONNECTED_FACE_FIT_DIAGNOSTIC", JSON.stringify({ sex, head: headWorld.toArray(), sourceOval: sourceBounds, targetFrontHead: targetBounds }));
    const meshes=[];const objects=[];
    root.traverse(o=>{objects.push(o);if(o.isMesh)meshes.push({mesh:o,geometry:o.geometry,material:o.material,position:o.geometry.getAttribute("position").array.slice()});});
    const beforeBones = objects.filter(o=>o.isBone).map(o=>o.matrixWorld.elements.slice());
    const binding = bindConnectedFace(root,face,options);
    assert.ok(binding.report.changedVertices>1000);assert.equal(binding.report.morphNames.length,52);
    const after=[];root.traverse(o=>after.push(o));assert.deepEqual(after,objects);
    let changed=0;
    for(const {mesh,geometry,position} of meshes){
      assert.deepEqual(mesh.geometry.index?.array,geometry.index?.array);
      for(const name of ["uv","normal","skinIndex","skinWeight"])assert.deepEqual(mesh.geometry.getAttribute(name)?.array,geometry.getAttribute(name)?.array);
      const next=mesh.geometry.getAttribute("position").array;
      const normals=geometry.getAttribute("normal");
      for(let i=0;i<next.length;i+=3){
        assert.ok(Math.abs(next[i]-position[i])<1e-6);assert.ok(Math.abs(next[i+1]-position[i+1])<1e-6);
        if(next[i+2]!==position[i+2])changed++;
        assert.ok(Number.isFinite(next[i+2]));
        if(position[i+1]<1.3)assert.equal(next[i+2],position[i+2],"body below head remains unchanged");
        if(normals && normals.getZ(i/3)<=0.25)assert.equal(next[i+2],position[i+2],"grazing-angle side skin must not receive front-photo projection");
      }
    }
    assert.ok(changed>1000);
    assert.deepEqual(objects.filter(o=>o.isBone).map(o=>o.matrixWorld.elements),beforeBones);
    const main=root.getObjectByName("base"); const jaw=main.geometry.morphAttributes.position[main.morphTargetDictionary.jawOpen];
    assert.ok(jaw.array.some(v=>Math.abs(v)>0.001));
    const blink=main.geometry.morphAttributes.position[main.morphTargetDictionary.eyeBlinkLeft];assert.ok(blink.array.some(v=>Math.abs(v)>0.001));
    // Original skeleton still drives the deformed face and body in the same rig.
    main.morphTargetInfluences[main.morphTargetDictionary.jawOpen]=0.7;
    const positions=main.geometry.getAttribute("position");let top=0;for(let i=1;i<positions.count;i++)if(positions.getY(i)>positions.getY(top))top=i;
    const beforeTurn=main.getVertexPosition(top,new THREE.Vector3());
    const head=root.getObjectByName("head");head.rotation.y+=0.3;root.updateMatrixWorld(true);main.skeleton.update();
    assert.ok(main.getVertexPosition(top,new THREE.Vector3()).distanceTo(beforeTurn)>0.001,"head turn moves the connected surface");
    for(let i=0;i<positions.count;i+=37){const p=main.getVertexPosition(i,new THREE.Vector3());assert.ok(p.toArray().every(Number.isFinite));}
    binding.restore();binding.restore();
    for(const entry of meshes){assert.equal(entry.mesh.geometry,entry.geometry);assert.equal(entry.mesh.material,entry.material);}
    assert.equal(root.getObjectByName("AvatarAcePhotoFace"),undefined);
  });
  test(`${sex}: repeated fit changes do not accumulate geometry`,async()=>{
    const root=await load(sex);const original=root.getObjectByName("base").geometry;
    for(const fit of [{headScale:0.9,headY:-0.01,headZ:0.015},{headScale:1.1,headY:0.005,headZ:-0.01}]){
      const binding=bindConnectedFace(root,face,{...options,...fit});assert.ok(binding.report.changedVertices>0);binding.restore();assert.equal(root.getObjectByName("base").geometry,original);
    }
  });
}
test("unknown/commissioned rigs are rejected instead of guessed or altered",()=>{
  const root=new THREE.Group();assert.throws(()=>bindConnectedFace(root,face,options),/exact head bone/);assert.equal(root.children.length,0);
});