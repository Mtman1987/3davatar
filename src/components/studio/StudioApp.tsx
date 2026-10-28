import { useEffect, useRef, useState, type ChangeEvent, type RefObject } from "react";
import {
  AudioLines,
  Box,
  Camera,
  Check,
  ChevronLeft,
  Download,
  ImagePlus,
  Mic,
  RotateCcw,
  Save,
  Shirt,
  Smile,
  Square,
  Trash2,
  UserRound,
} from "lucide-react";
import { BODY_ASSETS, FINISHED_MODEL_URL, FINISHED_MODEL_NAME, HAIR, OUTFITS, SKINS, VOICES, labelOf, type Panel } from "@/lib/avatar/constants";
import { deleteAvatar, getPendingPhoto, listAvatars, saveAvatar, setPendingPhoto, type SavedAvatar } from "@/lib/avatar/gallery";
import { speakLine } from "@/lib/avatar/speak";
import { scriptWeights, Sound2Face } from "@/lib/avatar/sound2face";
import { useStudio } from "@/lib/avatar/store";
import { Viewport, type ViewportHandle } from "@/components/studio/Viewport";

const PANELS: { id: Panel; label: string; icon: typeof UserRound }[] = [
  { id: "body", label: "Body", icon: UserRound },
  { id: "finished", label: "Finished", icon: Box },
  { id: "look", label: "Look", icon: Shirt },
  { id: "face", label: "Face", icon: Smile },
  { id: "voice", label: "Voice", icon: AudioLines },
  { id: "save", label: "Save", icon: Save },
];

export function StudioApp() {
  const screen = useStudio((s) => s.screen);
  const patch = useStudio((s) => s.patch);
  const cameraRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const engineRef = useRef<Sound2Face | null>(null);
  const [saved, setSaved] = useState<SavedAvatar[]>([]);

  useEffect(() => {
    const engine = new Sound2Face();
    engine.onEnd = () => patch({ talk: "off" });
    engineRef.current = engine;
    return () => engine.dispose();
  }, [patch]);

  useEffect(() => {
    void listAvatars().then(setSaved).catch(() => setSaved([]));
  }, [screen]);

  async function takePhoto(file: Blob) {
    patch({
      screen: "studio",
      panel: "face",
      status: "working",
      statusText: "Finding your face…",
      error: null,
    });
    try {
      const { prepareAndDetect } = await import("@/lib/avatar/detect");
      const preview = await prepareAndDetect(file, (statusText) => patch({ statusText }));
      const state = useStudio.getState();
      patch({
        status: "ready",
        statusText: "",
        hasFace: true,
        faceRev: state.faceRev + 1,
        photoPreview: preview,
        error: null,
      });
    } catch (error) {
      const missing = error instanceof Error && error.message === "NO_FACE";
      patch({
        status: "error",
        statusText: "",
        error: missing
          ? "We could not find a face in that photo. Try another one, looking straight at the camera."
          : "Face detection didn't start. Please try again.",
      });
    }
  }

  async function onFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (file) await takePhoto(file);
  }

  async function useSample() {
    const res = await fetch("/samples/portrait.jpg");
    if (!res.ok) {
      patch({ screen: "studio", error: "The sample portrait is missing.", status: "error" });
      return;
    }
    await takePhoto(await res.blob());
  }

  return (
    <>
      <input ref={cameraRef} className="sr-only" type="file" accept="image/*" capture="user" onChange={onFile} />
      <input ref={libraryRef} className="sr-only" type="file" accept="image/*" onChange={onFile} />
      {screen === "home" ? (
        <Home
          savedCount={saved.length}
          onCamera={() => cameraRef.current?.click()}
          onLibrary={() => libraryRef.current?.click()}
          onSample={() => void useSample()}
          onBrowse={() => patch({ screen: "studio", panel: "body", error: null, status: "idle" })}
          onFinished={() => patch({ screen: "studio", panel: "finished", modelUrl: FINISHED_MODEL_URL, modelName: FINISHED_MODEL_NAME, status: "working", statusText: "Loading commissioned model…", error: null })}
          onSaved={() => patch({ screen: "library" })}
        />
      ) : null}
      {screen === "library" ? (
        <Library
          items={saved}
          onBack={() => patch({ screen: "home" })}
          onOpen={(item) => void restore(item, takePhoto)}
          onDelete={async (id) => {
            await deleteAvatar(id);
            setSaved(await listAvatars());
          }}
        />
      ) : null}
      {screen === "studio" ? (
        <Studio
          engineRef={engineRef}
          onBack={() => {
            engineRef.current?.stop();
            patch({ screen: "home", talk: "off" });
          }}
          onCamera={() => cameraRef.current?.click()}
          onLibrary={() => libraryRef.current?.click()}
          onSample={() => void useSample()}
          refreshSaves={async () => setSaved(await listAvatars())}
        />
      ) : null}
    </>
  );
}

function Home({
  savedCount,
  onCamera,
  onLibrary,
  onSample,
  onBrowse,
  onFinished,
  onSaved,
}: {
  savedCount: number;
  onCamera: () => void;
  onLibrary: () => void;
  onSample: () => void;
  onBrowse: () => void;
  onFinished: () => void;
  onSaved: () => void;
}) {
  return (
    <div className="weave safe-top safe-bottom min-h-dvh">
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-8">
        <header className="flex items-center justify-between py-4">
          <p className="text-xs font-medium tracking-[0.22em] text-muted uppercase">AvatarAce</p>
          <button type="button" className="text-sm text-fg" onClick={onSaved}>
            Saved{savedCount ? ` ${savedCount}` : ""}
          </button>
        </header>
        <div className="flex flex-1 flex-col justify-end">
          <h1 className="font-display text-4xl leading-[1.05] font-medium text-balance text-fg">
            Your face, a body, and a voice.
          </h1>
          <p className="mt-4 max-w-sm text-pretty text-muted">
            Build a 3D avatar from a photo, then let Sound2Face move it while an AI voice — or you — talks.
          </p>
          <div className="mt-8 flex flex-col gap-3">
            <button type="button" className="h-14 rounded-full bg-primary text-base font-medium text-primary-fg" onClick={onCamera}>
              Take a photo
            </button>
            <button type="button" className="h-12 rounded-full border border-border bg-surface text-fg" onClick={onLibrary}>
              Choose from library
            </button>
            <button type="button" className="h-12 rounded-full text-muted" onClick={onBrowse}>
              Browse the studio first
            </button>
            <button type="button" className="h-12 rounded-full border border-primary text-primary" onClick={onFinished}>
              Load finished commission
            </button>
            <button type="button" className="h-12 text-sm text-accent" onClick={onSample}>
              Try the sample portrait
            </button>
          </div>
          <section className="mt-8 rounded-2xl border border-border bg-surface p-4">
            <h2 className="font-medium text-fg">On your phone</h2>
            <p className="mt-1 text-sm text-pretty text-muted">
              Add this to your home screen and it opens full screen, from its own icon. No app store.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-fg">
              <li>
                <span className="text-primary">iPhone</span> — Share, then Add to Home Screen
              </li>
              <li>
                <span className="text-primary">Android</span> — menu, then Install app or Add to Home screen
              </li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  );
}

function Library({
  items,
  onBack,
  onOpen,
  onDelete,
}: {
  items: SavedAvatar[];
  onBack: () => void;
  onOpen: (item: SavedAvatar) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="safe-top safe-bottom min-h-dvh bg-bg">
      <div className="mx-auto w-full max-w-lg px-5 pb-10">
        <header className="flex items-center gap-3 py-4">
          <button type="button" className="grid size-11 place-items-center rounded-full bg-surface text-fg" onClick={onBack} aria-label="Back">
            <ChevronLeft className="size-5" />
          </button>
          <h1 className="font-display text-2xl text-fg">Saved on this phone</h1>
        </header>
        {items.length === 0 ? (
          <p className="mt-8 text-pretty text-muted">Nothing saved yet. Build one in the studio, then tap Save on this phone.</p>
        ) : (
          <ul className="mt-2 space-y-3">
            {items.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-2">
                <button type="button" className="flex min-w-0 flex-1 items-center gap-3 text-left" onClick={() => onOpen(item)}>
                  {item.thumb ? (
                    <img src={item.thumb} alt="" className="size-16 rounded-xl object-cover" />
                  ) : (
                    <span className="grid size-16 place-items-center rounded-xl bg-surface-2 text-muted">3D</span>
                  )}
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-fg">{item.title}</span>
                    <span className="block text-sm text-muted">{new Date(item.createdAt).toLocaleDateString()}</span>
                  </span>
                </button>
                <button type="button" className="grid size-11 place-items-center text-muted" aria-label="Delete" onClick={() => onDelete(item.id)}>
                  <Trash2 className="size-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Studio({
  engineRef,
  onBack,
  onCamera,
  onLibrary,
  onSample,
  refreshSaves,
}: {
  engineRef: RefObject<Sound2Face | null>;
  onBack: () => void;
  onCamera: () => void;
  onLibrary: () => void;
  onSample: () => void;
  refreshSaves: () => Promise<void>;
}) {
  const state = useStudio();
  const viewRef = useRef<ViewportHandle>(null);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [showPhoneVoice, setShowPhoneVoice] = useState(false);
  const [animationIndex, setAnimationIndex] = useState(0);
  const [animationPlaying, setAnimationPlaying] = useState(false);
  const [morphWeights, setMorphWeights] = useState<Record<string, number>>({});

  async function speakAi() {
    const engine = engineRef.current;
    const { line, voiceId } = useStudio.getState();
    if (!engine || !line.trim()) return;
    engine.unlock();
    engine.stop();
    state.patch({ talk: "gen", talkNote: null });
    const result = await speakLine({ data: { text: line, voiceId } });
    if (!result.ok) {
      state.patch({ talk: "off", talkNote: result.error });
      setShowPhoneVoice(true);
      return;
    }
    const raw = atob(result.audioBase64);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    try {
      await engine.play(bytes.buffer);
      state.patch({ talk: "play" });
    } catch {
      state.patch({ talk: "off", talkNote: "That audio couldn't play. Try this phone's voice." });
      setShowPhoneVoice(true);
    }
  }

  function speakLocal() {
    const engine = engineRef.current;
    const line = useStudio.getState().line.trim();
    if (!engine || !line || !("speechSynthesis" in window)) return;
    engine.stop();
    const duration = Math.max(1000, line.length * 64);
    const start = performance.now();
    let raf = 0;
    const utter = new SpeechSynthesisUtterance(line);
    const finish = () => {
      cancelAnimationFrame(raf);
      engine.setScripted(null);
      state.patch({ talk: "off" });
    };
    utter.onstart = () => {
      state.patch({ talk: "play", talkNote: null });
      const tick = () => {
        const t = (performance.now() - start) / duration;
        if (t >= 1) return;
        engine.setScripted(scriptWeights(t));
        raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    };
    utter.onend = finish;
    utter.onerror = finish;
    window.speechSynthesis.speak(utter);
  }

  async function liveMic() {
    const engine = engineRef.current;
    if (!engine) return;
    engine.unlock();
    state.patch({ talk: "mic", talkNote: null });
    try {
      await engine.startMic();
    } catch {
      engine.stop();
      state.patch({
        talk: "off",
        talkNote: "The microphone isn't available here. Try the AI voice, or open this on your phone.",
      });
    }
  }

  function stopTalk() {
    engineRef.current?.stop();
    state.patch({ talk: "off" });
  }

  async function download() {
    try {
      const blob = await viewRef.current?.exportGlb();
      if (!blob) return;
      const file = new File([blob], "streamweaver-avatar.glb", { type: "model/gltf-binary" });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: "StreamWeaver avatar" });
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = file.name;
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setSaveNote("Couldn't export just then. Try again.");
    }
  }

  async function keep() {
    const snap = useStudio.getState();
    const thumb = viewRef.current?.snapshot() || snap.photoPreview || "";
    await saveAvatar({
      id: crypto.randomUUID(),
      createdAt: Date.now(),
      title: snap.modelName ?? `${labelOf(BODY_ASSETS, snap.bodyAsset)} · ${labelOf(OUTFITS, snap.outfit)}`,
      thumb,
      photo: getPendingPhoto(),
      bodyAsset: snap.bodyAsset,
      outfit: snap.outfit,
      hair: snap.hair,
      skin: snap.skin,
      faceChoice: snap.faceChoice,
      headScale: snap.headScale,
      headY: snap.headY,
      headZ: snap.headZ,
      expression: snap.expression,
    });
    await refreshSaves();
    setSaveNote("Saved on this phone.");
  }

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg text-fg lg:grid lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="relative min-h-0 flex-1 bg-bg">
        <Viewport
          ref={viewRef}
          bodyAsset={state.bodyAsset}
          modelUrl={state.modelUrl}
          modelName={state.modelName}
          sampleTracking={() => null}
          animationIndex={animationIndex}
          animationPlaying={animationPlaying}
          manualMorphs={morphWeights}
          onModelInfo={(info) => { setAnimationIndex(0); setAnimationPlaying(false); setMorphWeights({}); state.patch({ morphNames: info.morphNames, animationNames: info.animationNames, status: "ready", statusText: "", error: null }); }}
          onError={(msg) => { if (msg) state.patch({ status: "error", statusText: "", error: msg }); }}
          outfit={state.outfit}
          hair={state.hair}
          skin={state.skin}
          faceChoice={state.faceChoice}
          preset={state.preset}
          headScale={state.headScale}
          headY={state.headY}
          headZ={state.headZ}
          expression={state.expression}
          faceRev={state.faceRev}
          sampleSound={() => engineRef.current?.sample() ?? null}
        />
        <div className="safe-top pointer-events-none absolute inset-x-0 top-0 flex items-center justify-between px-3">
          <button type="button" className="pointer-events-auto grid size-11 place-items-center rounded-full bg-surface/90 text-fg" onClick={onBack} aria-label="Back">
            <ChevronLeft className="size-5" />
          </button>
          <p className="rounded-full bg-surface/90 px-3 py-1 text-xs tracking-wide text-muted">Drag to turn</p>
          <span className="size-11" />
        </div>
        {state.status === "working" ? (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm text-fg" role="status">
            {state.statusText}
          </p>
        ) : null}
        {state.talk === "play" || state.talk === "mic" ? (
          <p className="absolute inset-x-0 bottom-4 text-center text-sm text-primary" role="status">
            {state.talk === "mic" ? "Listening — the face is following you" : "Speaking — the face is following the audio"}
          </p>
        ) : null}
      </div>
      <section className="safe-bottom flex max-h-[52dvh] flex-col border-t border-border bg-surface lg:max-h-none lg:border-t-0 lg:border-l">
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
          {state.panel === "body" ? <BodyPanel /> : null}
          {state.panel === "finished" ? <FinishedPanel animationIndex={animationIndex} onAnimationChange={setAnimationIndex} animationPlaying={animationPlaying} onToggleAnimation={() => setAnimationPlaying((playing) => !playing)} morphWeights={morphWeights} onMorphChange={(name, value) => setMorphWeights((current) => ({ ...current, [name]: value }))} onResetMorphs={() => setMorphWeights({})} /> : null}
          {state.panel === "look" ? <LookPanel /> : null}
          {state.panel === "face" ? (
            <FacePanel onCamera={onCamera} onLibrary={onLibrary} onSample={onSample} />
          ) : null}
          {state.panel === "voice" ? (
            <VoicePanel
              showPhoneVoice={showPhoneVoice}
              onAi={() => void speakAi()}
              onMic={() => void liveMic()}
              onLocal={speakLocal}
              onStop={stopTalk}
            />
          ) : null}
          {state.panel === "save" ? (
            <SavePanel note={saveNote} onDownload={() => void download()} onKeep={() => void keep()} />
          ) : null}
        </div>
        <nav className="grid grid-cols-6 border-t border-border">
          {PANELS.map((panel) => {
            const Icon = panel.icon;
            const on = state.panel === panel.id;
            return (
              <button
                key={panel.id}
                type="button"
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-xs ${on ? "text-primary" : "text-muted"}`}
                onClick={() => state.patch({ panel: panel.id })}
              >
                <Icon className="size-4" />
                {panel.label}
              </button>
            );
          })}
        </nav>
      </section>
    </div>
  );
}

function BodyPanel() {
  const bodyAsset = useStudio((s) => s.bodyAsset);
  const modelUrl = useStudio((s) => s.modelUrl);
  const patch = useStudio((s) => s.patch);
  return (
    <div>
      <h2 className="font-display text-xl text-fg">Choose a body</h2>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {BODY_ASSETS.map((item) => (
          <Choice key={item.id} on={bodyAsset === item.id && !modelUrl} label={item.label} note={item.note} onClick={() => patch({ bodyAsset: item.id, modelUrl: null, modelName: null, status: "working", statusText: "Loading base model…", error: null })} />
        ))}
      </div>
    </div>
  );
}

function FinishedPanel({ animationIndex, onAnimationChange, animationPlaying, onToggleAnimation, morphWeights, onMorphChange, onResetMorphs }: {
  animationIndex: number;
  onAnimationChange: (index: number) => void;
  animationPlaying: boolean;
  onToggleAnimation: () => void;
  morphWeights: Record<string, number>;
  onMorphChange: (name: string, value: number) => void;
  onResetMorphs: () => void;
}) {
  const state = useStudio();
  return <div className="space-y-3">
    <h2 className="font-display text-xl text-fg">Finished commission</h2>
    <p className="text-sm text-muted">Load the exact commissioned GLB with its embedded morph targets and animation clips.</p>
    <button type="button" className="h-12 w-full rounded-full bg-primary font-medium text-primary-fg" onClick={() => state.patch({ modelUrl: FINISHED_MODEL_URL, modelName: FINISHED_MODEL_NAME, status: "working", statusText: "Loading commissioned model…", error: null })}>Load finished commission</button>
    <button type="button" className="h-11 w-full rounded-full border border-border" onClick={() => state.patch({ modelUrl: null, modelName: null, bodyAsset: "male", status: "working", statusText: "Loading male base…", error: null, panel: "body" })}>Back to male base</button>
    {state.error ? <p role="alert" className="text-sm text-red-400">{state.error}</p> : null}
    <p className="text-xs text-muted">Morph targets: {state.morphNames.length} · Animations: {state.animationNames.length}</p>
    {state.animationNames.length ? (
      <div className="space-y-2">
        <label className="block text-xs text-muted" htmlFor="commission-animation">Embedded animation</label>
        <select id="commission-animation" className="h-11 w-full rounded-xl border border-border bg-bg px-3 text-sm text-fg" value={Math.min(animationIndex, state.animationNames.length - 1)} onChange={(event) => onAnimationChange(Number(event.target.value))}>
          {state.animationNames.map((name, index) => <option key={index} value={index}>{name}</option>)}
        </select>
        <button type="button" className="h-11 w-full rounded-full border border-border" onClick={onToggleAnimation}>{animationPlaying ? "Stop animation" : "Play animation"}</button>
      </div>
    ) : null}
    {state.morphNames.length ? (
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium text-fg">Facial morph targets</h3>
          <button type="button" className="text-xs text-accent" onClick={onResetMorphs}>Reset all</button>
        </div>
        <p className="text-xs text-muted">Adjust a morph to preview it on the actual loaded model.</p>
        <div className="max-h-56 space-y-3 overflow-y-auto rounded-xl border border-border p-3">
          {state.morphNames.map((name) => (
            <label key={name} className="block space-y-1">
              <span className="flex justify-between gap-2 text-xs text-muted"><span className="truncate">{name}</span><span>{(morphWeights[name] ?? 0).toFixed(2)}</span></span>
              <input aria-label={name} className="w-full" type="range" min="0" max="1" step="0.01" value={morphWeights[name] ?? 0} onChange={(event) => onMorphChange(name, Number(event.target.value))} />
            </label>
          ))}
        </div>
      </div>
    ) : null}
  </div>;
}

function LookPanel() {
  const outfit = useStudio((s) => s.outfit);
  const hair = useStudio((s) => s.hair);
  const skin = useStudio((s) => s.skin);
  const patch = useStudio((s) => s.patch);
  return (
    <div className="space-y-4">
      <div>
        <h2 className="font-display text-xl text-fg">Choose an outfit</h2>
        <div className="mt-3 grid grid-cols-2 gap-2">
          {OUTFITS.map((item) => (
            <Choice key={item.id} on={outfit === item.id} label={item.label} note={item.note} onClick={() => patch({ outfit: item.id })} />
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm text-muted">Hair</h3>
        <div className="mt-2 flex gap-2">
          {HAIR.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`h-11 flex-1 rounded-full border ${hair === item.id ? "border-primary bg-surface-2 text-fg" : "border-border text-muted"}`}
              onClick={() => patch({ hair: item.id })}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div>
        <h3 className="text-sm text-muted">Skin</h3>
        <div className="mt-2 flex gap-2">
          {SKINS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.label}
              className={`size-11 rounded-full border-2 ${skin === item.id ? "border-primary" : "border-transparent"}`}
              style={{ background: item.swatch }}
              onClick={() => patch({ skin: item.id })}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function FacePanel({ onCamera, onLibrary, onSample }: { onCamera: () => void; onLibrary: () => void; onSample: () => void }) {
  const state = useStudio();
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-xl text-fg">Create a face</h2>
        {state.photoPreview ? <img src={state.photoPreview} alt="" className="size-12 rounded-full object-cover" /> : null}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary text-sm font-medium text-primary-fg" onClick={onCamera}>
          <Camera className="size-4" /> Camera
        </button>
        <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-full border border-border text-sm text-fg" onClick={onLibrary}>
          <ImagePlus className="size-4" /> Library
        </button>
      </div>
      <button type="button" className="text-sm text-accent" onClick={onSample}>
        Use the sample portrait
      </button>
      {state.error ? <p className="text-sm text-pretty text-fg">{state.error}</p> : null}
      <div className="grid grid-cols-2 gap-2">
        <Choice
          on={state.faceChoice === "standard"}
          label="Standard"
          note="Closest to the photo"
          disabled={!state.hasFace}
          onClick={() => state.patch({ faceChoice: "standard" })}
        />
        <Choice
          on={state.faceChoice === "detail"}
          label="Higher detail"
          note="Smoother, stronger"
          disabled={!state.hasFace}
          onClick={() => state.patch({ faceChoice: "detail" })}
        />
      </div>
      <p className="text-sm text-pretty text-muted">Both keep the 52 expressions, so Sound2Face and Audio2Face can drive them.</p>
      <div className="flex gap-2">
        {(
          [
            ["captured", "Photo"],
            ["smile", "Smile"],
            ["blink", "Blink"],
            ["wow", "Surprise"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            disabled={!state.hasFace}
            className={`h-10 flex-1 rounded-full border text-xs disabled:opacity-40 ${state.preset === id ? "border-primary text-fg" : "border-border text-muted"}`}
            onClick={() => state.patch({ preset: id })}
          >
            {label}
          </button>
        ))}
      </div>
      <Slider label="Head size" min={0.8} max={1.35} step={0.01} value={state.headScale} onChange={(headScale) => state.patch({ headScale })} />
      <Slider label="Height" min={-0.06} max={0.08} step={0.005} value={state.headY} onChange={(headY) => state.patch({ headY })} />
      <Slider label="Depth" min={-0.04} max={0.1} step={0.005} value={state.headZ} onChange={(headZ) => state.patch({ headZ })} />
      <Slider label="Expression" min={0} max={1.4} step={0.01} value={state.expression} onChange={(expression) => state.patch({ expression })} />
    </div>
  );
}

function VoicePanel({
  showPhoneVoice,
  onAi,
  onMic,
  onLocal,
  onStop,
}: {
  showPhoneVoice: boolean;
  onAi: () => void;
  onMic: () => void;
  onLocal: () => void;
  onStop: () => void;
}) {
  const line = useStudio((s) => s.line);
  const voiceId = useStudio((s) => s.voiceId);
  const talk = useStudio((s) => s.talk);
  const talkNote = useStudio((s) => s.talkNote);
  const patch = useStudio((s) => s.patch);
  const busy = talk === "gen" || talk === "play" || talk === "mic";
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl text-fg">Sound2Face</h2>
      <p className="text-sm text-pretty text-muted">
        Type a line. The AI voice speaks it, and the face follows the audio as it plays — the same ARKit expressions NVIDIA Audio2Face writes, live on this phone.
      </p>
      <textarea
        value={line}
        maxLength={280}
        rows={3}
        className="w-full resize-none rounded-2xl border border-border bg-bg px-3 py-3 text-fg outline-none"
        onChange={(event) => patch({ line: event.target.value })}
      />
      <div className="flex flex-wrap gap-2">
        {VOICES.map((voice) => (
          <button
            key={voice.id}
            type="button"
            className={`h-10 rounded-full border px-3 text-sm ${voiceId === voice.id ? "border-primary text-fg" : "border-border text-muted"}`}
            onClick={() => patch({ voiceId: voice.id })}
          >
            {voice.label}
            <span className="ml-1 text-xs text-muted">{voice.note}</span>
          </button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-fg disabled:opacity-50" disabled={busy || !line.trim()} onClick={onAi}>
          <AudioLines className="size-4" />
          {talk === "gen" ? "Making voice…" : "AI voice"}
        </button>
        <button type="button" className="flex h-12 items-center justify-center gap-2 rounded-full border border-border text-fg disabled:opacity-50" disabled={talk === "gen"} onClick={talk === "mic" ? onStop : onMic}>
          <Mic className="size-4" />
          {talk === "mic" ? "Stop mic" : "Live mic"}
        </button>
      </div>
      {talk === "play" ? (
        <button type="button" className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-fg" onClick={onStop}>
          <Square className="size-4" /> Stop
        </button>
      ) : null}
      {talkNote ? <p className="text-sm text-pretty text-fg">{talkNote}</p> : null}
      {showPhoneVoice ? (
        <button type="button" className="flex h-11 w-full items-center justify-center gap-2 rounded-full border border-border text-fg" onClick={onLocal}>
          <RotateCcw className="size-4" /> Use this phone's voice
        </button>
      ) : null}
      <p className="text-xs text-pretty text-muted">
        AI speech takes a second to generate, then the mouth stays in sync. The mic is instant — that's the real-time path, like talking into Audio2Face.
      </p>
    </div>
  );
}

function SavePanel({ note, onDownload, onKeep }: { note: string | null; onDownload: () => void; onKeep: () => void }) {
  return (
    <div className="space-y-3">
      <h2 className="font-display text-xl text-fg">Your avatar is ready</h2>
      <p className="text-sm text-pretty text-muted">
        The file includes the 52 face expressions, so it can move in StreamWeaver, VSeeFace, Unity, or from an Audio2Face stream.
      </p>
      <button type="button" className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-primary font-medium text-primary-fg" onClick={onDownload}>
        <Download className="size-4" /> Download GLB
      </button>
      <button type="button" className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border text-fg" onClick={onKeep}>
        <Check className="size-4" /> Save on this phone
      </button>
      {note ? <p className="text-sm text-fg">{note}</p> : null}
    </div>
  );
}

function Choice({
  on,
  label,
  note,
  onClick,
  disabled,
}: {
  on: boolean;
  label: string;
  note: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`rounded-2xl border px-3 py-3 text-left disabled:opacity-40 ${on ? "border-primary bg-surface-2" : "border-border bg-bg"}`}
    >
      <span className="block font-medium text-fg">{label}</span>
      <span className="block text-xs text-muted">{note}</span>
    </button>
  );
}

function Slider({
  label,
  min,
  max,
  step,
  value,
  onChange,
}: {
  label: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-sm text-muted">
        <span>{label}</span>
        <span className="tabular-nums text-fg">{value.toFixed(2)}</span>
      </span>
      <input className="range" type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
    </label>
  );
}

async function restore(item: SavedAvatar, takePhoto: (file: Blob) => Promise<void>) {
  useStudio.getState().patch({
    screen: "studio",
    panel: "face",
    bodyAsset: item.bodyAsset ?? (item.body === "female" ? "female" : "male"),
    modelUrl: null,
    modelName: null,
    outfit: item.outfit,
    hair: item.hair,
    skin: item.skin,
    faceChoice: item.faceChoice,
    headScale: item.headScale,
    headY: item.headY,
    headZ: item.headZ,
    expression: item.expression,
    error: null,
  });
  if (!item.photo) return;
  const res = await fetch(item.photo);
  await takePhoto(await res.blob());
}