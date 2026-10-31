import * as THREE from "three";
import type { Weights } from "@/lib/avatar/arkit";

type Category = { categoryName?: string; score?: number };
type Result = { faceBlendshapes?: Array<{ categories?: Category[] }>; facialTransformationMatrixes?: Array<{ data?: number[] }> };
export type LiveTrackingSample = { weights: Weights | null; headRotation: { x: number; y: number; z: number } | null };
type Landmarker = {
  detectForVideo: (video: HTMLVideoElement, timestamp: number) => Result;
  close?: () => void;
};

/**
 * On-device MediaPipe tracking. Returns ARKit-named expression weights so the
 * existing generated-head morph rig can consume them without another rig.
 */
export class LiveFaceTracker {
  private stream: MediaStream | null = null;
  private video: HTMLVideoElement | null = null;
  private landmarker: Landmarker | null = null;
  private raf = 0;
  private lastRun = 0;
  private weights: Weights | null = null;
  private smoothed: Record<string, number> = {};
  private neutralFaceRotation: THREE.Quaternion | null = null;
  private headRotation: { x: number; y: number; z: number } | null = null;
  private stopped = false;

  async start() {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error("Camera access is not supported in this browser.");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 24, max: 30 } },
    });
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    video.autoplay = true;
    video.srcObject = this.stream;
    video.style.position = "fixed";
    video.style.width = "1px";
    video.style.height = "1px";
    video.style.opacity = "0";
    video.style.pointerEvents = "none";
    video.style.left = "-10px";
    document.body.appendChild(video);
    this.video = video;
    await video.play();

    const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
    const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
    const options = {
      baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "GPU" as const },
      runningMode: "VIDEO" as const,
      numFaces: 1,
      outputFaceBlendshapes: true,
      outputFacialTransformationMatrixes: true,
      minFaceDetectionConfidence: 0.55,
      minFacePresenceConfidence: 0.55,
      minTrackingConfidence: 0.55,
    };
    try {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, options) as unknown as Landmarker;
    } catch {
      this.landmarker = await FaceLandmarker.createFromOptions(vision, {
        ...options,
        baseOptions: { modelAssetPath: "/mediapipe/face_landmarker.task", delegate: "CPU" },
      }) as unknown as Landmarker;
    }
    this.stopped = false;
    this.loop();
  }

  sample(): LiveTrackingSample {
    return { weights: this.weights, headRotation: this.headRotation };
  }

  stop() {
    this.stopped = true;
    cancelAnimationFrame(this.raf);
    this.landmarker?.close?.();
    this.landmarker = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    if (this.video) {
      this.video.pause();
      this.video.srcObject = null;
      this.video.remove();
      this.video = null;
    }
    this.weights = null;
    this.smoothed = {};
    this.neutralFaceRotation = null;
    this.headRotation = null;
  }

  private loop = () => {
    if (this.stopped) return;
    this.raf = requestAnimationFrame(() => {
      const video = this.video;
      const landmarker = this.landmarker;
      if (!video || !landmarker || video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        this.loop();
        return;
      }
      const now = performance.now();
      // 20 Hz is responsive enough for expressions while keeping phone thermals
      // and the Three.js render loop under control.
      if (now - this.lastRun >= 50 && video.currentTime !== this.lastVideoTime) {
        this.lastRun = now;
        this.lastVideoTime = video.currentTime;
        try {
          const result = landmarker.detectForVideo(video, now);
          const matrixData = result.facialTransformationMatrixes?.[0]?.data;
          if (matrixData?.length === 16) {
            const matrix = new THREE.Matrix4().fromArray(matrixData);
            const currentRotation = new THREE.Quaternion();
            matrix.decompose(new THREE.Vector3(), currentRotation, new THREE.Vector3());
            if (!this.neutralFaceRotation) this.neutralFaceRotation = currentRotation.clone();
            const relative = this.neutralFaceRotation.clone().invert().multiply(currentRotation).normalize();
            const euler = new THREE.Euler().setFromQuaternion(relative, "YXZ");
            const nextRotation = { x: euler.x, y: euler.y, z: euler.z };
            const previousRotation = this.headRotation ?? nextRotation;
            const alpha = 0.28;
            this.headRotation = {
              x: previousRotation.x + (nextRotation.x - previousRotation.x) * alpha,
              y: previousRotation.y + (nextRotation.y - previousRotation.y) * alpha,
              z: previousRotation.z + (nextRotation.z - previousRotation.z) * alpha,
            };
          }
          const categories = result.faceBlendshapes?.[0]?.categories;
          if (categories?.length) {
            const next: Weights = {};
            for (const item of categories) {
              if (!item.categoryName || typeof item.score !== "number") continue;
              const value = Math.max(0, Math.min(1, item.score));
              const previous = this.smoothed[item.categoryName] ?? value;
              const smooth = previous + (value - previous) * 0.42;
              this.smoothed[item.categoryName] = smooth;
              next[item.categoryName as keyof Weights] = smooth;
            }
            this.weights = next;
          } else {
            this.weights = null;
          }
        } catch {
          // A dropped camera frame should not stop the render or tracking loop.
        }
      }
      this.loop();
    });
  };

  private lastVideoTime = -1;
}
