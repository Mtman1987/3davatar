import * as THREE from "three";

/**
 * Shared neutral skin-surface response for the body GLBs and generated heads.
 * Keep skin matte and non-metallic; retain authored normal detail where present.
 */
export const AVATAR_SKIN_ROUGHNESS = 0.78;

function createPoreNormalTexture(): THREE.CanvasTexture | null {
  if (typeof document === "undefined") return null;
  const canvas = document.createElement("canvas");
  canvas.width = 96;
  canvas.height = 96;
  const context = canvas.getContext("2d");
  if (!context) return null;
  const image = context.createImageData(96, 96);
  const data = image.data;
  for (let y = 0; y < 96; y++) {
    for (let x = 0; x < 96; x++) {
      const i = (y * 96 + x) * 4;
      const wave = Math.sin(x * 1.73 + Math.sin(y * 0.31) * 2.1) * Math.cos(y * 1.37 + Math.sin(x * 0.23));
      data[i] = 128 + Math.round(wave * 3);
      data[i + 1] = 128 + Math.round(Math.cos(x * 0.41 + y * 0.67) * 3);
      data[i + 2] = 255;
      data[i + 3] = 255;
    }
  }
  context.putImageData(image, 0, 0);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(5, 5);
  texture.needsUpdate = true;
  return texture;
}

/** Apply the same diffuse/matte surface response to every AvatarAce skin mesh. */
export function applyAvatarSkinSurface(material: THREE.Material): void {
  if (!(material instanceof THREE.MeshStandardMaterial)) return;
  material.roughness = AVATAR_SKIN_ROUGHNESS;
  material.metalness = 0;
  // Roughness is deliberately uniform between the generated face and body.
  // Do not let an optional generator roughness map make the face visibly glossier.
  material.roughnessMap = null;
  if (material instanceof THREE.MeshPhysicalMaterial) {
    material.clearcoat = 0;
    material.clearcoatRoughness = 1;
    material.sheen = 0;
    material.sheenRoughness = 1;
    // Transmission models optical transparency (e.g. glass), not skin SSS.
    material.transmission = 0;
    material.thickness = 0;
  }
  if (!material.normalMap) {
    const pores = createPoreNormalTexture();
    if (pores) {
      material.normalMap = pores;
      material.normalScale.set(0.025, 0.025);
    }
  }
  material.needsUpdate = true;
}
