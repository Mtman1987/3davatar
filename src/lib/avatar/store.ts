import { create } from "zustand";
import type { BodyId, FaceChoice, HairId, OutfitId, Panel, Preset, Screen, SkinId } from "@/lib/avatar/constants";

export type TalkPhase = "off" | "gen" | "play" | "mic";

type StudioState = {
  screen: Screen;
  panel: Panel;
  body: BodyId;
  outfit: OutfitId;
  hair: HairId;
  skin: SkinId;
  faceChoice: FaceChoice;
  preset: Preset;
  headScale: number;
  headY: number;
  headZ: number;
  expression: number;
  status: "idle" | "working" | "ready" | "error";
  statusText: string;
  error: string | null;
  hasFace: boolean;
  faceRev: number;
  photoPreview: string | null;
  talk: TalkPhase;
  talkNote: string | null;
  line: string;
  voiceId: string;
  patch: (partial: Partial<StudioState>) => void;
};

export const useStudio = create<StudioState>((set) => ({
  screen: "home",
  panel: "body",
  body: "balanced",
  outfit: "hoodie",
  hair: "short",
  skin: "sand",
  faceChoice: "standard",
  preset: "captured",
  headScale: 1.05,
  headY: 0.01,
  headZ: 0.02,
  expression: 1,
  status: "idle",
  statusText: "",
  error: null,
  hasFace: false,
  faceRev: 0,
  photoPreview: null,
  talk: "off",
  talkNote: null,
  line: "Hey, I'm ready when you are.",
  voiceId: "eve",
  patch: (partial) => set(partial),
}));
