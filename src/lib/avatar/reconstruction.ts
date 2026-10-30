import { createServerFn } from "@tanstack/react-start";

type UploadInput = { fileName: string; mimeType: string; bytesBase64: string };
type AssetInput = { jobId: string; assetName: string };

function serviceConfig() {
  const base = process.env.FACE_RECONSTRUCTION_URL?.replace(/\/$/, "");
  const token = process.env.FACE_RECONSTRUCTION_TOKEN;
  if (!base || !token) throw new Error("Photo-to-head generation is not configured on the server.");
  return { base, token };
}

export const submitHeadReconstruction = createServerFn({ method: "POST" })
  .validator((input: unknown): UploadInput => {
    const value = (input ?? {}) as Partial<UploadInput>;
    if (typeof value.fileName !== "string" || !/\.(jpe?g|png|webp)$/i.test(value.fileName)) {
      throw new Error("Choose a JPG, PNG, or WebP portrait.");
    }
    if (typeof value.mimeType !== "string" || !/^image\/(jpeg|png|webp)$/.test(value.mimeType)) {
      throw new Error("Unsupported portrait image type.");
    }
    if (typeof value.bytesBase64 !== "string" || value.bytesBase64.length > 17_000_000) {
      throw new Error("Portrait upload is empty or exceeds the 12 MB limit.");
    }
    return value as UploadInput;
  })
  .handler(async ({ data }) => {
    const { base, token } = serviceConfig();
    const binary = atob(data.bytesBase64);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    const form = new FormData();
    form.append("photos", new Blob([bytes], { type: data.mimeType }), data.fileName);
    const response = await fetch(base + "/v1/reconstructions", {
      method: "POST",
      headers: { "X-Face-Reconstruction-Token": token },
      body: form,
    });
    if (!response.ok) {
      const detail = await response.text();
      throw new Error("Reconstruction service rejected the photo (HTTP " + response.status + "): " + detail.slice(0, 500));
    }
    return await response.json() as { id: string; status: string; message: string; logs?: string[] };
  });

export const getHeadReconstructionStatus = createServerFn({ method: "POST" })
  .validator((input: unknown): { jobId: string } => {
    const jobId = (input as { jobId?: unknown } | null)?.jobId;
    if (typeof jobId !== "string" || !/^[a-f0-9]{32}$/.test(jobId)) throw new Error("Invalid reconstruction job.");
    return { jobId };
  })
  .handler(async ({ data }) => {
    const { base, token } = serviceConfig();
    const response = await fetch(base + "/v1/reconstructions/" + data.jobId, {
      headers: { "X-Face-Reconstruction-Token": token },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not check reconstruction status (HTTP " + response.status + ").");
    return await response.json() as { id: string; status: string; message: string; logs?: string[] };
  });

export const getGeneratedHeadAsset = createServerFn({ method: "POST" })
  .validator((input: unknown): AssetInput => {
    const value = (input ?? {}) as Partial<AssetInput>;
    if (typeof value.jobId !== "string" || !/^[a-f0-9]{32}$/.test(value.jobId)) throw new Error("Invalid reconstruction job.");
    if (typeof value.assetName !== "string" || !/^[a-zA-Z0-9_.-]{1,180}$/.test(value.assetName)) throw new Error("Invalid generated asset name.");
    return value as AssetInput;
  })
  .handler(async ({ data }) => {
    const { base, token } = serviceConfig();
    const response = await fetch(base + "/v1/reconstructions/" + data.jobId + "/assets/" + encodeURIComponent(data.assetName), {
      headers: { "X-Face-Reconstruction-Token": token },
      cache: "no-store",
    });
    if (!response.ok) throw new Error("Could not load generated head asset " + data.assetName + " (HTTP " + response.status + ").");
    const bytes = new Uint8Array(await response.arrayBuffer());
    let binary = "";
    for (let offset = 0; offset < bytes.length; offset += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
    }
    return { bytesBase64: btoa(binary), contentType: response.headers.get("content-type") ?? "application/octet-stream" };
  });
