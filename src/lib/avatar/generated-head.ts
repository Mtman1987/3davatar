import * as THREE from "three";

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
  let root: THREE.Bone | null = null;
  armature.joint_names.forEach((name, index) => {
    const parentName = armature.joints[name].parent;
    if (parentName) {
      const parent = byName.get(parentName);
      if (!parent) throw new Error("Generated head rig has unknown parent " + parentName + ".");
      parent.add(bones[index]);
    } else {
      if (root) throw new Error("Generated head rig must have exactly one root joint.");
      root = bones[index];
    }
  });
  if (!root) throw new Error("Generated head rig has no root joint.");
  root.updateMatrixWorld(true);
  return { bones, skeleton: new THREE.Skeleton(bones), root };
}

export function generatedHeadAssetUrl(
  manifestUrl: string,
  relativePath: string,
): string {
  return resolveAssetUrl(relativePath, manifestUrl);
}
