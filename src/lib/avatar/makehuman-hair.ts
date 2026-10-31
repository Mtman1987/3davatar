/**
 * MakeHuman .mhclo fitting support.
 *
 * The hair pack stores one 9-value fitting record per OBJ vertex:
 * three hm08 vertex indices, three interpolation weights, and XYZ offset.
 * Weights are intentionally NOT clamped; some styles use extrapolation.
 *
 * This module keeps parsing/fitting separate from the viewer so source-head
 * coordinate transforms can be validated before any hairstyle is attached.
 */

export type HairFitRecord = {
  vertices: readonly [number, number, number];
  weights: readonly [number, number, number];
  offset: readonly [number, number, number];
};

export type HairScaleDirective = {
  axis: "x" | "y" | "z";
  vertices: readonly [number, number];
  factor: number;
};

export type HairShearDirective = {
  side: "l" | "r";
  axis: "x" | "y" | "z";
  vertices: readonly [number, number];
  factors: readonly [number, number];
};

export type MakeHumanHairProxy = {
  baseMesh: string | null;
  objectFile: string | null;
  materialFile: string | null;
  fitRecords: HairFitRecord[];
  scale: HairScaleDirective[];
  shear: HairShearDirective[];
  metadata: Record<string, string>;
};

const finite = (value: number, context: string) => {
  if (!Number.isFinite(value)) throw new Error(`Invalid number in ${context}`);
  return value;
};

function tuple3(values: number[], context: string) {
  if (values.length !== 3) throw new Error(`Expected 3 values in ${context}`);
  return [
    finite(values[0]!, context),
    finite(values[1]!, context),
    finite(values[2]!, context),
  ] as const;
}

/** Parse a MakeHuman proxy file without losing extrapolation weights or offsets. */
export function parseMakeHumanHairProxy(text: string): MakeHumanHairProxy {
  const result: MakeHumanHairProxy = {
    baseMesh: null,
    objectFile: null,
    materialFile: null,
    fitRecords: [],
    scale: [],
    shear: [],
    metadata: {},
  };
  let readingFit = false;

  for (const [index, rawLine] of text.split(/\r?\n/).entries()) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const parts = line.split(/\s+/);
    const key = parts[0]!;
    const values = parts.slice(1);

    if (readingFit) {
      if (values.length !== 8 || !/^[-+]?\d+$/.test(key)) {
        throw new Error(`Malformed fit record at line ${index + 1}`);
      }
      const nums = [key, ...values].map((v) => finite(Number(v), `line ${index + 1}`));
      const ids = nums.slice(0, 3);
      if (ids.some((v) => !Number.isInteger(v) || v < 0)) {
        throw new Error(`Invalid base vertex index at line ${index + 1}`);
      }
      result.fitRecords.push({
        vertices: [ids[0]!, ids[1]!, ids[2]!],
        weights: [nums[3]!, nums[4]!, nums[5]!],
        offset: tuple3(nums.slice(6, 9), `line ${index + 1} offset`),
      });
      continue;
    }

    if (key === "verts") {
      // In MakeHuman proxies, `verts 0` is the start marker for the fitting
      // map, not a declaration that the map contains zero records.
      if (values.length !== 1 || !Number.isInteger(Number(values[0])) || Number(values[0]) < 0) {
        throw new Error(`Invalid verts marker at line ${index + 1}`);
      }
      readingFit = true;
      continue;
    }
    if (key === "basemesh") result.baseMesh = values.join(" ");
    else if (key === "obj_file") result.objectFile = values.join(" ");
    else if (key === "material" || key === "material_file") result.materialFile = values.join(" ");
    else if (/^[xyz]_scale$/.test(key)) {
      if (values.length !== 3) throw new Error(`Malformed ${key} at line ${index + 1}`);
      const [a, b, factor] = [Number(values[0]), Number(values[1]), Number(values[2])];
      if (![a, b].every((v) => Number.isInteger(v) && v >= 0)) throw new Error(`Invalid ${key} vertex pair`);
      result.scale.push({ axis: key[0] as "x" | "y" | "z", vertices: [a, b], factor: finite(factor, key) });
    } else if (/^[lr]_[xyz]_shear$/.test(key)) {
      if (values.length !== 4) throw new Error(`Malformed ${key} at line ${index + 1}`);
      const [a, b, left, right] = [Number(values[0]), Number(values[1]), Number(values[2]), Number(values[3])];
      if (![a, b].every((v) => Number.isInteger(v) && v >= 0)) throw new Error(`Invalid ${key} vertex pair`);
      result.shear.push({ side: key[0] as "l" | "r", axis: key[2] as "x" | "y" | "z", vertices: [a, b], factors: [finite(left, key), finite(right, key)] });
    } else {
      result.metadata[key] = values.join(" ");
    }
  }

  if (!result.baseMesh) throw new Error("MakeHuman hair proxy is missing basemesh");
  return result;
}

/**
 * Reconstruct hair vertex positions from a compatible reference head.
 * basePositions must be XYZ triples in the exact hm08 vertex order.
 * MakeHuman scale/shear directives must be applied to that reference mesh by
 * the caller before this function; silently guessing those transforms is unsafe.
 */
export function fitMakeHumanHairVertices(
  basePositions: ArrayLike<number>,
  records: readonly HairFitRecord[],
): Float32Array {
  if (basePositions.length % 3 !== 0) throw new Error("Reference head positions must contain XYZ triples");
  const baseCount = basePositions.length / 3;
  const output = new Float32Array(records.length * 3);

  records.forEach((record, index) => {
    const [a, b, c] = record.vertices;
    if (a >= baseCount || b >= baseCount || c >= baseCount) {
      throw new Error(`Hair fit record ${index} references a missing ${record.vertices.find((v) => v >= baseCount)} vertex (reference has ${baseCount})`);
    }
    for (let axis = 0; axis < 3; axis++) {
      const weighted =
        basePositions[a * 3 + axis]! * record.weights[0] +
        basePositions[b * 3 + axis]! * record.weights[1] +
        basePositions[c * 3 + axis]! * record.weights[2];
      output[index * 3 + axis] = weighted + record.offset[axis]!;
    }
  });
  return output;
}

/** Validate the fitting map against an OBJ vertex count before loading a style. */
export function validateMakeHumanHairVertexCount(proxy: MakeHumanHairProxy, objVertexCount: number) {
  if (!Number.isInteger(objVertexCount) || objVertexCount < 0) {
    throw new Error("OBJ vertex count must be a non-negative integer");
  }
  if (proxy.fitRecords.length !== objVertexCount) {
    return {
      valid: false as const,
      expected: proxy.fitRecords.length,
      actual: objVertexCount,
      message: `Hair OBJ has ${objVertexCount} vertices; its .mhclo maps ${proxy.fitRecords.length}. Refusing to misalign the fitting data.`,
    };
  }
  return { valid: true as const, expected: proxy.fitRecords.length, actual: objVertexCount };
}
