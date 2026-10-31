import * as THREE from "three";
import { ARKIT_BLENDSHAPE_NAMES } from "./arkit.ts";

const canonicalNames = new Set<string>(ARKIT_BLENDSHAPE_NAMES);

/** Native generated heads must return to neutral when a sparse driver stops.
 * Other models retain their clip-authored weights unless explicitly driven.
 */
export function applyMorphs(root: THREE.Object3D, weights: Record<string, number>, expression: number): void {
  const strength = Number.isFinite(expression) ? Math.max(0, expression) : 1;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    const dictionary = mesh.morphTargetDictionary;
    const influences = mesh.morphTargetInfluences;
    if (!mesh.isMesh || !dictionary || !influences) return;
    const isPhoto = mesh.name === "AvatarAcePhotoFace";
    const isGenerated = mesh.name === "AvatarAceGeneratedHeadMesh";
    const baseline = isPhoto ? mesh.userData.avatarPhotoFaceBaseline as number[] | undefined : undefined;
    if (isPhoto || isGenerated) {
      for (const [name, index] of Object.entries(dictionary)) {
        if (isGenerated || canonicalNames.has(name)) {
          const value = baseline?.[index] ?? 0;
          influences[index] = Number.isFinite(value) ? THREE.MathUtils.clamp(value * strength, 0, 1) : 0;
        }
      }
    }
    for (const [name, value] of Object.entries(weights)) {
      const index = dictionary[name];
      if (index !== undefined) influences[index] = Number.isFinite(value) ? THREE.MathUtils.clamp(value * strength, 0, 1) : 0;
    }
  });
}

/** Count real deformation buffers, not merely channel names in a dictionary. */
export function inspectMorphs(root: THREE.Object3D): { names: string[]; inactive: string[]; warning?: string } {
  const names = new Set<string>();
  const active = new Set<string>();
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh || !mesh.morphTargetDictionary) return;
    for (const [name, index] of Object.entries(mesh.morphTargetDictionary)) {
      names.add(name);
      const attribute = mesh.geometry.morphAttributes.position?.[index];
      const positions = mesh.geometry.getAttribute("position");
      if (!attribute || !positions || attribute.count !== positions.count) continue;
      for (let vertex = 0; vertex < attribute.count; vertex++) {
        const delta = new THREE.Vector3().fromBufferAttribute(attribute, vertex);
        if (!mesh.geometry.morphTargetsRelative) delta.sub(new THREE.Vector3().fromBufferAttribute(positions, vertex));
        if (Number.isFinite(delta.lengthSq()) && delta.lengthSq() > 1e-16) { active.add(name); break; }
      }
    }
  });
  const inactive = [...names].filter((name) => !active.has(name)).sort();
  const warning = !names.size
    ? "This model has no facial blendshapes. Head rotation can work, but facial expressions require a rigged head package."
    : inactive.length === names.size
      ? "All morph targets contain zero or unusable deformation data. Facial expressions cannot move this mesh."
      : inactive.length ? `${inactive.length} morph channels have no usable mesh deformation: ${inactive.join(", ")}.` : undefined;
  return { names: [...names].sort(), inactive, warning };
}