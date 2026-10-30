export type FacePipelineMetadata = {
  detector: "MediaPipe Face Landmarker";
  landmarkCount: number;
  blendshapeCount: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceAspectRatio: number;
  transformMatrix: number[] | null;
  transformMatrixDimensions: [number, number] | null;
};

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
  // Keep the raw MediaPipe outputs available to fit diagnostics and comparison
  // tooling without coupling them to the renderer or changing the GLB export.
  metadata?: FacePipelineMetadata;
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
