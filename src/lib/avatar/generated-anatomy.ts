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
  const mouthDepth = Math.max(...lipPoints.map((p) => p.z)) + 0.008;
  const mouth = new THREE.Group();
  mouth.name = "AvatarAceArticulatedMouth";
  const cavityPoints = lipPoints.map((p) => new THREE.Vector3(p.x, p.y, mouthDepth));
  const cavity = new THREE.Mesh(
    new THREE.ShapeGeometry(polygon(cavityPoints)),
    new THREE.MeshStandardMaterial({ color: 0x35151a, roughness: 0.95, side: THREE.DoubleSide }),
  );
  cavity.name = "AvatarAceMouthCavity";
  mouth.add(cavity);

  const mouthWidth = Math.max(...lipPoints.map((p) => p.x)) - Math.min(...lipPoints.map((p) => p.x));
  const mouthHeight = Math.max(...lipPoints.map((p) => p.y)) - Math.min(...lipPoints.map((p) => p.y));
  const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xf4eee1, roughness: 0.24 });
  const toothWidth = mouthWidth * 0.105;
  for (let i = 0; i < 6; i++) {
    const x = mouthCenter.x + (i - 2.5) * toothWidth * 0.91;
    for (const upper of [true, false]) {
      const tooth = new THREE.Mesh(new THREE.BoxGeometry(toothWidth * 0.86, Math.max(mouthHeight * 0.22, 0.003), mouthWidth * 0.055), toothMaterial);
      tooth.name = (upper ? "AvatarAceUpperTooth_" : "AvatarAceLowerTooth_") + i;
      tooth.position.set(x, mouthCenter.y + (upper ? mouthHeight * 0.22 : -mouthHeight * 0.22), mouthDepth + 0.012);
      mouth.add(tooth);
    }
  }
  const tongue = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(mouthWidth * 0.19, 0.004), 20, 12),
    new THREE.MeshStandardMaterial({ color: 0xa94f59, roughness: 0.62 }),
  );
  tongue.name = "AvatarAceTongue";
  tongue.scale.set(1.25, 0.32, 0.34);
  tongue.position.set(mouthCenter.x, mouthCenter.y - mouthHeight * 0.23, mouthDepth + 0.016);
  mouth.add(tongue);
  mouth.position.set(0, 0, 0);
  mouth.userData.mouthCenterY = mouthCenter.y;
  mouth.userData.neutralMouthHeight = Math.max(mouthHeight, 0.002);
  root.add(mouth);
  root.userData.avatarAceAnatomy = { eyes: root.children.slice(0, 2), mouth };
  return root;
}

export function animateGeneratedFacialAnatomy(root: THREE.Object3D, weights: Record<string, number>, delta: number, blinkSpeed = 0.28) {
  const data = root.userData.avatarAceAnatomy as { eyes: THREE.Group[]; mouth: THREE.Group } | undefined;
  if (!data) return;
  const clock = Number(root.userData.autoBlinkClock ?? 0) + Math.max(0, delta);
  root.userData.autoBlinkClock = clock % 10;
  const cycle = (clock * Math.max(0, blinkSpeed)) % 1;
  const autoBlink = cycle < 0.055 ? Math.sin((cycle / 0.055) * Math.PI) : 0;
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
  const jaw = THREE.MathUtils.clamp(weights.jawOpen ?? 0, 0, 1);
  const mouth = data.mouth;
  const centerY = Number(mouth.userData.mouthCenterY ?? 0);
  const opening = 1 + jaw * 1.8;
  mouth.scale.y = opening;
  mouth.position.y = centerY * (1 - opening);
}
