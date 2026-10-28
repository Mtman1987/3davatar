import type { BodyAssetId, FaceChoice } from "@/lib/avatar/constants";

/** Exact live photo-face transform, recorded independently of the UI sliders. */
export type FaceFitSnapshot = {
  version: 1;
  bodyAsset: BodyAssetId;
  faceChoice: FaceChoice;
  parentName: string;
  position: [number, number, number];
  rotation: [number, number, number];
  scale: [number, number, number];
  worldPosition: [number, number, number];
  worldRotation: [number, number, number];
  worldScale: [number, number, number];
  capturedAt: number;
};

function isTriple(value: unknown): value is [number, number, number] {
  return Array.isArray(value) &&
    value.length === 3 &&
    value.every((part) => typeof part === "number" && Number.isFinite(part));
}

/** Validate imported IndexedDB/JSON data before applying it to a Three.js mesh. */
export function isFaceFitSnapshot(value: unknown): value is FaceFitSnapshot {
  if (!value || typeof value !== "object") return false;
  const row = value as Partial<FaceFitSnapshot>;
  return row.version === 1 &&
    (row.bodyAsset === "male" || row.bodyAsset === "female") &&
    (row.faceChoice === "standard" || row.faceChoice === "detail") &&
    typeof row.parentName === "string" &&
    isTriple(row.position) &&
    isTriple(row.rotation) &&
    isTriple(row.scale) &&
    isTriple(row.worldPosition) &&
    isTriple(row.worldRotation) &&
    isTriple(row.worldScale) &&
    typeof row.capturedAt === "number" && Number.isFinite(row.capturedAt);
}
