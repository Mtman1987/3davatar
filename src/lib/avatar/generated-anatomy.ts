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

function makeEye(points: [number, number, number][], centerIndex: number, ring: number[], skin: THREE.Material, side: string, frontSign: number) {
  const eye = new THREE.Group();
  eye.name = "AvatarAceEye_" + side;
  const contour = ring.map((index) => point(points, index));
  // Iris landmarks (468/473) sit on the FRONT surface of the eye; they are
  // not the eyeball centre. Derive the globe centre from the eyelid aperture
  // and recess it behind the face instead of placing a full sphere at the iris.
  const irisCenter = point(points, centerIndex);
  const center = contour.reduce((sum, p) => sum.add(p), new THREE.Vector3()).multiplyScalar(1 / contour.length);
  const width = Math.max(...contour.map((p) => p.x)) - Math.min(...contour.map((p) => p.x));
  const height = Math.max(...contour.map((p) => p.y)) - Math.min(...contour.map((p) => p.y));
  const radius = Math.max(width * 0.49, height * 0.82, 0.004);
  const lidDepth = contour.reduce((sum, p) => sum + p.z, 0) / contour.length;
  const eyeball = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 24),
    new THREE.MeshStandardMaterial({ color: 0xf4eee5, roughness: 0.24 }),
  );
  eyeball.name = "AvatarAceEyeball_" + side;
  eyeball.position.set(center.x, center.y, lidDepth - frontSign * radius * 0.24);
  eyeball.scale.set(width * 0.51, Math.max(height * 0.76, width * 0.20), radius * 0.62);
  eye.add(eyeball);

  // The iris landmarks anchor a layered iris/pupil on the globe surface.
  // These are small surface details, not additional protruding eyeballs.
  const irisRadius = Math.max(width * 0.19, 0.0012);
  const iris = new THREE.Mesh(
    new THREE.SphereGeometry(1, 32, 20),
    new THREE.MeshStandardMaterial({ color: 0x59402d, roughness: 0.34 }),
  );
  iris.name = "AvatarAceIris_" + side;
  // Place iris on the visible front surface of the globe. Using the iris
  // landmark's raw Z put it inside the eyeball on this export convention,
  // which made the eye appear completely white.
  iris.position.set(eyeball.position.x + (irisCenter.x - center.x), eyeball.position.y + (irisCenter.y - center.y), eyeball.position.z + frontSign * (eyeball.scale.z + irisRadius * 0.025));
  iris.scale.set(irisRadius, irisRadius, irisRadius * 0.16);
  eye.add(iris);

  const pupil = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshStandardMaterial({ color: 0x100d0b, roughness: 0.16 }),
  );
  pupil.name = "AvatarAcePupil_" + side;
  pupil.position.set(iris.position.x, iris.position.y, iris.position.z + frontSign * irisRadius * 0.12);
  pupil.scale.set(irisRadius * 0.39, irisRadius * 0.39, irisRadius * 0.10);
  eye.add(pupil);

  const cornea = new THREE.Mesh(
    new THREE.SphereGeometry(1, 24, 16),
    new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.06, transmission: 0.08, transparent: true, opacity: 0.18, depthWrite: false }),
  );
  cornea.name = "AvatarAceCornea_" + side;
  cornea.position.copy(iris.position);
  cornea.position.z += frontSign * irisRadius * 0.20;
  cornea.scale.set(irisRadius * 1.12, irisRadius * 1.12, irisRadius * 0.20);
  eye.add(cornea);

  // Build separate upper and lower fitted lid patches. Each patch collapses
  // to the measured lid margin when open, then advances across half the eye
  // aperture when closing. Both sit in front of the eyeball, not behind it.
  const upperArc = contour.filter((p) => p.y >= center.y).sort((a, b) => a.x - b.x);
  const lowerArc = contour.filter((p) => p.y < center.y).sort((a, b) => a.x - b.x);
  const left = contour.reduce((best, p) => p.x < best.x ? p : best, contour[0]);
  const right = contour.reduce((best, p) => p.x > best.x ? p : best, contour[0]);
  const makeLid = (arc: THREE.Vector3[], upper: boolean) => {
    const shape = new THREE.Shape();
    if (upper) {
      shape.moveTo(left.x, center.y);
      for (const p of arc) shape.lineTo(p.x, p.y);
      shape.lineTo(right.x, center.y);
    } else {
      shape.moveTo(left.x, center.y);
      for (const p of arc) shape.lineTo(p.x, p.y);
      shape.lineTo(right.x, center.y);
    }
    shape.closePath();
    const mesh = new THREE.Mesh(new THREE.ShapeGeometry(shape, 16), skin.clone());
    mesh.name = "AvatarAce" + (upper ? "Upper" : "Lower") + "BlinkLid_" + side;
    mesh.geometry.translate(0, -center.y, 0);
    mesh.position.set(0, center.y, lidDepth + frontSign * radius * 0.18);
    mesh.scale.y = 0.001;
    mesh.renderOrder = 5;
    eye.add(mesh);
    return mesh;
  };
  const upperLid = makeLid(upperArc, true);
  const lowerLid = makeLid(lowerArc, false);
  eye.userData.upperBlinkLid = upperLid;
  eye.userData.lowerBlinkLid = lowerLid;
  eye.userData.eyeCenter = center;
  return eye;
}

export function buildGeneratedFacialAnatomy(
  landmarks: GeneratedHeadFacialLandmarks | null | undefined,
  skinColor = 0xd6aa91,
): THREE.Group | null {
  if (!landmarks || landmarks.points.length < 478) return null;
  const points = landmarks.points;
  // MediaPipe/FLAME exports can use either Z convention. Determine the
  // subject's outward-facing direction from the nose tip relative to the eyes
  // instead of assuming positive Z is always toward the camera.
  const eyeDepth = (point(points, 468).z + point(points, 473).z) * 0.5;
  const noseDepth = point(points, 1).z;
  const frontSign = Math.sign(noseDepth - eyeDepth) || 1;
  const root = new THREE.Group();
  root.name = "AvatarAceProceduralFacialAnatomy";
  const skin = new THREE.MeshStandardMaterial({ color: skinColor, roughness: 0.8, side: THREE.DoubleSide });
  root.add(makeEye(points, 468, EYE_RINGS[0], skin, "Left", frontSign));
  root.add(makeEye(points, 473, EYE_RINGS[1], skin, "Right", frontSign));

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
  const frontLipDepth = lipPoints.reduce(
    (front, p) => p.z * frontSign > front * frontSign ? p.z : front,
    lipPoints[0].z,
  );
  const detailDepth = Math.max(mouthWidth * 0.018, 0.0006);
  cavity.position.z = frontLipDepth + frontSign * detailDepth - mouthCenter.z;
  mouth.add(cavity);

  const toothMaterial = new THREE.MeshStandardMaterial({ color: 0xf4eee1, roughness: 0.24 });
  const toothWidth = Math.max(mouthWidth * 0.105, 0.002);
  const toothHeight = Math.max(mouthWidth * 0.055, 0.0015);
  const upperTeeth: THREE.Mesh[] = [];
  const lowerTeeth: THREE.Mesh[] = [];
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * toothWidth * 0.91;
    // Rounded enamel crowns read as teeth at this avatar scale; the previous
    // flat boxes produced a single floating bar. Keep the same jaw-driven
    // positions so speech animation remains unchanged.
    const crownGeometry = new THREE.SphereGeometry(1, 20, 14);
    const upper = new THREE.Mesh(crownGeometry, toothMaterial);
    upper.name = "AvatarAceUpperTooth_" + i;
    upper.position.set(x, neutralGap * 0.42 + toothHeight * 0.5, cavity.position.z + frontSign * detailDepth * 0.55);
    upper.scale.set(toothWidth * 0.43, toothHeight * 0.58, mouthWidth * 0.035);
    mouth.add(upper);
    upperTeeth.push(upper);

    const lower = new THREE.Mesh(crownGeometry.clone(), toothMaterial);
    lower.name = "AvatarAceLowerTooth_" + i;
    lower.position.set(x, -neutralGap * 0.42 - toothHeight * 0.5, cavity.position.z + frontSign * detailDepth * 0.55);
    lower.scale.set(toothWidth * 0.43, toothHeight * 0.58, mouthWidth * 0.035);
    mouth.add(lower);
    lowerTeeth.push(lower);
  }

  const tongue = new THREE.Mesh(
    new THREE.SphereGeometry(Math.max(mouthWidth * 0.19, 0.004), 20, 12),
    new THREE.MeshStandardMaterial({ color: 0xa94f59, roughness: 0.62 }),
  );
  tongue.name = "AvatarAceTongue";
  tongue.scale.set(1.25, 0.32, 0.34);
  tongue.position.set(0, -neutralGap * 0.55, cavity.position.z + frontSign * detailDepth * 0.7);
  mouth.add(tongue);

  // Small fitted mouth-corner anchors make a smile visibly lift and widen the
  // mouth even when the generated head's source morph set is not available.
  const smileCorners = [-1, 1].map((side) => {
    const corner = new THREE.Mesh(
      new THREE.SphereGeometry(Math.max(mouthWidth * 0.035, 0.0015), 12, 8),
      skin.clone(),
    );
    corner.name = side < 0 ? "AvatarAceMouthCornerLeft" : "AvatarAceMouthCornerRight";
    corner.position.set(side * cavityWidth * 0.48, 0, cavity.position.z + frontSign * detailDepth * 0.45);
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
  mouth.userData.tongueBaseZ = tongue.position.z;
  mouth.userData.neutralGap = neutralGap;
  mouth.userData.toothHeight = toothHeight;
  root.add(mouth);
  root.userData.avatarAceAnatomy = { eyes: root.children.slice(0, 2), mouth, frontSign };
  return root;
}

export function animateGeneratedFacialAnatomy(root: THREE.Object3D, weights: Record<string, number>, delta: number, blinkSpeed = 0.28, jawBone?: THREE.Bone | null, eyeDepthOffset = 0) {
  const data = root.userData.avatarAceAnatomy as { eyes: THREE.Group[]; mouth: THREE.Group } | undefined;
  if (!data) return;
  const clock = Number(root.userData.autoBlinkClock ?? 1.25) + Math.max(0, delta);
  root.userData.autoBlinkClock = clock % 20;
  const cycle = (clock * THREE.MathUtils.clamp(blinkSpeed, 0.08, 0.8)) % 1;
  const blinkWindow = 0.11;
  const autoBlink = cycle < blinkWindow ? Math.sin((cycle / blinkWindow) * Math.PI) : 0;
  const frontSign = Number(root.userData.avatarAceAnatomy && (root.userData.avatarAceAnatomy as { frontSign?: number }).frontSign) || 1;
  for (const [index, eye] of data.eyes.entries()) {
    // One shared calibration offset keeps both eyes seated consistently.
    // Negative values recess them into the head; positive values move them out.
    eye.position.z = frontSign * THREE.MathUtils.clamp(eyeDepthOffset, -0.04, 0.04);
    const upperLid = eye.userData.upperBlinkLid as THREE.Mesh | undefined;
    const lowerLid = eye.userData.lowerBlinkLid as THREE.Mesh | undefined;
    if (!upperLid || !lowerLid) continue;
    const name = index === 0 ? "eyeBlinkLeft" : "eyeBlinkRight";
    const squintName = index === 0 ? "eyeSquintLeft" : "eyeSquintRight";
    const target = Math.max(
      autoBlink,
      THREE.MathUtils.clamp(weights[name] ?? weights.eyeBlink ?? 0, 0, 1),
      THREE.MathUtils.clamp((weights[squintName] ?? 0) * 0.42, 0, 1),
    );
    const current = Number(upperLid.userData.blink ?? 0);
    const next = THREE.MathUtils.damp(current, target, 28, Math.max(0, delta));
    upperLid.userData.blink = next;
    lowerLid.userData.blink = next;
    // Near-zero scale is the open resting pose; both fitted lid halves meet
    // only when the blink weight approaches one.
    upperLid.scale.y = 0.001 + next * 0.999;
    lowerLid.scale.y = 0.001 + next * 0.999;
  }
  const jaw = THREE.MathUtils.clamp(
    Math.max(weights.jawOpen ?? 0, weights.mouthOpen ?? 0, weights.viseme_aa ?? 0),
    0, 1,
  );
  const smile = THREE.MathUtils.clamp(
    Math.max(weights.mouthSmileLeft ?? 0, weights.mouthSmileRight ?? 0, weights.mouthSmile ?? 0, weights.smile ?? 0),
    0, 1,
  );
  const close = THREE.MathUtils.clamp(weights.mouthClose ?? 0, 0, 1);
  const round = THREE.MathUtils.clamp(Math.max(weights.mouthFunnel ?? 0, weights.mouthPucker ?? 0), 0, 1);
  const tongueOut = THREE.MathUtils.clamp(weights.tongueOut ?? 0, 0, 1);
  // The exported jaw joint is the skeletal counterpart to the jawOpen
  // morph target. Keep its bind rotation neutral every frame, then apply a
  // restrained anatomical rotation so the lower face and fitted jaw props
  // move together without overpowering the subject-specific morph shape.
  if (jawBone) jawBone.rotation.x = jaw * 0.045;
  const mouth = data.mouth;
  const cavity = mouth.userData.cavity as THREE.Mesh | undefined;
  const lowerTeeth = mouth.userData.lowerTeeth as THREE.Mesh[] | undefined;
  const upperTeeth = mouth.userData.upperTeeth as THREE.Mesh[] | undefined;
  const tongue = mouth.userData.tongue as THREE.Mesh | undefined;
  const corners = mouth.userData.smileCorners as THREE.Mesh[] | undefined;
  const neutralGap = Number(mouth.userData.neutralGap ?? 0.0015);
  const toothHeight = Number(mouth.userData.toothHeight ?? 0.0015);
  const cavityWidth = Number(mouth.userData.cavityWidth ?? 0.02);
  const opening = (1 + jaw * 7) * (1 - close * 0.88);
  const tongueBaseZ = Number(mouth.userData.tongueBaseZ ?? 0);
  // Speech controls aperture and rounding independently. A smile widens the
  // corners; pucker/funnel rounds the opening; mouthClose can bring the lips
  // together without forcing the jaw bone to snap shut.
  if (cavity) {
    cavity.scale.set(1 + smile * 0.2 - round * 0.28, opening * (1 - smile * 0.32), 1);
    cavity.position.y = smile * cavityWidth * 0.025;
  }
  const jawDrop = jaw * Math.max(neutralGap * 5, 0.012);
  for (const tooth of upperTeeth ?? []) tooth.position.y = neutralGap * 0.42 + toothHeight * 0.5 + smile * cavityWidth * 0.025;
  for (const tooth of lowerTeeth ?? []) tooth.position.y = -neutralGap * 0.42 - toothHeight * 0.5 - jawDrop;
  if (tongue) {
    tongue.position.y = -neutralGap * 0.55 - jawDrop * 0.62;
    tongue.position.z = tongueBaseZ + tongueOut * cavityWidth * 0.22;
    tongue.scale.y = 0.32 + tongueOut * 0.12;
  }
  for (const [index, corner] of (corners ?? []).entries()) {
    const side = index === 0 ? -1 : 1;
    corner.position.x = side * cavityWidth * (0.48 + smile * 0.08);
    corner.position.y = smile * cavityWidth * 0.12;
  }
}
