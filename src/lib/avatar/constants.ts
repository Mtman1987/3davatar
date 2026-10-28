export const BODIES = [
  { id: "slim", label: "Slim", note: "Narrow shoulders" },
  { id: "balanced", label: "Balanced", note: "Everyday build" },
  { id: "athletic", label: "Athletic", note: "Broader shoulders" },
  { id: "solid", label: "Solid", note: "Fuller torso" },
] as const;

export const OUTFITS = [
  { id: "tee", label: "Tee", note: "Plain shirt" },
  { id: "hoodie", label: "Hoodie", note: "Hood up" },
  { id: "jacket", label: "Jacket", note: "Collared layer" },
  { id: "dress", label: "Dress", note: "Flared skirt" },
  { id: "layers", label: "Layers", note: "Shirt and overshirt" },
] as const;

export const HAIR = [
  { id: "none", label: "None" },
  { id: "short", label: "Short" },
  { id: "long", label: "Long" },
] as const;

export const SKINS = [
  { id: "porcelain", label: "Porcelain", swatch: "#f2d3c4" },
  { id: "sand", label: "Sand", swatch: "#e0b08a" },
  { id: "amber", label: "Amber", swatch: "#c68642" },
  { id: "bronze", label: "Bronze", swatch: "#8d5524" },
  { id: "deep", label: "Deep", swatch: "#4b2e1f" },
] as const;

export const VOICES = [
  { id: "eve", label: "Eve", note: "Warm" },
  { id: "ara", label: "Ara", note: "Bright" },
  { id: "leo", label: "Leo", note: "Calm" },
  { id: "rex", label: "Rex", note: "Low" },
  { id: "sal", label: "Sal", note: "Easy" },
] as const;

export type BodyId = (typeof BODIES)[number]["id"];
export type OutfitId = (typeof OUTFITS)[number]["id"];
export type HairId = (typeof HAIR)[number]["id"];
export type SkinId = (typeof SKINS)[number]["id"];
export type VoiceId = (typeof VOICES)[number]["id"];
export type FaceChoice = "standard" | "detail";
export type Preset = "captured" | "smile" | "blink" | "wow";
export type Panel = "body" | "look" | "face" | "voice" | "save";
export type Screen = "home" | "studio" | "library";

export function labelOf<T extends { id: string; label: string }>(list: readonly T[], id: string) {
  return list.find((item) => item.id === id)?.label ?? id;
}
