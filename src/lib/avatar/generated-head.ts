import * as THREE from "three";
import { getGeneratedHeadAsset } from "@/lib/avatar/reconstruction";

export type GeneratedHeadManifest = {
  status?: string;
  neutral_base_obj?: string;
  blendshapes_json?: string;
  armature_json?: string | null;
  detail_maps?: Record<string, string | null> | null;
  num_vertices?: number;
  num_triangles?: number;
  arkit_blendshapes_count?: number;
};

export type GeneratedHeadBlendshapes = {
  version?: string;
  units?: string;
  num_vertices: number;
  blendshapes: Record<string, number[][]>;
};

export type GeneratedHeadArmature = {
  version?: string;
  joints_count?: number;
  joints: Record<string, {
    position: [number, number, number];
    parent: string | null;
    children?: string[];
  }>;
  joint_names: string[];
  num_vertices: number;
  skinning_weights: number[][];
};


/**
 * Match the generated head's average diffuse skin color to the same sampled
 * photo tone used by the body, while retaining the albedo map's local detail.
 * The correction is an albedo multiplier, not a lighting change.
 */
export function applyGeneratedHeadSkinTone(root: THREE.Object3D, targetTone: THREE.Color | null): void {
  if (!targetTone) return;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!mesh.isMesh) return;
    const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
    for (const source of materials) {
      const material = source as THREE.MeshStandardMaterial;
      if (!material || !("color" in material) || !material.color?.isColor) continue;
      const averageTexture = new THREE.Color(1, 1, 1);
      const map = material.map;
      let sampledMap = false;
      if (map?.image) {
        try {
          const image = map.image as CanvasImageSource & { width?: number; height?: number };
          const canvas = document.createElement("canvas");
          canvas.width = 32;
          canvas.height = 32;
          const context = canvas.getContext("2d", { willReadFrequently: true });
          if (context) {
            context.drawImage(image, 0, 0, 32, 32);
            const pixels = context.getImageData(0, 0, 32, 32).data;
            let red = 0, green = 0, blue = 0, count = 0;
            for (let y = 3; y < 29; y++) {
              for (let x = 3; x < 29; x++) {
                const index = (y * 32 + x) * 4;
                const r = pixels[index]!, g = pixels[index + 1]!, b = pixels[index + 2]!;
                const maximum = Math.max(r, g, b), minimum = Math.min(r, g, b);
                if (pixels[index + 3]! < 200 || maximum < 35 || maximum - minimum > 125) continue;
                red += r; green += g; blue += b; count++;
              }
            }
            if (count > 20) {
              averageTexture.setRGB(red / count / 255, green / count / 255, blue / count / 255, THREE.SRGBColorSpace);
              sampledMap = true;
            }
          }
        } catch {
          // Tainted or unsupported image sources fall back to a direct tone tint.
        }
      }
      if (!sampledMap) {
        material.color.copy(targetTone);
      } else {
        const effectiveAverage = averageTexture.multiply(material.color);
        const correction = new THREE.Color(
          targetTone.r / Math.max(effectiveAverage.r, 0.025),
          targetTone.g / Math.max(effectiveAverage.g, 0.025),
          targetTone.b / Math.max(effectiveAverage.b, 0.025),
        );
        material.color.multiply(new THREE.Color(
          THREE.MathUtils.clamp(correction.r, 0.35, 3.5),
          THREE.MathUtils.clamp(correction.g, 0.35, 3.5),
          THREE.MathUtils.clamp(correction.b, 0.35, 3.5),
        ));
      }
      material.needsUpdate = true;
    }
  });
}

export type GeneratedHeadGeometry = {
  geometry: THREE.BufferGeometry;
  originalVertexIndices: Uint32Array;
  vertexCount: number;
};

function resolveAssetUrl(path: string, manifestUrl: string): string {
  return new URL(path, manifestUrl).href;
}

function parseIndex(raw: string, length: number): number {
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value) || value === 0) throw new Error("Invalid OBJ index: " + raw);
  const index = value > 0 ? value - 1 : length + value;
  if (index < 0 || index >= length) throw new Error("OBJ index out of range: " + raw);
  return index;
}

/**
 * Parses the Stage5 triangular OBJ without losing its independent position/UV
 * indices. Every output corner retains its source vertex index so morph and
 * skinning arrays remain aligned even at UV seams.
 */
export function buildGeneratedHeadGeometry(
  objText: string,
  blendshapeData: GeneratedHeadBlendshapes,
  armatureData?: GeneratedHeadArmature | null,
): GeneratedHeadGeometry {
  const vertices: number[][] = [];
  const uvs: number[][] = [];
  const corners: Array<{ vertex: number; uv: number | null }> = [];

  for (const rawLine of objText.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    if (parts[0] === "v" && parts.length >= 4) {
      vertices.push(parts.slice(1, 4).map(Number));
    } else if (parts[0] === "vt" && parts.length >= 3) {
      uvs.push(parts.slice(1, 3).map(Number));
    } else if (parts[0] === "f" && parts.length >= 4) {
      const face = parts.slice(1).map((part) => {
        const indices = part.split("/");
        return {
          vertex: parseIndex(indices[0], vertices.length),
          uv: indices[1] ? parseIndex(indices[1], uvs.length) : null,
        };
      });
      for (let i = 1; i < face.length - 1; i++) {
        corners.push(face[0], face[i], face[i + 1]);
      }
    }
  }

  if (!vertices.length || !corners.length) {
    throw new Error("Generated head OBJ contains no usable vertices or faces.");
  }
  if (blendshapeData.num_vertices !== vertices.length) {
    throw new Error(
      "Generated head topology mismatch: OBJ has " + vertices.length +
      " vertices but morph data has " + blendshapeData.num_vertices + ".",
    );
  }
  if (armatureData && armatureData.num_vertices !== vertices.length) {
    throw new Error("Generated head rig vertex count does not match its OBJ topology.");
  }

  const positions: number[] = [];
  const texcoords: number[] = [];
  const originalVertexIndices = new Uint32Array(corners.length);
  const geometry = new THREE.BufferGeometry();

  corners.forEach((corner, i) => {
    const position = vertices[corner.vertex];
    positions.push(position[0], position[1], position[2]);
    originalVertexIndices[i] = corner.vertex;
    const uv = corner.uv === null ? [0, 0] : uvs[corner.uv];
    texcoords.push(uv[0], uv[1]);
  });

  geometry.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  if (corners.some((corner) => corner.uv !== null)) {
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(texcoords, 2));
  }

  const morphNames = Object.keys(blendshapeData.blendshapes);
  geometry.morphAttributes.position = morphNames.map((name) => {
    const deltas = blendshapeData.blendshapes[name];
    if (!Array.isArray(deltas) || deltas.length !== vertices.length) {
      throw new Error("Morph " + name + " does not match the neutral OBJ vertex count.");
    }
    const expanded = new Float32Array(corners.length * 3);
    corners.forEach((corner, i) => {
      const delta = deltas[corner.vertex];
      if (!delta || delta.length < 3) throw new Error("Invalid vertex delta in morph " + name + ".");
      expanded[i * 3] = delta[0];
      expanded[i * 3 + 1] = delta[1];
      expanded[i * 3 + 2] = delta[2];
    });
    const attribute = new THREE.BufferAttribute(expanded, 3);
    attribute.name = name;
    return attribute;
  });
  geometry.morphTargetsRelative = true;

  if (armatureData) {
    const names = armatureData.joint_names;
    const indices = new Uint16Array(corners.length * 4);
    const weights = new Float32Array(corners.length * 4);
    corners.forEach((corner, i) => {
      const row = armatureData.skinning_weights[corner.vertex];
      if (!row || row.length !== names.length) {
        throw new Error("Invalid skinning weight row for OBJ vertex " + corner.vertex + ".");
      }
      const ranked = row.map((weight, joint) => ({ weight, joint }))
        .sort((a, b) => b.weight - a.weight).slice(0, 4);
      const total = ranked.reduce((sum, item) => sum + Math.max(0, item.weight), 0) || 1;
      ranked.forEach((item, j) => {
        indices[i * 4 + j] = item.joint;
        weights[i * 4 + j] = Math.max(0, item.weight) / total;
      });
    });
    geometry.setAttribute("skinIndex", new THREE.Uint16BufferAttribute(indices, 4));
    geometry.setAttribute("skinWeight", new THREE.Float32BufferAttribute(weights, 4));
  }

  geometry.computeVertexNormals();
  return { geometry, originalVertexIndices, vertexCount: vertices.length };
}

export function buildGeneratedHeadSkeleton(
  armature: GeneratedHeadArmature,
): { bones: THREE.Bone[]; skeleton: THREE.Skeleton; root: THREE.Bone } {
  const bones = armature.joint_names.map((name) => {
    const data = armature.joints[name];
    if (!data) throw new Error("Generated head rig is missing joint " + name + ".");
    const bone = new THREE.Bone();
    bone.name = name;
    // Exported joint centers are in mesh/model coordinates (not parent-local).
    // Convert them to parent-relative offsets when constructing the hierarchy.
    const parentName = data.parent;
    const parentPosition = parentName ? armature.joints[parentName]?.position : null;
    const local = parentPosition
      ? data.position.map((value, axis) => value - parentPosition[axis])
      : data.position;
    bone.position.fromArray(local);
    return bone;
  });
  const byName = new Map(bones.map((bone) => [bone.name, bone]));
  const roots: THREE.Bone[] = [];
  armature.joint_names.forEach((name, index) => {
    const parentName = armature.joints[name].parent;
    if (parentName) {
      const parent = byName.get(parentName);
      if (!parent) throw new Error("Generated head rig has unknown parent " + parentName + ".");
      parent.add(bones[index]);
    } else {
      roots.push(bones[index]);
    }
  });
  if (roots.length !== 1) throw new Error("Generated head rig must have exactly one root joint.");
  const root = roots[0];
  root.updateMatrixWorld(true);
  return { bones, skeleton: new THREE.Skeleton(bones), root };
}

export function generatedHeadAssetUrl(
  manifestUrl: string,
  relativePath: string,
): string {
  return resolveAssetUrl(relativePath, manifestUrl);
}


async function fetchHeadAsset(url: string): Promise<Response> {
  const parsed = new URL(url);
  const match = parsed.pathname.match(/\/v1\/reconstructions\/([a-f0-9]{32})\/assets\/([a-zA-Z0-9_.-]+)$/);
  if (!match) throw new Error("Invalid generated-head asset URL.");
  const result = await getGeneratedHeadAsset({ data: { jobId: match[1], assetName: match[2] } });
  const raw = atob(result.bytesBase64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  return new Response(bytes, { headers: { "Content-Type": result.contentType } });
}

/** Fetch and assemble the Stage5 manifest plus its native companion assets. */
export async function loadGeneratedHeadBundle(manifestUrl: string): Promise<THREE.Group> {
  const manifestResponse = await fetchHeadAsset(manifestUrl);
  if (!manifestResponse.ok) throw new Error("Generated head manifest request failed: HTTP " + manifestResponse.status);
  const manifest = await manifestResponse.json() as GeneratedHeadManifest;
  if (!manifest.neutral_base_obj || !manifest.blendshapes_json) {
    throw new Error("Generated head manifest must reference neutral_base_obj and blendshapes_json.");
  }

  const [objResponse, morphResponse, rigResponse] = await Promise.all([
    fetchHeadAsset(generatedHeadAssetUrl(manifestUrl, manifest.neutral_base_obj)),
    fetchHeadAsset(generatedHeadAssetUrl(manifestUrl, manifest.blendshapes_json)),
    manifest.armature_json
      ? fetchHeadAsset(generatedHeadAssetUrl(manifestUrl, manifest.armature_json))
      : Promise.resolve(null),
  ]);
  if (!objResponse.ok) throw new Error("Generated head OBJ request failed: HTTP " + objResponse.status);
  if (!morphResponse.ok) throw new Error("Generated head morph request failed: HTTP " + morphResponse.status);
  if (rigResponse && !rigResponse.ok) throw new Error("Generated head rig request failed: HTTP " + rigResponse.status);

  const [objText, morphs, rig] = await Promise.all([
    objResponse.text(),
    morphResponse.json() as Promise<GeneratedHeadBlendshapes>,
    rigResponse ? rigResponse.json() as Promise<GeneratedHeadArmature> : Promise.resolve(null),
  ]);
  const built = buildGeneratedHeadGeometry(objText, morphs, rig);
  const group = new THREE.Group();
  group.name = "AvatarAceNativeGeneratedHead";

  const material = new THREE.MeshStandardMaterial({
    color: 0xd6aa91,
    roughness: 0.78,
    metalness: 0,
  });
  const maps = manifest.detail_maps ?? {};
  const textureLoader = new THREE.TextureLoader();
  const loadTexture = async (path: string | null | undefined, color: boolean) => {
    if (!path) return null;
    const response = await fetchHeadAsset(generatedHeadAssetUrl(manifestUrl, path));
    if (!response.ok) throw new Error("Generated head texture request failed: HTTP " + response.status);
    const objectUrl = URL.createObjectURL(await response.blob());
    try {
      const texture = await textureLoader.loadAsync(objectUrl);
      if (color) texture.colorSpace = THREE.SRGBColorSpace;
      return texture;
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  };
  const albedoPath = maps.albedo ?? maps.albedo_map ?? maps.albedo_texture ?? maps.projected_texture;
  const normalPath = maps.normal_map ?? maps.normal ?? maps.film_normal;
  const displacementPath = maps.displacement_16bit ?? maps.displacement_png ?? maps.displacement;
  const roughnessPath = maps.roughness ?? maps.roughness_map ?? maps.roughness_base;
  const aoPath = maps.cavity ?? maps.cavity_ao ?? maps.ao;
  const [albedoMap, normalMap, displacementMap, roughnessMap, aoMap] = await Promise.all([
    loadTexture(albedoPath, true),
    loadTexture(normalPath, false),
    loadTexture(displacementPath, false),
    loadTexture(roughnessPath, false),
    loadTexture(aoPath, false),
  ]);
  if (albedoMap) material.map = albedoMap;
  if (normalMap) material.normalMap = normalMap;
  if (displacementMap) {
    material.displacementMap = displacementMap;
    material.displacementScale = 0.001;
  }
  if (roughnessMap) material.roughnessMap = roughnessMap;
  if (aoMap) {
    built.geometry.setAttribute("uv2", built.geometry.getAttribute("uv"));
    material.aoMap = aoMap;
  }

  if (rig) {
    const { bones, skeleton, root } = buildGeneratedHeadSkeleton(rig);
    const mesh = new THREE.SkinnedMesh(built.geometry, material);
    mesh.name = "AvatarAceGeneratedHeadMesh";
    group.add(root);
    group.add(mesh);
    group.updateMatrixWorld(true);
    mesh.bind(skeleton);
    mesh.morphTargetInfluences = morphs.blendshapes
      ? Object.keys(morphs.blendshapes).map(() => 0)
      : [];
    mesh.morphTargetDictionary = Object.fromEntries(
      Object.keys(morphs.blendshapes).map((name, index) => [name, index]),
    );
    mesh.normalizeSkinWeights();
    root.updateMatrixWorld(true);
    mesh.updateMatrixWorld(true);
  } else {
    const mesh = new THREE.Mesh(built.geometry, material);
    mesh.name = "AvatarAceGeneratedHeadMesh";
    mesh.morphTargetInfluences = Object.keys(morphs.blendshapes).map(() => 0);
    mesh.morphTargetDictionary = Object.fromEntries(
      Object.keys(morphs.blendshapes).map((name, index) => [name, index]),
    );
    group.add(mesh);
  }

  const neckPosition = rig?.joints?.neck?.position;
  if (Array.isArray(neckPosition) && neckPosition.length >= 3) {
    group.position.set(-neckPosition[0], -neckPosition[1], -neckPosition[2]);
  }

  group.userData.avatarAceGeneratedHead = {
    manifestUrl,
    units: morphs.units ?? "unspecified",
    sourceVertexCount: built.vertexCount,
    sourceTriangleCount: built.geometry.getAttribute("position").count / 3,
    morphNames: Object.keys(morphs.blendshapes),
    hasFacialRig: Boolean(rig),
  };
  group.updateMatrixWorld(true);
  return group;
}
