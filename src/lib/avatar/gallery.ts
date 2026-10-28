import type { BodyId, FaceChoice, HairId, OutfitId, SkinId } from "@/lib/avatar/constants";

export type SavedAvatar = {
  id: string;
  createdAt: number;
  title: string;
  thumb: string;
  photo: string | null;
  body: BodyId;
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
      const rows = (req.result as SavedAvatar[]).sort((a, b) => b.createdAt - a.createdAt);
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
