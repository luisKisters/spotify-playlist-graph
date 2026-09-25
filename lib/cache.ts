import type { Playlist } from "./types";

// Playlists are cached per id together with Spotify's snapshot id, so a
// reload only refetches the items of playlists that actually changed.
const DB_NAME = "playlist-graph";
const STORE = "playlists";
const GENRES = "genres";
const GENRE_TTL = 30 * 24 * 60 * 60 * 1000;

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
      if (!db.objectStoreNames.contains(GENRES)) db.createObjectStore(GENRES, { keyPath: "id" });
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

interface GenreEntry {
  id: string;
  genres: string[];
  at: number;
}

/** Artist id -> genres, for lookups younger than the TTL. */
export async function loadCachedGenres(): Promise<Map<string, string[]>> {
  try {
    const db = await open();
    const all = await new Promise<GenreEntry[]>((resolve, reject) => {
      const req = db.transaction(GENRES).objectStore(GENRES).getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const now = Date.now();
    return new Map(all.filter((e) => now - e.at < GENRE_TTL).map((e) => [e.id, e.genres]));
  } catch {
    return new Map();
  }
}

export async function saveCachedGenres(entries: Record<string, string[]>) {
  try {
    const db = await open();
    const tx = db.transaction(GENRES, "readwrite");
    const store = tx.objectStore(GENRES);
    const at = Date.now();
    for (const [id, genres] of Object.entries(entries)) store.put({ id, genres, at });
  } catch (e) {
    console.warn("Could not cache genres", e);
  }
}
