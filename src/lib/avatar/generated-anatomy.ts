import * as THREE from "three";
import type { GeneratedHeadFacialLandmarks } from "@/lib/avatar/generated-head";

const EYE_RINGS = [
  [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246],
  [362, 382, 381, 380, 374, 373, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398],
];
const INNER_LIPS = [78, 95, 88, 178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191];

function point(points: [number, number, number][], index: number): THREE.Vector3 {
  const value = points[index];
  if (!value) throw new Error("Missing facial landmark " + index);
  return new THREE.Vector3(value[0], value[1], value[2]);
}

function polygon(points: THREE.Vector3[]): THREE.Shape {
  const shape = new THREE.Shape();
  shape.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) shape.lineTo(points[i].x, points[i].y);
  shape.closePath();
  return shape;
}

function makeEye(points: [number, number, number][], centerIndex: number, ring: number[], skin: THREE.Material, side: string) {
  const eye = new THREE.Group();
  eye.name = "AvatarAceEye_" + side;
  const contour = ring.map((index) => point(points, index));
  const center = point(points, centerIndex);
  const width = Math.max(...contour.map((p) => p.x)) - Math.min(...contour.map((p) => p.x));
  const height = Math.max(...contour.map((p) => p.y)) - Math.min(...contour.map((p) => p.y));
  const radius = Math.max(width * 0.48, height * 0.9, 0.006);
  const eyeball = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0xf4eee5, roughness: 0.28 }),
  );
  eyeball.name = "AvatarAceEyeball_" + side;
  eyeball.position.set(center.x, center.y, center.z + radius * 0.32);
  eyeball.scale.set(1, Math.max(0.62, height / Math.max(width, 0.001)), 0.72);
  eye.add(eyeball);

  // A fitted lid surface follows this subject's measured eye opening. It is
  // almost edge-on when open and closes over the eyeball during a blink.
  const lidPoints = contour.map((p) => new THREE.Vector3(p.x, p.y, center.z + radius * 0.72));
  const lidGeometry = new THREE.ShapeGeometry(polygon(lidPoints));
  const lid = new THREE.Mesh(lidGeometry, skin.clone());
  lid.name = "AvatarAceBlinkLid_" + side;
  lid.position.set(0, center.y, 0);
  lid.geometry.translate(0, -center.y, 0);
  lid.scale.y = 0.015;
  lid.renderOrder = 5;
  eye.add(lid);
  eye.userData.blinkLid = lid;
  eye.userData.eyeCenter = center;
  return eye;
}

export function buildGeneratedFacialAnatomy(
  landmarks: GeneratedHeadFacialLandmarks | null | undefined,
  skinColor = 0xd6aa91,
): THREE.Group | null {
  if (!landmarks || landmarks.points.length < 478) return null;
  const points = landmarks.points;
  const root = new THREE.Group();
  root.name = "AvatarAceProceduralFacialAnatomy";
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8, side: THREE.DoubleSide });
  root.add(makeEye(points, 468, EYE_RINGS[0], skin, "Left"));
  root.add(makeEye(points, 473, EYE_RINGS[1], skin, "Right"));

  const lipPoints = INNER_LIPS.map((index) => point(points, index));
  const mouthCenter = lipPoints.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / lipPoints.length);
  const mouthWidth = Math.max(...lipPoints.map((p) => p.x)) - Math.min(...lipPoints.map((p) => p.x));
  const measuredHeight = Math.max(...lipPoints.map((p) => p.y)) - Math.min(...lipPoints.map((p) => p.y));
  const mouth = new THREE.Group();
  mouth.name = "AvatarAceArticulatedMouth";
  mouth.position.copy(mouthCenter);

  // Build a real dark opening with a non-zero neutral aperture. Scaling this
  // cavity alone lets the mouth visibly open even when the source photo has
  // its lips together and the inner-lip landmarks have almost no vertical gap.
  const cavityWidth = Math.max(mouthWidth * 0.9, 0.008);
  const neutralGap = Math.max(measuredHeight * 0.55, mouthWidth * 0.018, 0.0015);
  const cavityShape = new THREE.Shape();
  cavityShape.absellipse(0, 0, cavityWidth * 0.5, neutralGap * 0.5, 0, Math.PI * 2, false, 0);
  const cavity = new THREE.Mesh(
    new THREE.ShapeGeometry(cavityShape, 24),
    new THREE.MeshStandardMaterial({ color: 0x35151a, roughness: 0.95, side: THREE.DoubleSide }),
  );
  cavity.name = "AvatarAceMouthCavity";
  cavity.position.z = Math.max(...lipPoints.map((p) => p.z)) + 0.009 - mouthCenter.z;
  mouth.add(cavity);

  const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xf4eee1, roughness: 0.24 });
  const toothWidth = Math.max(mouthWidth * 0.105, 0.002);
  const toothHeight = Math.max(mouthWidth * 0.055, 0.0015);
  const upperTeeth: THREE.Mesh[] = [];
  const lowerTeeth: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * toothWidth * 0.91;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(toothWidth * 0.86, toothHeight, mouthWidth * 0.045), toothMaterial);
    upper.name = "AvatarAceUpperTooth_" + i;
    upper.position.set(x, neutralGap * 0.42 + toothHeight * 0.5, cavity.position.z + 0.012);
    mouth.add(upper);
    upperTeeth.push(upper);

    const lower = new THREE.Mesh(new THREE.BoxGeometry(toothWidth * 0.86, toothHeight, mouthWidth * 0.045), toothMaterial);
    lower.name = "AvatarAceLowerTooth_" + i;
    lower.position.set(x, -neutralGap * 0.42 - toothHeight * 0.5, cavity.position.z + 0.012);
    mouth.add(lower);
    lowerTeeth.push(lower);
  }

  const tongue = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(mouthWidth * 0.19, 0.004), 20, 12),
    new THREE.MeshStandardMaterial({ color: 0xa94f59, roughness: 0.62 }),
  );
  tongue.name = "AvatarAceTongue";
  tongue.scale.set(1.25, 0.32, 0.34);
  tongue.position.set(0, -neutralGap * 0.55, cavity.position.z + 0.016);
  mouth.add(tongue);

  // Small fitted mouth-corner anchors make a smile visibly lift and widen the
  // mouth even when the generated head's source morph set is not available.
  const smileCorners = [-1, 1].map((side) => {
    const corner = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(mouthWidth * 0.035, 0.0015), 12, 8),
      skin.clone(),
    );
    corner.name = side < 0 ? "AvatarAceMouthCornerLeft" : "AvatarAceMouthCornerRight";
    corner.position.set(side * cavityWidth * 0.48, 0, cavity.position.z + 0.006);
    corner.scale.set(1, 0.72, 0.42);
    mouth.add(corner);
    return corner;
  });
  mouth.userData.smileCorners = smileCorners;
  mouth.userData.cavityBaseScale = cavity.scale.clone();
  mouth.userData.cavityBasePosition = cavity.position.clone();
  mouth.userData.cavityWidth = cavityWidth;
  mouth.userData.cavityHeight = neutralGap;
  mouth.userData.cavity = cavity;
  mouth.userData.upperTeeth = upperTeeth;
  mouth.userData.lowerTeeth = lowerTeeth;
  mouth.userData.tongue = tongue;
  mouth.userData.neutralGap = neutralGap;
  mouth.userData.toothHeight = toothHeight;
  root.add(mouth);
  root.userData.avatarAceAnatomy = { eyes: root.children.slice(0, 2), mouth };
  return root;
}

export function animateGeneratedFacialAnatomy(root: THREE.Object3D, weights: Record<string, number>, delta: number, blinkSpeed = 0.28) {
  const data = root.userData.avatarAceAnatomy as { eyes: THREE.Group[]; mouth: THREE.Group } | undefined;
  if (!data) return;
  const clock = Number(root.userData.autoBlinkClock ?? 1.25) + Math.max(0, delta);
  root.userData.autoBlinkClock = clock % 20;
  const cycle = (clock * THREE.MathUtils.clamp(blinkSpeed, 0.08, 0.8)) % 1;
  const blinkWindow = 0.11;
  const autoBlink = cycle < blinkWindow ? Math.sin((cycle / blinkWindow) * Math.PI) : 0;
  for (const [index, eye] of data.eyes.entries()) {
    const lid = eye.userData.blinkLid as THREE.Mesh | undefined;
    if (!lid) continue;
    const name = index === 0 ? "eyeBlinkLeft" : "eyeBlinkRight";
    const target = Math.max(autoBlink, THREE.MathUtils.clamp(weights[name] ?? weights.eyeBlink ?? 0, 0, 1));
    const current = lid.userData.blink ?? 0;
    const next = THREE.MathUtils.damp(current, target, 28, Math.max(0, delta));
    lid.userData.blink = next;
    lid.scale.y = 0.015 + next * 0.985;
  }
  const jaw = THREE.MathUtils.clamp(
    Math.max(weights.jawOpen ?? 0, weights.mouthOpen ?? 0, weights.viseme_aa ?? 0),
    0, 1,
  );
  const smile = THREE.MathUtils.clamp(
    Math.max(weights.mouthSmileLeft ?? 0, weights.mouthSmileRight ?? 0, weights.mouthSmile ?? 0, weights.smile ?? 0),
    0, 1,
  );
  const mouth = data.mouth;
  const cavity = mouth.userData.cavity as THREE.Mesh | undefined;
  const lowerTeeth = mouth.userData.lowerTeeth as THREE.Mesh[] | undefined;
  const upperTeeth = mouth.userData.upperTeeth as THREE.Mesh[] | undefined;
  const tongue = mouth.userData.tongue as THREE.Mesh | undefined;
  const corners = mouth.userData.smileCorners as THREE.Mesh[] | undefined;
  const neutralGap = Number(mouth.userData.neutralGap ?? 0.0015);
  const toothHeight = Number(mouth.userData.toothHeight ?? 0.0015);
  const cavityWidth = Number(mouth.userData.cavityWidth ?? 0.02);
  const opening = 1 + jaw * 7;
  // Talking opens the cavity and lowers the jaw parts; smiling widens the
  // corners and gently flattens the opening instead of fighting jaw motion.
  if (cavity) {
    cavity.scale.set(1 + smile * 0.2, opening * (1 - smile * 0.32), 1);
    cavity.position.y = smile * cavityWidth * 0.025;
  }
  const jawDrop = jaw * Math.max(neutralGap * 5, 0.012);
  for (const tooth of upperTeeth ?? []) tooth.position.y = neutralGap * 0.42 + toothHeight * 0.5 + smile * cavityWidth * 0.025;
  for (const tooth of lowerTeeth ?? []) tooth.position.y = -neutralGap * 0.42 - toothHeight * 0.5 - jawDrop;
  if (tongue) tongue.position.y = -neutralGap * 0.55 - jawDrop * 0.62;
  for (const [index, corner] of (corners ?? []).entries()) {
    const side = index === 0 ? -1 : 1;
    corner.position.x = side * cavityWidth * (0.48 + smile * 0.08);
    corner.position.y = smile * cavityWidth * 0.12;
  }
}
