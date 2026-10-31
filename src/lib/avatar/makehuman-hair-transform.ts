import type { MakeHumanHairProxy } from "./makehuman-hair";

/** Reproduce MakeHuman's TMatrix offset transform for an hm08 reference mesh. */
export function makeHumanHairOffsetMatrix(
  base: ArrayLike<number>,
  proxy: MakeHumanHairProxy,
): Float64Array {
  if (base.length % 3) throw new Error("Reference head positions must be XYZ triples");
  const count = base.length / 3;
  const coord = (vertex: number, axis: number) => {
    if (!Number.isInteger(vertex) || vertex < 0 || vertex >= count) {
      throw new Error(`MakeHuman transform references missing hm08 vertex ${vertex}`);
    }
    return base[vertex * 3 + axis]!;
  };

  // MakeHuman precedence: scale > shear > left shear > right shear.
  if (proxy.scale.length) {
    if (proxy.scale.length !== 3 || !["x", "y", "z"].every((axis) => proxy.scale.some((v) => v.axis === axis))) {
      throw new Error("Scale transform requires x_scale, y_scale and z_scale");
    }
    const m = new Float64Array(9);
    for (const item of proxy.scale) {
      const axis = "xyz".indexOf(item.axis);
      if (!(item.factor > 0)) throw new Error(`Invalid ${item.axis}_scale reference distance`);
      m[axis * 3 + axis] = Math.abs(coord(item.vertices[0], axis) - coord(item.vertices[1], axis)) / item.factor;
    }
    return m;
  }

  if (!proxy.shear.length) return new Float64Array([1,0,0, 0,1,0, 0,0,1]);
  const side = proxy.shear[0]!.side;
  const entries = proxy.shear.filter((v) => v.side === side);
  if (entries.length !== 3 || !["x", "y", "z"].every((axis) => entries.some((v) => v.axis === axis))) {
    throw new Error("Shear transform requires all three axes for one side");
  }

  // Match MakeHuman matrixFromShear: map eight source-box corners to the
  // corresponding eight current-head corners, then retain its linear part.
  const source: number[][] = [], target: number[][] = [];
  for (let i = 0; i < 2; i++) for (let j = 0; j < 2; j++) for (let k = 0; k < 2; k++) {
    const bits = [i, j, k], a = [0, 0, 0], b = [0, 0, 0];
    for (const item of entries) {
      const axis = "xyz".indexOf(item.axis);
      a[axis] = item.factors[bits[axis]!]!;
      b[axis] = coord(item.vertices[bits[axis]!]!, axis);
    }
    source.push(a); target.push(b);
  }

  // Least-squares affine solve for [x,y,z,1] -> [X,Y,Z].
  const aug = Array.from({ length: 4 }, () => Array(7).fill(0) as number[]);
  for (let n = 0; n < 8; n++) {
    const v = [...source[n]!, 1];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) aug[r]![c] += v[r]! * v[c]!;
      for (let c = 0; c < 3; c++) aug[r]![4 + c] += v[r]! * target[n]![c]!;
    }
  }
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(aug[r]![c]!) > Math.abs(aug[p]![c]!)) p = r;
    if (Math.abs(aug[p]![c]!) < 1e-10) throw new Error("Degenerate MakeHuman shear reference box");
    [aug[c], aug[p]] = [aug[p]!, aug[c]!];
    const d = aug[c]![c]!;
    for (let k = c; k < 7; k++) aug[c]![k] /= d;
    for (let r = 0; r < 4; r++) if (r !== c) {
      const f = aug[r]![c]!;
      for (let k = c; k < 7; k++) aug[r]![k] -= f * aug[c]![k]!;
    }
  }
  return new Float64Array([
    aug[0]![4]!, aug[1]![4]!, aug[2]![4]!,
    aug[0]![5]!, aug[1]![5]!, aug[2]![5]!,
    aug[0]![6]!, aug[1]![6]!, aug[2]![6]!,
  ]);
}

/** Fit proxy vertices while preserving authored extrapolation weights. */
export function fitMakeHumanHair(
  base: ArrayLike<number>,
  proxy: MakeHumanHairProxy,
): Float32Array {
  const matrix = makeHumanHairOffsetMatrix(base, proxy);
  const count = base.length / 3;
  const result = new Float32Array(proxy.fitRecords.length * 3);
  proxy.fitRecords.forEach((record, index) => {
    const [a, b, c] = record.vertices;
    if ([a, b, c].some((v) => v < 0 || v >= count)) {
      throw new Error(`Hair record ${index} references a vertex outside the ${count}-vertex hm08 mesh`);
    }
    for (let axis = 0; axis < 3; axis++) {
      const offset = matrix[axis * 3]! * record.offset[0]!
        + matrix[axis * 3 + 1]! * record.offset[1]!
        + matrix[axis * 3 + 2]! * record.offset[2]!;
      result[index * 3 + axis] =
        base[a * 3 + axis]! * record.weights[0]
        + base[b * 3 + axis]! * record.weights[1]
        + base[c * 3 + axis]! * record.weights[2]
        + offset;
    }
  });
  return result;
}
