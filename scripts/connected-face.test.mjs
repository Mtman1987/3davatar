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
    const root = await load(sex); const meshes=[];const objects=[];
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
      for(let i=0;i<next.length;i+=3){
        assert.ok(Math.abs(next[i]-position[i])<1e-6);assert.ok(Math.abs(next[i+1]-position[i+1])<1e-6);
        if(next[i+2]!==position[i+2])changed++;
        assert.ok(Number.isFinite(next[i+2]));
        if(position[i+1]<1.3)assert.equal(next[i+2],position[i+2],"body below head remains unchanged");
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