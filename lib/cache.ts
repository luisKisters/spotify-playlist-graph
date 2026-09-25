import type { Playlist } from "./types";

// Playlists are cached per id together with Spotify's snapshot id, so a
// reload only refetches the items of playlists that actually changed.
const DB_NAME = "playlist-graph";
const STORE = "playlists";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadCachedPlaylists(): Promise<Map<string, Playlist>> {
  try {
    const db = await open();
    const all = await new Promise<Playlist[]>((resolve, reject) => {
      const req = db.transaction(STORE).objectStore(STORE).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return new Map(all.map((p) => [p.id, p]));
  } catch {
    return new Map();
  }
}

export async function saveCachedPlaylists(playlists: Playlist[]) {
  try {
    const db = await open();
    const tx = db.transaction(STORE, "readwrite");
    const store = tx.objectStore(STORE);
    store.clear();
    for (const p of playlists) store.put(p);
    await new Promise((resolve, reject) => {
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
  } catch (e) {
    console.warn("Could not cache playlists", e);
  }
}

export async function clearCache() {
  try {
    indexedDB.deleteDatabase(DB_NAME);
  } catch {}
}
