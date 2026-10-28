import { createServerFn } from "@tanstack/react-start";
import { VOICES } from "@/lib/avatar/constants";

const ALLOWED = new Set<string>(VOICES.map((voice) => voice.id));

export const speakLine = createServerFn({ method: "POST" })
  .validator((input: unknown) => {
    const raw = (input ?? {}) as { text?: unknown; voiceId?: unknown };
    const text = typeof raw.text === "string" ? raw.text.trim().slice(0, 280) : "";
    const voiceId = typeof raw.voiceId === "string" && ALLOWED.has(raw.voiceId) ? raw.voiceId : "eve";
    return { text, voiceId };
  })
  .handler(async ({ data }) => {
    if (!data.text) return { ok: false as const, error: "Type a line first." };
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false as const, error: "AI voice isn't available right now. Use the live mic, or this phone's voice." };
    }
    const res = await fetch("https://api.x.ai/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: data.text,
        voice_id: data.voiceId,
        language: "en",
      }),
    });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || type.includes("application/json") || type.includes("text/")) {
      return { ok: false as const, error: "The AI voice didn't come back. Try again, or use this phone's voice." };
    }
    const bytes = new Uint8Array(await res.arrayBuffer());
    if (bytes.byteLength < 200) {
      return { ok: false as const, error: "The AI voice came back empty. Try again." };
    }
    let binary = "";
    const chunk = 0x8000;
    for (let i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
    }
    return { ok: true as const, audioBase64: btoa(binary), mime: "audio/mpeg" };
  });
