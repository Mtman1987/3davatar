import { create } from "zustand";
import type { BodyAssetId, FaceChoice, HairId, OutfitId, Panel, Preset, Screen, SkinId } from "@/lib/avatar/constants";
import type { FaceFitSnapshot } from "@/lib/avatar/face-fit";

export type TalkPhase = "off" | "gen" | "play" | "mic";
type StudioState = {
  screen: Screen; panel: Panel; bodyAsset: BodyAssetId; modelUrl: string | null; modelName: string | null;
  outfit: OutfitId; hair: HairId; skin: SkinId; faceChoice: FaceChoice; preset: Preset;
  headScale: number; headY: number; headZ: number; expression: number; faceFitSnapshot: FaceFitSnapshot | null;
  status: "idle" | "working" | "ready" | "error"; statusText: string; error: string | null;
  hasFace: boolean; faceRev: number; photoPreview: string | null; talk: TalkPhase; talkNote: string | null;
  line: string; voiceId: string; morphNames: string[]; animationNames: string[];
  patch: (partial: Partial<StudioState>) => void;
};
export const useStudio = create<StudioState>((set) => ({
  screen: "home", panel: "body", bodyAsset: "male", modelUrl: null, modelName: null,
  outfit: "hoodie", hair: "short", skin: "sand", faceChoice: "standard", preset: "captured",
  headScale: 1, headY: 0, headZ: 0, expression: 1, faceFitSnapshot: null, status: "idle", statusText: "", error: null,
  hasFace: false, faceRev: 0, photoPreview: null, talk: "off", talkNote: null,
  line: "Hey, I'm ready when you are.", voiceId: "eve", morphNames: [], animationNames: [],
  patch: (partial) => set(partial),
}));
