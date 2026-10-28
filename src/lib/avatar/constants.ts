export const BODY_ASSETS = [
  { id: "male", label: "Male", note: "Load the real male base GLB", url: "/models/male-base-mesh-base_male.glb" },
  { id: "female", label: "Female", note: "Load the real female base GLB", url: "/models/female-base-mesh-base_female.glb" },
] as const;

export const FINISHED_MODEL_URL = "/models/neon-gamer-facial-v2.glb";
export const FINISHED_MODEL_NAME = "Neon Gamer — Finished Commission";

export const OUTFITS = [
  { id: "tee", label: "Tee", note: "Plain shirt" },
  { id: "hoodie", label: "Hoodie", note: "Hood up" },
  { id: "jacket", label: "Jacket", note: "Collared layer" },
  { id: "dress", label: "Dress", note: "Flared skirt" },
  { id: "layers", label: "Layers", note: "Shirt and overshirt" },
] as const;
export const HAIR = [{ id: "none", label: "None" }, { id: "short", label: "Short" }, { id: "long", label: "Long" }] as const;
export const SKINS = [
  { id: "porcelain", label: "Porcelain", swatch: "#f2d3c4" },
  { id: "sand", label: "Sand", swatch: "#e0b08a" },
  { id: "amber", label: "Amber", swatch: "#c68642" },
  { id: "bronze", label: "Bronze", swatch: "#8d5524" },
  { id: "deep", label: "Deep", swatch: "#4b2e1f" },
] as const;
export const VOICES = [
  { id: "eve", label: "Eve", note: "Warm" }, { id: "ara", label: "Ara", note: "Bright" },
  { id: "leo", label: "Leo", note: "Calm" }, { id: "rex", label: "Rex", note: "Low" },
  { id: "sal", label: "Sal", note: "Easy" },
] as const;

export type BodyAssetId = (typeof BODY_ASSETS)[number]["id"];
export type BodyId = BodyAssetId;
export type OutfitId = (typeof OUTFITS)[number]["id"];
export type HairId = (typeof HAIR)[number]["id"];
export type SkinId = (typeof SKINS)[number]["id"];
export type VoiceId = (typeof VOICES)[number]["id"];
export type FaceChoice = "standard" | "detail";
export type Preset = "captured" | "smile" | "blink" | "wow";
export type Panel = "body" | "look" | "face" | "voice" | "save" | "finished";
export type Screen = "home" | "studio" | "library";
export function labelOf<T extends { id: string; label: string }>(list: readonly T[], id: string) {
  return list.find((item) => item.id === id)?.label ?? id;
}
export function bodyUrl(id: BodyAssetId) {
  return BODY_ASSETS.find((item) => item.id === id)?.url ?? BODY_ASSETS[0].url;
}
