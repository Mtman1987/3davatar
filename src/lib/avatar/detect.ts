import { buildFace, type Landmark } from "@/lib/avatar/build-face";
import { setFaceCache } from "@/lib/avatar/face-cache";
import { setPendingPhoto } from "@/lib/avatar/gallery";

type Landmarker = {
  detect: (image: CanvasImageSource) => {
    faceLandmarks?: Array<Array<{ x: number; y: number; z?: number }>>;
    faceBlendshapes?: Array<{ categories?: Array<{ categoryName?: string; score?: number }> }>;
    facialTransformationMatrixes?: Array<{ data?: ArrayLike<number>; rows?: number; columns?: number }>;
  };
  close?: () => void;
};

let landmarkerPromise: Promise<Landmarker> | null = null;
let usingGpu = true;

async function createLandmarker(gpu: boolean): Promise<Landmarker> {
  const { FaceLandmarker, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const vision = await FilesetResolver.forVisionTasks("/mediapipe/wasm");
  const created = await FaceLandmarker.createFromOptions(vision, {
    baseOptions: {
      modelAssetPath: "/mediapipe/face_landmarker.task",
      delegate: gpu ? "GPU" : "CPU",
    },
    runningMode: "IMAGE",
    numFaces: 1,
    outputFaceBlendshapes: true,
    // MediaPipe can provide the canonical-face-to-detected-face transform.
    // Keep it with the detection result for reproducible fit diagnostics and
    // the comparison pipeline rather than discarding this part of its output.
    outputFacialTransformationMatrixes: true,
  });
  return created as unknown as Landmarker;
}

function loadLandmarker() {
  if (!landmarkerPromise) {
    landmarkerPromise = createLandmarker(true).catch(async () => {
      usingGpu = false;
      return createLandmarker(false);
    });
  }
  return landmarkerPromise;
}

export async function prepareAndDetect(file: Blob, onStatus?: (text: string) => void) {
  onStatus?.("Finding your face…");
  const canvas = await fileToCanvas(file, 1024);
  setPendingPhoto(downscale(canvas, 768, 0.84));
  const preview = downscale(canvas, 360, 0.82);
  await detectCanvas(canvas, onStatus);
  return preview;
}

async function detectCanvas(canvas: HTMLCanvasElement, onStatus?: (text: string) => void) {
  let landmarker = await loadLandmarker();
  let result: ReturnType<Landmarker["detect"]>;
  try {
    result = landmarker.detect(canvas);
  } catch (error) {
    if (!usingGpu) throw error;
    usingGpu = false;
    landmarkerPromise = createLandmarker(false);
    landmarker = await landmarkerPromise;
    result = landmarker.detect(canvas);
  }
  const raw = result.faceLandmarks?.[0];
  if (!raw || raw.length < 100) {
    throw new Error("NO_FACE");
  }
  onStatus?.("Building both versions…");
  const landmarks: Landmark[] = raw.map((lm) => ({ x: lm.x, y: lm.y, z: lm.z ?? 0 }));
  const categories = result.faceBlendshapes?.[0]?.categories ?? [];
  const standard = buildFace(landmarks, categories, canvas, "standard");
  const detail = buildFace(landmarks, categories, canvas, "detail");
  const matrixData = result.facialTransformationMatrixes?.[0]?.data;
  const transformMatrix = matrixData ? Array.from(matrixData) : null;
  setFaceCache({
    standard,
    detail,
    metadata: {
      detector: "MediaPipe Face Landmarker",
      landmarkCount: landmarks.length,
      blendshapeCount: categories.length,
      sourceWidth: canvas.width,
      sourceHeight: canvas.height,
      sourceAspectRatio: canvas.width / Math.max(1, canvas.height),
      transformMatrix,
      transformMatrixDimensions: result.facialTransformationMatrixes?.[0]
        ? [result.facialTransformationMatrixes[0].rows ?? 4, result.facialTransformationMatrixes[0].columns ?? 4]
        : null,
    },
  });
}

async function fileToCanvas(file: Blob, max: number) {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("NO_CANVAS");
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return canvas;
}

function downscale(source: HTMLCanvasElement, max: number, quality: number) {
  const scale = Math.min(1, max / Math.max(source.width, source.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.width * scale));
  canvas.height = Math.max(1, Math.round(source.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return "";
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}
