import * as THREE from "three";
import type { HairId, OutfitId, SkinId } from "@/lib/avatar/constants";
type LegacyProceduralBodyId = "slim" | "balanced" | "athletic" | "solid";

const SKIN: Record<SkinId, string> = {
  porcelain: "#f2d3c4",
  sand: "#e0b08a",
  amber: "#c68642",
  bronze: "#8d5524",
  deep: "#4b2e1f",
};

const SPECS: Record<LegacyProceduralBodyId, { shoulder: number; waist: number; hip: number; arm: number; leg: number }> = {
  slim: { shoulder: 0.16, waist: 0.11, hip: 0.135, arm: 0.038, leg: 0.052 },
  balanced: { shoulder: 0.19, waist: 0.135, hip: 0.16, arm: 0.046, leg: 0.06 },
  athletic: { shoulder: 0.23, waist: 0.15, hip: 0.165, arm: 0.056, leg: 0.064 },
  solid: { shoulder: 0.21, waist: 0.175, hip: 0.2, arm: 0.052, leg: 0.072 },
};

const CLOTH: Record<OutfitId, string> = {
  tee: "#f4efe6",
  hoodie: "#1f6f66",
  jacket: "#2a313a",
  dress: "#e0943a",
  layers: "#243028",
};

export function buildCharacter(options: { body: LegacyProceduralBodyId; outfit: OutfitId; hair: HairId; skin: SkinId }) {
  const spec = SPECS[options.body];
  const geometries: THREE.BufferGeometry[] = [];
  const materials: THREE.Material[] = [];
  const skinMat = new THREE.MeshStandardMaterial({ color: SKIN[options.skin], roughness: 0.62, metalness: 0.02 });
  const clothMat = new THREE.MeshStandardMaterial({ color: CLOTH[options.outfit], roughness: 0.72, metalness: 0.04 });
  const hairMat = new THREE.MeshStandardMaterial({ color: "#1c140f", roughness: 0.8, metalness: 0.02 });
  const accent = new THREE.MeshStandardMaterial({ color: "#f0a202", roughness: 0.45, metalness: 0.08 });
  const paper = new THREE.MeshStandardMaterial({ color: "#f4efe6", roughness: 0.75, metalness: 0.02 });
  materials.push(skinMat, clothMat, hairMat, accent, paper);

  const geo = <T extends THREE.BufferGeometry>(g: T) => {
    geometries.push(g);
    return g;
  };

  const root = new THREE.Group();
  root.name = "Avatar";

  const legCyl = 0.58;
  const legGeo = geo(new THREE.CapsuleGeometry(spec.leg, legCyl, 4, 12));
  const legTotal = legCyl + spec.leg * 2;
  const hipY = legTotal * 0.9;
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(legGeo, skinMat);
    leg.name = "Body";
    leg.position.set(side * spec.hip * 0.38, legTotal / 2, 0);
    leg.castShadow = false;
    root.add(leg);
    const foot = new THREE.Mesh(geo(new THREE.SphereGeometry(spec.leg * 1.15, 16, 12)), skinMat);
    foot.scale.set(1.15, 0.45, 1.7);
    foot.position.set(side * spec.hip * 0.38, spec.leg * 0.35, 0.03);
    root.add(foot);
  }

  const torsoH = 0.5;
  const torso = new THREE.Mesh(geo(torsoGeometry(spec, torsoH)), skinMat);
  torso.name = "Body";
  torso.position.y = hipY;
  root.add(torso);

  const shoulderY = hipY + torsoH * 0.82;
  const armCyl = 0.4;
  const armGeo = geo(new THREE.CapsuleGeometry(spec.arm, armCyl, 4, 10));
  const armTotal = armCyl + spec.arm * 2;
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(armGeo, skinMat);
    arm.name = "Body";
    arm.position.set(side * (spec.shoulder + spec.arm * 0.25), shoulderY - armTotal / 2 + spec.arm, 0);
    root.add(arm);
    const hand = new THREE.Mesh(geo(new THREE.SphereGeometry(spec.arm * 1.15, 14, 10)), skinMat);
    hand.position.set(side * (spec.shoulder + spec.arm * 0.25), shoulderY - armTotal + spec.arm, 0);
    root.add(hand);
  }

  const neck = new THREE.Mesh(geo(new THREE.CylinderGeometry(0.042, 0.05, 0.09, 16)), skinMat);
  neck.position.y = shoulderY + 0.06;
  root.add(neck);

  const head = new THREE.Group();
  head.name = "HeadAnchor";
  head.position.set(0, shoulderY + 0.2, 0);
  root.add(head);

  const cranium = new THREE.Mesh(geo(new THREE.SphereGeometry(0.118, 32, 24)), skinMat);
  cranium.name = "Cranium";
  cranium.scale.set(0.92, 1.06, 0.78);
  cranium.position.z = -0.012;
  head.add(cranium);

  const earGeo = geo(new THREE.SphereGeometry(0.022, 12, 10));
  for (const side of [-1, 1]) {
    const ear = new THREE.Mesh(earGeo, skinMat);
    ear.position.set(side * 0.108, -0.008, -0.01);
    ear.scale.set(0.55, 1, 0.7);
    head.add(ear);
  }

  addOutfit(head, root, options.outfit, spec, torsoH, hipY, geo, clothMat, accent, paper);
  addHair(head, options.hair, geo, hairMat);
  addProxyFace(head, geo, materials);

  root.userData.geometries = geometries;
  root.userData.materials = materials;
  return root;
}

function torsoGeometry(spec: (typeof SPECS)[LegacyProceduralBodyId], h: number) {
  const pts = [
    new THREE.Vector2(spec.hip * 0.72, 0),
    new THREE.Vector2(spec.hip, h * 0.14),
    new THREE.Vector2(spec.waist, h * 0.42),
    new THREE.Vector2(spec.waist * 1.04, h * 0.58),
    new THREE.Vector2(spec.shoulder * 0.92, h * 0.82),
    new THREE.Vector2(spec.shoulder * 0.55, h * 0.95),
    new THREE.Vector2(0.05, h),
  ];
  return new THREE.LatheGeometry(pts, 28);
}

function addOutfit(
  head: THREE.Group,
  root: THREE.Group,
  outfit: OutfitId,
  spec: (typeof SPECS)[LegacyProceduralBodyId],
  torsoH: number,
  hipY: number,
  geo: <T extends THREE.BufferGeometry>(g: T) => T,
  clothMat: THREE.Material,
  accent: THREE.Material,
  paper: THREE.Material,
) {
  if (outfit === "tee" || outfit === "layers") {
    const tee = new THREE.Mesh(geo(torsoGeometry({ ...spec, hip: spec.hip * 1.04, waist: spec.waist * 1.06, shoulder: spec.shoulder * 1.04 }, torsoH * 0.78)), outfit === "tee" ? clothMat : paper);
    tee.name = "Outfit";
    tee.position.y = hipY + torsoH * 0.16;
    root.add(tee);
  }
  if (outfit === "hoodie" || outfit === "jacket" || outfit === "layers") {
    const shell = new THREE.Mesh(
      geo(torsoGeometry(
        { ...spec, hip: spec.hip * 1.08, waist: spec.waist * 1.1, shoulder: spec.shoulder * 1.08 },
        outfit === "layers" ? torsoH * 0.7 : torsoH * 0.92,
      )),
      clothMat,
    );
    shell.name = "Outfit";
    shell.position.y = hipY + (outfit === "layers" ? torsoH * 0.22 : torsoH * 0.06);
    root.add(shell);
  }
  if (outfit === "hoodie") {
    const hood = new THREE.Mesh(geo(new THREE.SphereGeometry(0.132, 24, 16, 0, Math.PI * 2, 0.15, Math.PI * 0.72)), clothMat);
    hood.name = "Outfit";
    hood.scale.set(1.02, 1.05, 0.82);
    hood.position.set(0, 0.02, -0.04);
    head.add(hood);
  }
  if (outfit === "jacket") {
    const stripe = new THREE.Mesh(geo(new THREE.BoxGeometry(0.012, torsoH * 0.62, 0.01)), accent);
    stripe.position.set(0, hipY + torsoH * 0.42, spec.waist + 0.02);
    root.add(stripe);
  }
  if (outfit === "dress") {
    const bodice = new THREE.Mesh(geo(torsoGeometry({ ...spec, hip: spec.hip * 1.02, waist: spec.waist * 1.02, shoulder: spec.shoulder }, torsoH * 0.62)), clothMat);
    bodice.name = "Outfit";
    bodice.position.y = hipY + torsoH * 0.28;
    root.add(bodice);
    const skirt = new THREE.Mesh(geo(new THREE.ConeGeometry(spec.hip * 1.55, 0.46, 28, 1, true)), clothMat);
    skirt.name = "Outfit";
    skirt.position.y = hipY - 0.08;
    root.add(skirt);
  }
}

function addHair(head: THREE.Group, hair: HairId, geo: <T extends THREE.BufferGeometry>(g: T) => T, hairMat: THREE.Material) {
  if (hair === "none") return;
  const cap = new THREE.Mesh(geo(new THREE.SphereGeometry(0.122, 24, 16, 0, Math.PI * 2, 0, Math.PI * 0.52)), hairMat);
  cap.name = "Hair";
  cap.scale.set(1.02, 0.78, 1.02);
  cap.position.y = 0.05;
  head.add(cap);
  if (hair === "long") {
    const back = new THREE.Mesh(geo(new THREE.CapsuleGeometry(0.07, 0.26, 4, 10)), hairMat);
    back.name = "Hair";
    back.position.set(0, -0.12, -0.07);
    head.add(back);
  }
}

function addProxyFace(head: THREE.Group, geo: <T extends THREE.BufferGeometry>(g: T) => T, materials: THREE.Material[]) {
  const white = new THREE.MeshStandardMaterial({ color: "#f7f3ee", roughness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: "#1a1612", roughness: 0.45 });
  materials.push(white, dark);
  const eyeGeo = geo(new THREE.SphereGeometry(0.018, 16, 12));
  const pupilGeo = geo(new THREE.SphereGeometry(0.008, 12, 8));
  for (const side of [-1, 1]) {
    const group = new THREE.Group();
    group.name = side < 0 ? "ProxyEyeL" : "ProxyEyeR";
    const ball = new THREE.Mesh(eyeGeo, white);
    const pupil = new THREE.Mesh(pupilGeo, dark);
    pupil.position.z = 0.012;
    group.add(ball, pupil);
    group.position.set(side * 0.038, 0.018, 0.09);
    head.add(group);
  }
  const mouth = new THREE.Mesh(geo(new THREE.SphereGeometry(0.028, 16, 12)), dark);
  mouth.name = "ProxyMouth";
  mouth.scale.set(1.25, 0.22, 0.45);
  mouth.position.set(0, -0.045, 0.098);
  head.add(mouth);
}

export function disposeCharacter(root: THREE.Object3D) {
  const geometries = root.userData.geometries as THREE.BufferGeometry[] | undefined;
  const materials = root.userData.materials as THREE.Material[] | undefined;
  geometries?.forEach((geometry) => geometry.dispose());
  materials?.forEach((material) => material.dispose());
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry?.dispose();
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const mat of mats) {
      if (mat && "map" in mat && mat.map instanceof THREE.Texture) mat.map.dispose();
      mat?.dispose();
    }
  });
}
