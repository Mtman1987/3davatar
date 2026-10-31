import { test } from "node:test";
import assert from "node:assert/strict";
import * as THREE from "three";
import { animateFittedEye, deformFittedEye, makeFittedEye, matchFittedLidMaterials } from "./generated-eye.ts";
import { animateGeneratedFacialAnatomy, buildGeneratedFacialAnatomy } from "./generated-anatomy.ts";
import { applyGeneratedHeadPose } from "./generated-motion.ts";

export function eyeFixture(frontSign = 1) {
  const rings = [
    [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
    [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
  ];
  const points: [number, number, number][] = Array.from({ length: 478 }, () => [0, 0, 0]);
  for (let side = 0; side < 2; side++) {
    const x = side === 0 ? -0.032 : 0.032;
    rings[side].forEach((index, j) => {
      const a = Math.PI + j * Math.PI / 8;
      points[index] = [x + Math.cos(a) * 0.015, 0.02 + Math.sin(a) * 0.006, frontSign * 0.09];
    });
    const iris = side === 0 ? 468 : 473;
    points[iris] = [x, 0.02, frontSign * 0.09];
    for (let j = 1; j <= 4; j++) points[iris + j] = [x + Math.cos(j * Math.PI / 2) * 0.007, 0.02 + Math.sin(j * Math.PI / 2) * 0.007, frontSign * 0.09];
  }
  points[1] = [0, 0, frontSign * 0.11];
  const lips = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];
  lips.forEach((index, j) => { const a = Math.PI + j * Math.PI / 10; points[index] = [Math.cos(a) * 0.02, -0.035 + Math.sin(a) * 0.002, frontSign * 0.085]; });
  return { points, rings, landmark_count: 478 };
}
function eye() {
  const fixture = eyeFixture();
  return makeFittedEye(fixture.points, 468, fixture.rings[0], new THREE.MeshStandardMaterial({ color: 0x8c6652 }), "Left", 1);
}

test("neutral eye and thin lids stay inside the measured socket", () => {
  const root = eye(), data = root.userData.fittedEye;
  assert.equal(root.position.x, -0.032);
  const pos = data.surface.geometry.getAttribute("position");
  for (let i = 0; i < pos.count; i++) {
    assert.ok(Math.abs(pos.getX(i)) <= 0.015001);
    assert.ok(Math.abs(pos.getY(i)) <= 0.006001);
  }
  const upper = data.upperLid.geometry.getAttribute("position");
  for (let i = 0; i < upper.count; i += 2) assert.ok(Math.abs(upper.getY(i) - upper.getY(i + 1)) <= 0.0011, "rest lid is a thin margin, not a full-height brow patch");
  assert.equal(data.upperLid.userData.avatarSkinToneMultiplier, 1);
});

test("100% closure meets on one seam and hides sclera; reopening restores it", () => {
  const root = eye(), data = root.userData.fittedEye;
  deformFittedEye(root, 1, 1);
  const upper = data.upperLid.geometry.getAttribute("position"), lower = data.lowerLid.geometry.getAttribute("position");
  for (let i = 0; i < upper.count; i += 2) assert.ok(Math.abs(upper.getY(i + 1) - lower.getY(i)) < 1e-8);
  assert.equal(data.surface.visible, false);
  deformFittedEye(root, 0, 0);
  assert.equal(data.surface.visible, true);
});

test("paired ARKit gaze translates irises together, never lids or sockets", () => {
  const fixture = eyeFixture();
  const roots = fixture.rings.map((ring, i) => makeFittedEye(fixture.points, i === 0 ? 468 : 473, ring, new THREE.MeshStandardMaterial(), i === 0 ? "Left" : "Right", 1));
  const initial = roots.map((r) => r.position.clone());
  const lidPositions = roots.map((r) => Array.from(r.userData.fittedEye.upperLid.geometry.getAttribute("position").array));
  const weights = { eyeLookOutLeft: 1, eyeLookInRight: 1, eyeBlinkLeft: 0, eyeBlinkRight: 0 };
  for (let j = 0; j < 60; j++) roots.forEach((r, i) => animateFittedEye(r, i === 0 ? "Left" : "Right", weights, 0, 1 / 60));
  roots.forEach((r, i) => {
    assert.ok(r.position.equals(initial[i]));
    assert.ok(r.quaternion.equals(new THREE.Quaternion()));
    assert.ok(r.userData.fittedEye.iris.value.x < 0);
    assert.deepEqual(Array.from(r.userData.fittedEye.upperLid.geometry.getAttribute("position").array), lidPositions[i]);
  });
});

test("manual/live open and close override autonomous blink", () => {
  const root = eye();
  animateFittedEye(root, "Left", { eyeBlinkLeft: 0 }, 1, 1 / 60);
  assert.equal(root.userData.closure, 0);
  animateFittedEye(root, "Left", { eyeBlinkLeft: 1 }, 0, 1 / 60);
  assert.equal(root.userData.fittedEye.surface.visible, false);
});

test("skin UV projection uses existing head albedo rather than a pale swatch", () => {
  const root = eye(), geometry = new THREE.PlaneGeometry(0.15, 0.15);
  geometry.translate(0, 0, 0.09);
  const material = new THREE.MeshStandardMaterial({ color: 0xffffff, map: new THREE.Texture() });
  matchFittedLidMaterials(root, geometry, material);
  const lid = root.userData.fittedEye.upperLid;
  assert.equal(lid.material.map, material.map);
  assert.equal(lid.material.color.getHex(), 0xffffff);
  const uv = lid.geometry.getAttribute("uv");
  for (let i = 0; i < uv.count; i++) assert.ok(uv.getX(i) >= 0 && uv.getX(i) <= 1 && uv.getY(i) >= 0 && uv.getY(i) <= 1);
});

test("anatomy preserves bind pose and offsets, and rejects NaN animation inputs", () => {
  for (const frontSign of [1, -1]) {
    const root = buildGeneratedFacialAnatomy(eyeFixture(frontSign))!;
    const jaw = new THREE.Bone(); jaw.rotation.set(0.12, 0.08, -0.04);
    const bind = jaw.quaternion.clone();
    animateGeneratedFacialAnatomy(root, { eyeLookInLeft: NaN, jawOpen: NaN }, NaN, NaN, jaw, NaN, NaN);
    assert.ok(jaw.quaternion.angleTo(bind) < 1e-7);
    root.traverse((object) => assert.ok([...object.position.toArray(), ...object.quaternion.toArray()].every(Number.isFinite)));
    const eyes = root.userData.avatarAceAnatomy.eyes;
    assert.ok(Math.abs(eyes[0].position.z - frontSign * 0.09) < 1e-8);
    animateGeneratedFacialAnatomy(root, { jawOpen: 1 }, 1 / 60, 0.28, jaw, -0.01);
    assert.ok(Math.abs(eyes[0].position.z - frontSign * 0.08) < 1e-8);
    animateGeneratedFacialAnatomy(root, {}, 1 / 60, 0.28, jaw);
    assert.ok(jaw.quaternion.angleTo(bind) < 1e-7);
  }
});

test("head pose is bounded, smooth, and preserves bind orientation", () => {
  const head = new THREE.Bone(); head.rotation.set(0.1, -0.1, 0.05);
  const bind = head.quaternion.clone();
  applyGeneratedHeadPose(head, { x: 50, y: 50, z: 50 }, 1 / 60);
  assert.ok(head.quaternion.angleTo(bind) < 0.3);
  for (let i = 0; i < 180; i++) applyGeneratedHeadPose(head, null, 1 / 60);
  assert.ok(head.quaternion.angleTo(bind) < 1e-6);
  applyGeneratedHeadPose(head, { x: NaN, y: Infinity, z: 0 }, NaN);
  assert.ok(head.quaternion.toArray().every(Number.isFinite));
});