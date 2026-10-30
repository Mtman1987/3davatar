import { ARKIT_BLENDSHAPE_NAMES, type ArkitName, type Weights } from "@/lib/avatar/arkit";

/**
 * Phone-side Sound2Face.
 * Audio in, ARKit 52 weights out, updated every frame while sound plays.
 * NVIDIA Audio2Face writes this same weight vector; this solver is the
 * on-device stand-in (energy + spectral bands), not their GPU model.
 */
export class Sound2Face {
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private freq = new Uint8Array(0);
  private time = new Uint8Array(0);
  private source: AudioBufferSourceNode | null = null;
  private stream: MediaStream | null = null;
  private mode: "idle" | "audio" = "idle";
  private scripted: Weights | null = null;
  private smooth: number[] = ARKIT_BLENDSHAPE_NAMES.map(() => 0);
  onEnd: (() => void) | null = null;

  unlock() {
    const ctx = this.ensure();
    void ctx.resume();
  }

  async play(buffer: ArrayBuffer) {
    this.stopTracks();
    const ctx = this.ensure();
    await ctx.resume();
    const audio = await ctx.decodeAudioData(buffer.slice(0));
    const src = ctx.createBufferSource();
    src.buffer = audio;
    const analyser = this.ensureAnalyser();
    analyser.disconnect();
    src.connect(analyser);
    analyser.connect(ctx.destination);
    src.onended = () => {
      if (this.source !== src) return;
      this.source = null;
      this.mode = "idle";
      this.onEnd?.();
    };
    this.source = src;
    this.scripted = null;
    this.mode = "audio";
    src.start();
  }

  async startMic() {
    this.stopTracks();
    this.unlock();
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true },
      video: false,
    });
    const ctx = this.ensure();
    await ctx.resume();
    const node = ctx.createMediaStreamSource(stream);
    const analyser = this.ensureAnalyser();
    analyser.disconnect();
    node.connect(analyser);
    this.stream = stream;
    this.scripted = null;
    this.mode = "audio";
  }

  setScripted(weights: Weights | null) {
    this.scripted = weights;
    if (!weights) this.mode = this.stream || this.source ? "audio" : "idle";
  }

  /** Latest ARKit weights, or null when nothing is driving the face. */
  sample(): Weights | null {
    if (this.scripted) return this.follow(this.scripted);
    if (this.mode !== "audio" || !this.analyser || !this.ctx) return null;
    this.analyser.getByteFrequencyData(this.freq as Uint8Array<ArrayBuffer>);
    this.analyser.getByteTimeDomainData(this.time as Uint8Array<ArrayBuffer>);
    return this.follow(weightsFromSpectrum(this.freq, this.time, this.ctx.sampleRate, this.analyser.fftSize));
  }

  stop() {
    this.stopTracks();
    this.scripted = null;
    this.mode = "idle";
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
  }

  dispose() {
    this.stop();
    void this.ctx?.close();
    this.ctx = null;
    this.analyser = null;
  }

  private stopTracks() {
    if (this.source) {
      const src = this.source;
      this.source = null;
      try {
        src.stop();
      } catch {
        /* already stopped */
      }
    }
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.mode = "idle";
  }

  private ensure() {
    if (!this.ctx) {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new Ctx();
    }
    return this.ctx;
  }

  private ensureAnalyser() {
    const ctx = this.ensure();
    if (!this.analyser) {
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      analyser.smoothingTimeConstant = 0.25;
      this.analyser = analyser;
      this.freq = new Uint8Array(analyser.frequencyBinCount);
      this.time = new Uint8Array(analyser.fftSize);
    }
    return this.analyser;
  }

  private follow(target: Weights): Weights {
    const out: Weights = {};
    const k = 0.58;
    ARKIT_BLENDSHAPE_NAMES.forEach((name, index) => {
      const next = target[name] ?? 0;
      const value = this.smooth[index] + (next - this.smooth[index]) * k;
      this.smooth[index] = value;
      if (value > 0.012) out[name] = value;
    });
    return out;
  }
}

export function weightsFromSpectrum(
  freq: Uint8Array,
  time: Uint8Array,
  sampleRate: number,
  fftSize: number,
): Weights {
  const binHz = sampleRate / fftSize;
  const band = (lo: number, hi: number) => {
    const a = Math.max(0, Math.floor(lo / binHz));
    const b = Math.min(freq.length - 1, Math.ceil(hi / binHz));
    let sum = 0;
    let n = 0;
    for (let i = a; i <= b; i++) {
      sum += freq[i] ?? 0;
      n++;
    }
    return n ? sum / (n * 255) : 0;
  };
  let rms = 0;
  for (let i = 0; i < time.length; i++) {
    const v = ((time[i] ?? 128) - 128) / 128;
    rms += v * v;
  }
  rms = Math.sqrt(rms / Math.max(1, time.length));
  const energy = clamp(rms * 5.5);
  if (energy < 0.035) {
    return { mouthClose: 0.4, jawOpen: 0.02 };
  }
  const low = band(150, 500);
  const mid = band(500, 1700);
  const high = band(1700, 4500);
  const open = clamp(energy * 0.55 + low * 1.15);
  const rounded = clamp(mid - high * 0.55);
  const spread = clamp(high * 1.05 + mid * 0.12);
  return {
    jawOpen: open * 0.92,
    jawForward: open * 0.12,
    // Move the lower lip with the jaw so the mouth visibly opens.
    mouthLowerDownLeft: open * 0.72,
    mouthLowerDownRight: open * 0.72,
    mouthFunnel: rounded * 0.55,
    mouthPucker: clamp(rounded - spread * 0.4) * 0.45,
    mouthSmileLeft: spread * 0.4,
    mouthSmileRight: spread * 0.4,
    mouthStretchLeft: spread * 0.26,
    mouthStretchRight: spread * 0.26,
    cheekSquintLeft: spread * 0.18,
    cheekSquintRight: spread * 0.18,
    mouthClose: clamp(0.25 - open),
    browInnerUp: energy * 0.12,
  };
}

/** Syllable pulses for the on-device voice, which we cannot tap with an analyser. */
export function scriptWeights(t: number): Weights {
  const syllable = Math.max(0, Math.sin(t * Math.PI * 14));
  const round = Math.sin(t * Math.PI * 5.5) * 0.5 + 0.5;
  const open = syllable * 0.8;
  return {
    jawOpen: open,
    mouthLowerDownLeft: open * 0.72,
    mouthLowerDownRight: open * 0.72,
    mouthFunnel: open * round * 0.5,
    mouthPucker: open * round * 0.28,
    mouthSmileLeft: open * (1 - round) * 0.32,
    mouthSmileRight: open * (1 - round) * 0.32,
  };
}

function clamp(v: number) {
  return Math.max(0, Math.min(1, v));
}

export function weightOr(weights: Weights, name: ArkitName) {
  return weights[name] ?? 0;
}
