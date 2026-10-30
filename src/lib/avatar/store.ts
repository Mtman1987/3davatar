import { create } from "zustand";
import type { BodyAssetId, FaceChoice, HairId, OutfitId, Panel, Preset, Screen, SkinId } from "@/lib/avatar/constants";

export type TalkPhase = "off" | "gen" | "play" | "mic";
type StudioState = {
  screen: Screen; panel: Panel; bodyAsset: BodyAssetId; modelUrl: string | null; modelName: string | null; generatedHeadUrl: string | null;
  outfit: OutfitId; hair: HairId; skin: SkinId; faceChoice: FaceChoice; preset: Preset;
  headScale: number; headY: number; headZ: number; eyeDepth: number; expression: number;
  status: "idle" | "working" | "ready" | "error"; statusText: string; error: string | null;
  hasFace: boolean; faceRev: number; photoPreview: string | null; talk: TalkPhase; talkNote: string | null;
  line: string; voiceId: string; morphNames: string[]; animationNames: string[];
  patch: (partial: Partial<StudioState>) => void;
};
export const useStudio = create<StudioState>((set) => ({
  screen: "home", panel: "body", bodyAsset: "male", modelUrl: null, modelName: null, generatedHeadUrl: null,
  outfit: "hoodie", hair: "short", skin: "sand", faceChoice: "standard", preset: "captured",
  headScale: 0.79, headY: 0, headZ: 0.085, eyeDepth: 0, expression: 1.04, status: "idle", statusText: "", error: null,
  hasFace: false, faceRev: 0, photoPreview: null, talk: "off", talkNote: null,
  line: "Hey, I'm ready when you are.", voiceId: "eve", morphNames: [], animationNames: [],
  patch: (partial) => set(partial),
}));
