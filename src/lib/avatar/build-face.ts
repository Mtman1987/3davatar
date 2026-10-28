import Delaunator from "delaunator";
import { ARKIT_BLENDSHAPE_NAMES, ARKIT_INDEX, type ArkitName } from "@/lib/avatar/arkit";
import type { BuiltFace } from "@/lib/avatar/face-cache";

export type Landmark = { x: number; y: number; z: number };
export type Mode = "standard" | "detail";

const OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
  176, 149, 150, 136, 172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];
const EYE_A = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246];
const EYE_B = [263, 249, 390, 373, 374, 380, 381, 382, 362, 398, 384, 385, 386, 387, 388, 466];
const BROW_A = [70, 63, 105, 66, 107, 55, 65, 52, 53, 46];
const BROW_B = [300, 293, 334, 296, 336, 285, 295, 282, 283, 276];
const MOUTH = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291, 375, 321, 314, 17, 84, 181, 91, 146, 78, 95, 88,
  178, 87, 14, 317, 402, 318, 324, 308, 415, 310, 311, 312, 13, 82, 81, 80, 191,
];
const LOWER_LIP = [17, 84, 181, 91, 146, 61, 185, 40, 39, 37, 18, 83, 314, 405, 321, 375, 291, 409, 270, 269, 267];
const UPPER_LIP = [13, 312, 311, 310, 415, 308, 324, 318, 402, 317, 14, 87, 178, 88, 95, 78, 191, 80, 81, 82];
const NOSE = [1, 2, 4, 5, 6, 19, 94, 98, 327, 195, 197, 168];
const JAW = [152, 148, 176, 149, 150, 136, 172, 58, 132, 93, 377, 400, 378, 379, 365, 397, 288, 361, 323];
const CHEEK_A = [116, 123, 147, 213, 192, 214, 212, 216, 205];
const CHEEK_B = [345, 352, 376, 433, 416, 434, 432, 436, 425];
const IRIS_A = [468, 469, 470, 471, 472];
const IRIS_B = [473, 474, 475, 476, 477];

type Score = { categoryName?: string; score?: number };

export function buildFace(
  landmarks: Landmark[],
  categories: Score[],
  source: HTMLCanvasElement,
  mode: Mode,
): BuiltFace {
  const indices = triangulate(landmarks);
  // MediaPipe landmarks are normalized independently by image width and height.
  // Convert them back to a common pixel aspect before building 3D coordinates;
  // otherwise portrait photos compress the face vertically.
  let positions: Float32Array = layout(landmarks, mode, source.height / Math.max(1, source.width));
  if (mode === "detail") {
    positions = smoothPositions(positions, indices, 2);
    inflateCheeks(positions);
  }
  const uvs = makeUvs(landmarks);
  const texture = makeTexture(source, landmarks, mode === "detail" ? 1.12 : 1.05);
  const amp = mode === "detail" ? 1.4 : 1;
  const morphs = buildMorphs(positions, amp);
  const influences = ARKIT_BLENDSHAPE_NAMES.map((name) => {
    const found = categories.find((row) => row.categoryName === name);
    return found?.score ?? 0;
  });
  return { positions, uvs, indices, morphs, influences, texture };
}

function layout(landmarks: Landmark[], mode: Mode, verticalAspect = 1) {
  const n = landmarks.length;
  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (const lm of landmarks) {
    cx += lm.x;
    cy += lm.y;
    cz += lm.z;
  }
  cx /= n;
  cy /= n;
  cz /= n;
  const zBoost = mode === "detail" ? 1.45 : 1.05;
  const raw = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    const lm = landmarks[i]!;
    raw[i * 3] = lm.x - cx;
    raw[i * 3 + 1] = -(lm.y - cy) * verticalAspect;
    raw[i * 3 + 2] = -(lm.z - cz) * zBoost;
  }
  let minX = Infinity;
  let maxX = -Infinity;
  for (let i = 0; i < n; i++) {
    minX = Math.min(minX, raw[i * 3]!);
    maxX = Math.max(maxX, raw[i * 3]!);
  }
  const scale = 0.19 / Math.max(0.0001, maxX - minX);
  for (let i = 0; i < raw.length; i++) raw[i] = (raw[i] ?? 0) * scale;
  return raw;
}

function triangulate(landmarks: Landmark[]) {
  const coords = new Float32Array(landmarks.length * 2);
  for (let i = 0; i < landmarks.length; i++) {
    coords[i * 2] = landmarks[i]!.x;
    coords[i * 2 + 1] = landmarks[i]!.y;
  }
  const delaunay = new Delaunator(coords);
  const diag = faceDiag(landmarks);
  let indices = collect(delaunay.triangles, landmarks, diag * 0.28);
  if (indices.length < 300) indices = collect(delaunay.triangles, landmarks, diag * 0.55);
  return indices;
}

function collect(triangles: Uint32Array, landmarks: Landmark[], maxEdge: number) {
  const out: number[] = [];
  for (let t = 0; t < triangles.length; t += 3) {
    const a = triangles[t]!;
    const b = triangles[t + 1]!;
    const c = triangles[t + 2]!;
    if (dist(landmarks[a], landmarks[b]) > maxEdge) continue;
    if (dist(landmarks[b], landmarks[c]) > maxEdge) continue;
    if (dist(landmarks[c], landmarks[a]) > maxEdge) continue;
    out.push(a, b, c);
  }
  return new Uint32Array(out);
}

function faceDiag(landmarks: Landmark[]) {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const lm of landmarks) {
    minX = Math.min(minX, lm.x);
    maxX = Math.max(maxX, lm.x);
    minY = Math.min(minY, lm.y);
    maxY = Math.max(maxY, lm.y);
  }
  return Math.hypot(maxX - minX, maxY - minY);
}

function dist(a: Landmark | undefined, b: Landmark | undefined) {
  if (!a || !b) return Infinity;
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function cropOf(landmarks: Landmark[]) {
  let minX = 1;
  let maxX = 0;
  let minY = 1;
  let maxY = 0;
  for (const lm of landmarks) {
    minX = Math.min(minX, lm.x);
    maxX = Math.max(maxX, lm.x);
    minY = Math.min(minY, lm.y);
    maxY = Math.max(maxY, lm.y);
  }
  const size = Math.max(maxX - minX, maxY - minY) * 1.35;
  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  return { x: cx - size / 2, y: cy - size / 2, size };
}

function makeUvs(landmarks: Landmark[]) {
  const crop = cropOf(landmarks);
  const uvs = new Float32Array(landmarks.length * 2);
  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i]!;
    uvs[i * 2] = (lm.x - crop.x) / crop.size;
    uvs[i * 2 + 1] = 1 - (lm.y - crop.y) / crop.size;
  }
  return uvs;
}

function makeTexture(source: HTMLCanvasElement, landmarks: Landmark[], contrast: number) {
  const size = 640;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return canvas;
  const crop = cropOf(landmarks);
  ctx.drawImage(
    source,
    crop.x * source.width,
    crop.y * source.height,
    crop.size * source.width,
    crop.size * source.height,
    0,
    0,
    size,
    size,
  );
  const image = ctx.getImageData(0, 0, size, size);
  const data = image.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = clampByte((data[i]! - 128) * contrast + 128);
    data[i + 1] = clampByte((data[i + 1]! - 128) * contrast + 128);
    data[i + 2] = clampByte((data[i + 2]! - 128) * contrast + 128);
  }
  ctx.putImageData(image, 0, 0);
  return canvas;
}

function smoothPositions(pos: Float32Array, indices: Uint32Array, iterations: number): Float32Array {
  const count = pos.length / 3;
  const neighbors: number[][] = Array.from({ length: count }, () => []);
  const seen: Array<Set<number>> = Array.from({ length: count }, () => new Set());
  for (let t = 0; t < indices.length; t += 3) {
    const tri = [indices[t]!, indices[t + 1]!, indices[t + 2]!];
    for (let k = 0; k < 3; k++) {
      const u = tri[k]!;
      const v = tri[(k + 1) % 3]!;
      if (u >= count || v >= count) continue;
      if (!seen[u]!.has(v)) {
        seen[u]!.add(v);
        neighbors[u]!.push(v);
      }
      if (!seen[v]!.has(u)) {
        seen[v]!.add(u);
        neighbors[v]!.push(u);
      }
    }
  }
  const pin = new Set(OVAL.filter((i) => i < count));
  let src = pos;
  for (let iter = 0; iter < iterations; iter++) {
    const dst = new Float32Array(src.length);
    for (let i = 0; i < count; i++) {
      const nbrs = neighbors[i] ?? [];
      if (pin.has(i) || nbrs.length === 0) {
        dst[i * 3] = src[i * 3] ?? 0;
        dst[i * 3 + 1] = src[i * 3 + 1] ?? 0;
        dst[i * 3 + 2] = src[i * 3 + 2] ?? 0;
        continue;
      }
      let ax = 0;
      let ay = 0;
      let az = 0;
      for (const j of nbrs) {
        ax += src[j * 3] ?? 0;
        ay += src[j * 3 + 1] ?? 0;
        az += src[j * 3 + 2] ?? 0;
      }
      const m = nbrs.length;
      const amount = 0.45;
      dst[i * 3] = (src[i * 3] ?? 0) * (1 - amount) + (ax / m) * amount;
      dst[i * 3 + 1] = (src[i * 3 + 1] ?? 0) * (1 - amount) + (ay / m) * amount;
      dst[i * 3 + 2] = (src[i * 3 + 2] ?? 0) * (1 - amount) + (az / m) * amount;
    }
    src = dst;
  }
  return src;
}

function inflateCheeks(pos: Float32Array) {
  const count = pos.length / 3;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < count; i++) {
    const y = pos[i * 3 + 1] ?? 0;
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  for (let i = 0; i < count; i++) {
    const x = pos[i * 3] ?? 0;
    const y = pos[i * 3 + 1] ?? 0;
    const ax = Math.abs(x);
    const yn = (y - minY) / Math.max(0.001, maxY - minY);
    if (ax > 0.025 && ax < 0.085 && yn > 0.25 && yn < 0.72) {
      const w = clamp(1 - Math.abs(ax - 0.05) / 0.04);
      pos[i * 3 + 2] = (pos[i * 3 + 2] ?? 0) + 0.012 * w;
    }
  }
}

function buildMorphs(pos: Float32Array, amp: number) {
  const morphs: Float32Array[] = ARKIT_BLENDSHAPE_NAMES.map(() => new Float32Array(pos.length));
  const put = (name: ArkitName, buf: Float32Array) => {
    morphs[ARKIT_INDEX[name]] = buf;
  };
  const eyes = byX(pos, EYE_A, EYE_B);
  const brows = byX(pos, BROW_A, BROW_B);
  const cheeks = byX(pos, CHEEK_A, CHEEK_B);
  const iris = byX(pos, IRIS_A, IRIS_B);
  const smileLeft = (pos[61 * 3] ?? 0) >= (pos[291 * 3] ?? 0) ? 61 : 291;
  const smileRight = smileLeft === 61 ? 291 : 61;

  put("jawOpen", jawOpen(pos, amp));
  put("jawForward", ids(pos, JAW, 0, 0, 0.018 * amp));
  put("jawLeft", ids(pos, JAW, 0.016 * amp, 0, 0));
  put("jawRight", ids(pos, JAW, -0.016 * amp, 0, 0));
  put("mouthClose", lipClose(pos, amp));
  put("mouthFunnel", toward(pos, MOUTH, amp, 0.22, 0.016));
  put("mouthPucker", toward(pos, MOUTH, amp, 0.48, 0.01));
  put("mouthLeft", ids(pos, MOUTH, 0.012 * amp, 0, 0));
  put("mouthRight", ids(pos, MOUTH, -0.012 * amp, 0, 0));
  put("mouthSmileLeft", corner(pos, smileLeft, amp, 1));
  put("mouthSmileRight", corner(pos, smileRight, amp, -1));
  put("mouthFrownLeft", corner(pos, smileLeft, amp * 0.7, 0.2, -1));
  put("mouthFrownRight", corner(pos, smileRight, amp * 0.7, -0.2, -1));
  put("mouthDimpleLeft", corner(pos, smileLeft, amp * 0.45, 1, 0.2));
  put("mouthDimpleRight", corner(pos, smileRight, amp * 0.45, -1, 0.2));
  put("mouthStretchLeft", corner(pos, smileLeft, amp * 0.8, 1.4, -0.35));
  put("mouthStretchRight", corner(pos, smileRight, amp * 0.8, -1.4, -0.35));
  put("mouthRollLower", ids(pos, LOWER_LIP, 0, 0.008 * amp, -0.008 * amp));
  put("mouthRollUpper", ids(pos, UPPER_LIP, 0, -0.008 * amp, -0.008 * amp));
  put("mouthShrugLower", ids(pos, LOWER_LIP, 0, 0.012 * amp, 0.006 * amp));
  put("mouthShrugUpper", ids(pos, UPPER_LIP, 0, 0.008 * amp, 0.008 * amp));
  put("mouthPressLeft", corner(pos, smileLeft, amp * 0.5, 0.3, -0.2));
  put("mouthPressRight", corner(pos, smileRight, amp * 0.5, -0.3, -0.2));
  put("mouthLowerDownLeft", corner(pos, smileLeft, amp * 0.55, 0.1, -1));
  put("mouthLowerDownRight", corner(pos, smileRight, amp * 0.55, -0.1, -1));
  put("mouthUpperUpLeft", ids(pos, UPPER_LIP, 0, 0.012 * amp, 0.004 * amp));
  put("mouthUpperUpRight", ids(pos, UPPER_LIP, 0, 0.012 * amp, 0.004 * amp));
  put("eyeBlinkLeft", blink(pos, eyes.high, amp, -1));
  put("eyeBlinkRight", blink(pos, eyes.low, amp, -1));
  put("eyeWideLeft", blink(pos, eyes.high, amp, 1));
  put("eyeWideRight", blink(pos, eyes.low, amp, 1));
  put("eyeSquintLeft", blink(pos, eyes.high, amp * 0.45, -1));
  put("eyeSquintRight", blink(pos, eyes.low, amp * 0.45, -1));
  put("eyeLookUpLeft", ids(pos, iris.high.length ? iris.high : eyes.high, 0, 0.008 * amp, 0));
  put("eyeLookDownLeft", ids(pos, iris.high.length ? iris.high : eyes.high, 0, -0.008 * amp, 0));
  put("eyeLookInLeft", ids(pos, iris.high.length ? iris.high : eyes.high, -0.006 * amp, 0, 0));
  put("eyeLookOutLeft", ids(pos, iris.high.length ? iris.high : eyes.high, 0.006 * amp, 0, 0));
  put("eyeLookUpRight", ids(pos, iris.low.length ? iris.low : eyes.low, 0, 0.008 * amp, 0));
  put("eyeLookDownRight", ids(pos, iris.low.length ? iris.low : eyes.low, 0, -0.008 * amp, 0));
  put("eyeLookInRight", ids(pos, iris.low.length ? iris.low : eyes.low, 0.006 * amp, 0, 0));
  put("eyeLookOutRight", ids(pos, iris.low.length ? iris.low : eyes.low, -0.006 * amp, 0, 0));
  put("browDownLeft", ids(pos, brows.high, 0, -0.012 * amp, 0));
  put("browDownRight", ids(pos, brows.low, 0, -0.012 * amp, 0));
  put("browInnerUp", browInner(pos, [...brows.high, ...brows.low], amp));
  put("browOuterUpLeft", browOuter(pos, brows.high, amp));
  put("browOuterUpRight", browOuter(pos, brows.low, amp));
  put("cheekPuff", cheeksOut(pos, cheeks, amp));
  put("cheekSquintLeft", ids(pos, cheeks.high, 0, 0.008 * amp, 0.006 * amp));
  put("cheekSquintRight", ids(pos, cheeks.low, 0, 0.008 * amp, 0.006 * amp));
  put("noseSneerLeft", ids(pos, NOSE, 0.004 * amp, 0.008 * amp, 0));
  put("noseSneerRight", ids(pos, NOSE, -0.004 * amp, 0.008 * amp, 0));
  put("tongueOut", ids(pos, [13, 14, 17], 0, -0.01 * amp, 0.02 * amp));
  return morphs;
}

function jawOpen(pos: Float32Array, amp: number) {
  const buf = new Float32Array(pos.length);
  const lip = avgY(pos, [13, 14, 17, 0]);
  const chin = pos[152 * 3 + 1] ?? lip - 0.05;
  const span = Math.max(0.01, lip - chin);
  for (let i = 0; i < pos.length / 3; i++) {
    const y = pos[i * 3 + 1] ?? 0;
    if (y >= lip) continue;
    const t = clamp((lip - y) / span);
    buf[i * 3 + 1] = -0.05 * amp * t * t;
    buf[i * 3 + 2] = 0.012 * amp * t * t;
  }
  return buf;
}

function lipClose(pos: Float32Array, amp: number) {
  const buf = new Float32Array(pos.length);
  add(buf, pos, LOWER_LIP, 0, 0.012 * amp, 0);
  add(buf, pos, UPPER_LIP, 0, -0.008 * amp, 0);
  return buf;
}

function corner(pos: Float32Array, index: number, amp: number, outward: number, up = 1) {
  const buf = new Float32Array(pos.length);
  const o = index * 3;
  if (o + 2 >= pos.length) return buf;
  const cx = pos[o] ?? 0;
  const cy = pos[o + 1] ?? 0;
  const cz = pos[o + 2] ?? 0;
  for (let i = 0; i < pos.length / 3; i++) {
    const d = Math.hypot((pos[i * 3] ?? 0) - cx, (pos[i * 3 + 1] ?? 0) - cy, (pos[i * 3 + 2] ?? 0) - cz);
    const w = Math.max(0, 1 - d / 0.05);
    if (w === 0) continue;
    const e = w * w;
    buf[i * 3] = outward * 0.014 * amp * e;
    buf[i * 3 + 1] = up * 0.02 * amp * e;
    buf[i * 3 + 2] = 0.005 * amp * e;
  }
  return buf;
}

function blink(pos: Float32Array, eye: number[], amp: number, dir: 1 | -1) {
  const buf = new Float32Array(pos.length);
  let cy = 0;
  let c = 0;
  for (const i of eye) {
    if (i * 3 + 1 >= pos.length) continue;
    cy += pos[i * 3 + 1] ?? 0;
    c++;
  }
  if (!c) return buf;
  cy /= c;
  for (const i of eye) {
    const o = i * 3;
    if (o + 1 >= pos.length) continue;
    const y = pos[o + 1] ?? 0;
    const above = y >= cy;
    const sign = above ? dir : dir * -0.25;
    buf[o + 1] = sign * 0.012 * amp;
  }
  return buf;
}

function toward(pos: Float32Array, group: number[], amp: number, pull: number, z: number) {
  const buf = new Float32Array(pos.length);
  let cx = 0;
  let cy = 0;
  let c = 0;
  for (const i of group) {
    if (i * 3 + 2 >= pos.length) continue;
    cx += pos[i * 3] ?? 0;
    cy += pos[i * 3 + 1] ?? 0;
    c++;
  }
  if (!c) return buf;
  cx /= c;
  cy /= c;
  for (const i of group) {
    const o = i * 3;
    if (o + 2 >= pos.length) continue;
    buf[o] = (cx - (pos[o] ?? 0)) * pull * amp;
    buf[o + 1] = (cy - (pos[o + 1] ?? 0)) * pull * amp;
    buf[o + 2] = z * amp;
  }
  return buf;
}

function browInner(pos: Float32Array, group: number[], amp: number) {
  const buf = new Float32Array(pos.length);
  for (const i of group) {
    const o = i * 3;
    if (o + 1 >= pos.length) continue;
    const w = clamp(1 - Math.abs(pos[o] ?? 0) / 0.05);
    buf[o + 1] = 0.016 * amp * w;
  }
  return buf;
}

function browOuter(pos: Float32Array, group: number[], amp: number) {
  const buf = new Float32Array(pos.length);
  for (const i of group) {
    const o = i * 3;
    if (o + 1 >= pos.length) continue;
    const w = clamp((Math.abs(pos[o] ?? 0) - 0.02) / 0.05);
    buf[o + 1] = 0.014 * amp * w;
  }
  return buf;
}

function cheeksOut(pos: Float32Array, cheeks: { high: number[]; low: number[] }, amp: number) {
  const buf = new Float32Array(pos.length);
  add(buf, pos, cheeks.high, 0.012 * amp, 0, 0.01 * amp);
  add(buf, pos, cheeks.low, -0.012 * amp, 0, 0.01 * amp);
  return buf;
}

function ids(pos: Float32Array, group: number[], dx: number, dy: number, dz: number) {
  const buf = new Float32Array(pos.length);
  add(buf, pos, group, dx, dy, dz);
  return buf;
}

function add(buf: Float32Array, pos: Float32Array, group: number[], dx: number, dy: number, dz: number) {
  for (const i of group) {
    const o = i * 3;
    if (o + 2 >= pos.length) continue;
    buf[o] = (buf[o] ?? 0) + dx;
    buf[o + 1] = (buf[o + 1] ?? 0) + dy;
    buf[o + 2] = (buf[o + 2] ?? 0) + dz;
  }
}

function byX(pos: Float32Array, a: number[], b: number[]) {
  return meanX(pos, a) >= meanX(pos, b) ? { high: a, low: b } : { high: b, low: a };
}

function meanX(pos: Float32Array, group: number[]) {
  let s = 0;
  let c = 0;
  for (const i of group) {
    if (i * 3 >= pos.length) continue;
    s += pos[i * 3] ?? 0;
    c++;
  }
  return c ? s / c : 0;
}

function avgY(pos: Float32Array, group: number[]) {
  let s = 0;
  let c = 0;
  for (const i of group) {
    if (i * 3 + 1 >= pos.length) continue;
    s += pos[i * 3 + 1] ?? 0;
    c++;
  }
  return c ? s / c : 0;
}

function clamp(v: number) {
  return Math.max(0, Math.min(1, v));
}

function clampByte(v: number) {
  return Math.max(0, Math.min(255, v));
}
