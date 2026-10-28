import * as THREE from "three";
import type { BodyAssetId, HairId, OutfitId } from "@/lib/avatar/constants";

/**
 * Lightweight, procedural wardrobe pieces for the standardized base bodies.
 * Each piece is placed in normalized body space, then attached to the closest
 * matching rig joint with Object3D.attach so its pose follows the skeleton.
 * These are deliberately separate meshes: the source GLB and skin are untouched.
 */
export function applyRiggedWardrobe(
  root: THREE.Object3D,
  bodyAsset: BodyAssetId,
  outfit: OutfitId,
  hair: HairId,
  useRealMaleTee = false,
): () => void {
  root.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(root);
  if (bounds.isEmpty()) return () => {};
  const size = bounds.getSize(new THREE.Vector3());
  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;
  const h = size.y;
  const width = Math.max(size.x, h * 0.22);
  const depth = Math.max(size.z, h * 0.11);
  const y = (fraction: number) => bounds.min.y + h * fraction;
  const pieces: THREE.Group[] = [];
  const joints = findRigJoints(root);
  const material = (color: number, roughness = 0.78) =>
    new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
  const attachPiece = (group: THREE.Group, joint: THREE.Bone | null) => {
    group.name = "AvatarAceWardrobe";
    group.userData.wardrobeOwned = true;
    root.add(group);
    root.updateMatrixWorld(true);
    if (joint) joint.attach(group);
    pieces.push(group);
  };
  const makeTorso = (color: number, top: number, bottom: number, length: number, joint: THREE.Bone | null, detail?: "hood" | "collar" | "open") => {
    const group = new THREE.Group();
    const garment = new THREE.Mesh(
      new THREE.CylinderGeometry(top * width * 0.24, bottom * width * 0.24, h * length, 20, 1, false),
      material(color),
    );
    garment.position.set(centerX, y((top + bottom) / 2), centerZ);
    // CylinderGeometry is centered; use the width-scaled body proportions below.
    garment.scale.z = Math.max(0.65, depth / width);
    garment.name = "WardrobeTorso";
    garment.castShadow = true;
    garment.receiveShadow = true;
    group.add(garment);
    if (detail === "hood") {
      const hood = new THREE.Mesh(new THREE.SphereGeometry(width * 0.12, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.72), material(color));
      hood.position.set(centerX, y(top + 0.035), centerZ - depth * 0.12);
      hood.scale.set(1, 1.05, 0.8);
      group.add(hood);
    } else if (detail === "collar") {
      const collar = new THREE.Mesh(new THREE.TorusGeometry(width * 0.12, width * 0.018, 6, 20), material(0xd8d9dd));
      collar.position.set(centerX, y(top + 0.01), centerZ);
      collar.rotation.x = Math.PI / 2;
      group.add(collar);
    } else if (detail === "open") {
      const trimMat = material(0x252b35);
      for (const side of [-1, 1]) {
        const trim = new THREE.Mesh(new THREE.BoxGeometry(width * 0.018, h * length * 0.92, depth * 0.8), trimMat);
        trim.position.set(centerX + side * width * 0.13, y((top + bottom) / 2), centerZ + depth * 0.28);
        group.add(trim);
      }
    }
    attachPiece(group, joint ?? joints.spine);
  };
  const makeSleeve = (side: -1 | 1, color: number, joint: THREE.Bone | null, length: number) => {
    const group = new THREE.Group();
    const sleeve = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.075, width * 0.06, h * length, 12), material(color));
    sleeve.position.set(centerX + side * width * 0.24, y(0.70 - length * 0.42), centerZ);
    sleeve.rotation.z = side * -0.17;
    sleeve.scale.z = Math.max(0.7, depth / width);
    sleeve.castShadow = true;
    group.add(sleeve);
    attachPiece(group, joint ?? joints.spine);
  };

  const palette = bodyAsset === "female"
    ? { tee: 0x9b74d8, accent: 0xf0d5ff, dark: 0x303747 }
    : { tee: 0x3b9eaa, accent: 0xf0c46c, dark: 0x303747 };

  if (outfit === "tee") {
    if (!useRealMaleTee) {
      makeTorso(palette.tee, 0.76, 0.49, 0.27, joints.spine);
      makeSleeve(-1, palette.tee, joints.leftArm, 0.11);
      makeSleeve(1, palette.tee, joints.rightArm, 0.11);
    }
  } else if (outfit === "hoodie") {
    makeTorso(palette.dark, 0.78, 0.43, 0.34, joints.spine, "hood");
    makeSleeve(-1, palette.dark, joints.leftArm, 0.16);
    makeSleeve(1, palette.dark, joints.rightArm, 0.16);
    const drawstring = new THREE.Group();
    for (const side of [-1, 1]) {
      const cord = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.004, width * 0.004, h * 0.075, 6), material(palette.accent));
      cord.position.set(centerX + side * width * 0.035, y(0.735), centerZ + depth * 0.49);
      drawstring.add(cord);
    }
    attachPiece(drawstring, joints.spine);
  } else if (outfit === "jacket") {
    makeTorso(palette.dark, 0.78, 0.45, 0.32, joints.spine, "collar");
    makeSleeve(-1, palette.dark, joints.leftArm, 0.17);
    makeSleeve(1, palette.dark, joints.rightArm, 0.17);
    makeTorso(palette.accent, 0.74, 0.50, 0.29, joints.spine, "open");
  } else if (outfit === "layers") {
    makeTorso(palette.tee, 0.75, 0.50, 0.27, joints.spine);
    makeTorso(palette.dark, 0.78, 0.48, 0.30, joints.spine, "open");
    makeSleeve(-1, palette.dark, joints.leftArm, 0.15);
    makeSleeve(1, palette.dark, joints.rightArm, 0.15);
  } else if (outfit === "dress") {
    makeTorso(palette.accent, 0.77, 0.56, 0.25, joints.spine);
    const skirtGroup = new THREE.Group();
    const skirt = new THREE.Mesh(new THREE.CylinderGeometry(width * 0.27, width * 0.42, h * 0.32, 24, 1, false), material(palette.tee));
    skirt.position.set(centerX, y(0.39), centerZ);
    skirt.scale.z = Math.max(0.65, depth / width);
    skirt.castShadow = true;
    skirtGroup.add(skirt);
    attachPiece(skirtGroup, joints.hips);
  }

  if (hair !== "none") {
    const group = new THREE.Group();
    const hairMat = material(bodyAsset === "female" ? 0x4b2b20 : 0x34251f, 0.62);
    const cap = new THREE.Mesh(new THREE.SphereGeometry(width * 0.105, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.56), hairMat);
    cap.position.set(centerX, y(0.945), centerZ);
    cap.scale.set(1, 1.18, 1.12);
    group.add(cap);
    if (hair === "long") {
      for (const side of [-1, 1]) {
        const lock = new THREE.Mesh(new THREE.CapsuleGeometry(width * 0.035, h * 0.13, 4, 8), hairMat);
        lock.position.set(centerX + side * width * 0.12, y(0.84), centerZ + depth * 0.03);
        lock.rotation.z = side * -0.08;
        group.add(lock);
      }
      const back = new THREE.Mesh(new THREE.CapsuleGeometry(width * 0.105, h * 0.12, 4, 12), hairMat);
      back.position.set(centerX, y(0.84), centerZ - depth * 0.18);
      group.add(back);
    } else {
      const fringe = new THREE.Mesh(new THREE.SphereGeometry(width * 0.09, 16, 10, 0, Math.PI, 0, Math.PI * 0.45), hairMat);
      fringe.position.set(centerX, y(0.932), centerZ + depth * 0.11);
      group.add(fringe);
    }
    attachPiece(group, joints.head);
  }
  return () => {
    for (const piece of pieces) {
      piece.parent?.remove(piece);
      piece.traverse((object) => {
        const mesh = object as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.geometry.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        materials.forEach((entry) => entry.dispose());
      });
    }
  };
}

function findRigJoints(root: THREE.Object3D) {
  const result: Record<"head" | "spine" | "hips" | "leftArm" | "rightArm", THREE.Bone | null> = {
    head: null, spine: null, hips: null, leftArm: null, rightArm: null,
  };
  root.traverse((object) => {
    const bone = object as THREE.Bone;
    if (!bone.isBone) return;
    const name = bone.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!result.head && /^(head|headjoint|mixamorighead|skull)$/.test(name)) result.head = bone;
    if (!result.spine && /(spine2|chest|upperchest|spine1|spine)$/.test(name)) result.spine = bone;
    if (!result.hips && /(hips|pelvis)$/.test(name)) result.hips = bone;
    if (!result.leftArm && /(leftarm|leftshoulder|leftupperarm|mixamorigleftarm)$/.test(name)) result.leftArm = bone;
    if (!result.rightArm && /(rightarm|rightshoulder|rightupperarm|mixamorigrightarm)$/.test(name)) result.rightArm = bone;
  });
  return result;
}
