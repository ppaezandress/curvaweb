// Reacciones al terminar tareas: emoji + selfie opcional, guardadas en IndexedDB.
// Es el "muro de logros" de la cultura — privado, en el dispositivo.

export type Reaction = {
  id: string;
  taskId: string;
  taskName: string;
  emoji: string;
  photo?: Blob | null;
  at: number; // epoch ms
};

const DB_NAME = "curva-reactions";
const STORE = "reactions";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: "id" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function addReaction(r: Omit<Reaction, "id" | "at">): Promise<void> {
  try {
    const db = await openDB();
    const id = `r${Date.now()}-${Math.round(performance.now())}`;
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put({ ...r, id, at: Date.now() });
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    /* sin persistencia: no rompe */
  }
}

export async function listReactions(): Promise<Reaction[]> {
  try {
    const db = await openDB();
    const all = await new Promise<Reaction[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result as Reaction[]);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return all.sort((a, b) => b.at - a.at);
  } catch {
    return [];
  }
}
