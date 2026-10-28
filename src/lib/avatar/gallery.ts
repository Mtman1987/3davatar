import type { BodyId, FaceChoice, HairId, OutfitId, SkinId } from "@/lib/avatar/constants";

export type SavedAvatar = {
  id: string;
  createdAt: number;
  title: string;
  thumb: string;
  photo: string | null;
  bodyAsset: BodyId;
  /** Legacy IndexedDB records created before real body assets were introduced. */
  body?: string;
  /** Preserve the exact finished GLB when saving/reopening a commission. */
  modelUrl?: string | null;
  modelName?: string | null;
  outfit: OutfitId;
  hair: HairId;
  skin: SkinId;
  faceChoice: FaceChoice;
  headScale: number;
  headY: number;
  headZ: number;
  expression: number;
};

const DB = "streamweaver";
const STORE = "avatars";
const MAX = 8;

let pendingPhoto: string | null = null;

export function setPendingPhoto(url: string | null) {
  pendingPhoto = url;
}

export function getPendingPhoto() {
  return pendingPhoto;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Could not open saves"));
  });
}

export async function listAvatars(): Promise<SavedAvatar[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readonly");
    const req = tx.objectStore(STORE).getAll();
    req.onsuccess = () => {
      const raw = Array.isArray(req.result) ? req.result as Array<Partial<SavedAvatar> | null> : [];
      // Old or damaged IndexedDB records must not take down the whole saved-avatar library.
      const rows = raw
        .filter((row): row is Partial<SavedAvatar> => Boolean(row && typeof row === "object"))
        .map((row, index): SavedAvatar | null => {
          const id = typeof row.id === "string" && row.id ? row.id : null;
          if (!id) return null;
          const createdAt = typeof row.createdAt === "number" && Number.isFinite(row.createdAt) ? row.createdAt : 0;
          const title = typeof row.title === "string" && row.title.trim() ? row.title : "Recovered avatar";
          const thumb = typeof row.thumb === "string" ? row.thumb : "";
          const photo = typeof row.photo === "string" ? row.photo : null;
          const bodyAsset = row.bodyAsset === "female" || row.body === "female" ? "female" : "male";
          const allowed = <T extends string>(value: unknown, values: readonly T[], fallback: T): T =>
            typeof value === "string" && values.includes(value as T) ? value as T : fallback;
          return {
            id, createdAt, title, thumb, photo, bodyAsset,
            body: typeof row.body === "string" ? row.body : undefined,
            modelUrl: typeof row.modelUrl === "string" && row.modelUrl.startsWith("/models/") ? row.modelUrl : null,
            modelName: typeof row.modelName === "string" ? row.modelName : null,
            outfit: allowed(row.outfit, ["tee", "hoodie", "jacket", "dress", "layers"] as const, "hoodie"),
            hair: allowed(row.hair, ["none", "short", "long"] as const, "short"),
            skin: allowed(row.skin, ["porcelain", "sand", "amber", "bronze", "deep"] as const, "sand"),
            faceChoice: allowed(row.faceChoice, ["standard", "detail"] as const, "standard"),
            headScale: typeof row.headScale === "number" && Number.isFinite(row.headScale) ? row.headScale : 1,
            headY: typeof row.headY === "number" && Number.isFinite(row.headY) ? row.headY : 0,
            headZ: typeof row.headZ === "number" && Number.isFinite(row.headZ) ? row.headZ : 0,
            expression: typeof row.expression === "number" && Number.isFinite(row.expression) ? row.expression : 1,
          };
        })
        .filter((row): row is SavedAvatar => row !== null)
        .sort((a, b) => b.createdAt - a.createdAt);
      resolve(rows);
    };
    req.onerror = () => reject(req.error ?? new Error("Could not read saves"));
  });
}

export async function saveAvatar(entry: SavedAvatar) {
  const db = await openDb();
  const existing = await listAvatars();
  const doomed = existing.slice(MAX - 1);
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    for (const row of doomed) store.delete(row.id);
    store.put(entry);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not save"));
  });
}

export async function deleteAvatar(id: string) {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Could not delete"));
  });
}
