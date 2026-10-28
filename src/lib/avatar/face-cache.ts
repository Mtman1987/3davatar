export type BuiltFace = {
  positions: Float32Array;
  uvs: Float32Array;
  indices: Uint32Array;
  morphs: Float32Array[];
  influences: number[];
  texture: HTMLCanvasElement;
};

type Cache = {
  standard: BuiltFace;
  detail: BuiltFace;
};

let cache: Cache | null = null;

export function getFaceCache() {
  return cache;
}

export function setFaceCache(next: Cache) {
  cache = next;
}

export function clearFaceCache() {
  cache = null;
}
