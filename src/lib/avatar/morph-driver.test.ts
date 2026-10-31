import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { ARKIT_BLENDSHAPE_NAMES } from "./arkit.ts";
import { applyMorphs, inspectMorphs } from "./morph-driver.ts";

function fixture(name = "AvatarAceGeneratedHeadMesh", zero = false) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.Float32BufferAttribute([0, 0, 0, 0.01, 0, 0, 0, 0.01, 0], 3));
  geometry.morphTargetsRelative = true;
  geometry.morphAttributes.position = ARKIT_BLENDSHAPE_NAMES.map((name) => {
    const attribute = new THREE.Float32BufferAttribute([zero ? 0 : 0.008, 0, 0, 0, 0, 0, 0, 0, 0], 3);
    attribute.name = name;
    return attribute;
  });
  const mesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial());
  mesh.name = name;
  return mesh;
}

test("every ARKit channel changes native mesh vertex positions independently", () => {
  const mesh = fixture();
  for (const name of ARKIT_BLENDSHAPE_NAMES) {
    applyMorphs(mesh, { [name]: 1 }, 1);
    assert.equal(mesh.morphTargetInfluences!.filter((value) => value !== 0).length, 1);
    const position = mesh.getVertexPosition(0, new THREE.Vector3());
    assert.ok(Math.abs(position.x - 0.008) < 1e-8, name);
    applyMorphs(mesh, {}, 1);
    assert.equal(mesh.getVertexPosition(0, new THREE.Vector3()).x, 0);
  }
});

test("sparse tracking loss and released manual controls restore native neutral", () => {
  const root = new THREE.Group(), mesh = fixture();
  root.add(mesh);
  applyMorphs(root, { mouthSmileLeft: 0.8, jawOpen: 1 }, 1);
  applyMorphs(root, { browInnerUp: 0.5 }, 1);
  assert.equal(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.jawOpen], 0);
  assert.equal(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.mouthSmileLeft], 0);
  assert.equal(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.browInnerUp], 0.5);
});

test("finite clamped weights and saved expression defaults cannot poison vertices", () => {
  const mesh = fixture();
  applyMorphs(mesh, { jawOpen: NaN, mouthSmileLeft: Infinity, browInnerUp: 4, mouthClose: -2 }, NaN);
  assert.ok(mesh.morphTargetInfluences!.every(Number.isFinite));
  assert.equal(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.browInnerUp], 1);
  applyMorphs(mesh, { jawOpen: 1 }, -1);
  assert.ok(mesh.morphTargetInfluences!.every((value) => value === 0));
});

test("captured photo baseline and explicit zero are preserved", () => {
  const mesh = fixture("AvatarAcePhotoFace");
  mesh.userData.avatarPhotoFaceBaseline = mesh.morphTargetInfluences!.map(() => 0.2);
  applyMorphs(mesh, { jawOpen: 0 }, 1);
  assert.equal(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.jawOpen], 0);
  assert.equal(mesh.morphTargetInfluences![mesh.morphTargetDictionary!.browInnerUp], 0.2);
});

test("body and commissioned animation weights are not erased on sparse frames", () => {
  const mesh = fixture("CommissionedFace");
  mesh.morphTargetInfluences![0] = 0.6;
  applyMorphs(mesh, {}, 1);
  assert.equal(mesh.morphTargetInfluences![0], 0.6);
});

test("diagnostics distinguish missing, zero, and genuinely deforming targets", () => {
  const staticMesh = new THREE.Mesh(new THREE.BoxGeometry(), new THREE.MeshStandardMaterial());
  assert.match(inspectMorphs(staticMesh).warning!, /no facial blendshapes/);
  const zero = inspectMorphs(fixture("AvatarAceGeneratedHeadMesh", true));
  assert.equal(zero.inactive.length, 52);
  assert.match(zero.warning!, /zero or unusable/);
  const moving = inspectMorphs(fixture());
  assert.equal(moving.names.length, 52);
  assert.equal(moving.inactive.length, 0);
  assert.equal(moving.warning, undefined);
});

test("absolute morph buffers are inspected as offsets from neutral", () => {
  const mesh = fixture();
  mesh.geometry.morphTargetsRelative = false;
  mesh.geometry.morphAttributes.position = mesh.geometry.morphAttributes.position!.map((attribute) => {
    const clone = mesh.geometry.getAttribute("position").clone();
    clone.name = attribute.name;
    return clone;
  });
  assert.equal(inspectMorphs(mesh).inactive.length, 52);
});