import { Playlist } from "../types/spotify";

// IndexedDB utility functions
const DB_NAME = "spotifyPlaylistGraph";
const DB_VERSION = 1;
const STORE_NAME = "playlists";

// Open database connection
export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id" });
      }
    };
  });
};

// Save playlists to IndexedDB
export const savePlaylists = async (playlists: Playlist[]): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readwrite");
  const store = transaction.objectStore(STORE_NAME);

  // Clear existing data
  store.clear();

  // Add each playlist
  playlists.forEach((playlist) => {
    store.add(playlist);
  });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Get all playlists from IndexedDB
export const getPlaylists = async (): Promise<Playlist[]> => {
  const db = await openDB();
  const transaction = db.transaction(STORE_NAME, "readonly");
  const store = transaction.objectStore(STORE_NAME);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Check if there are playlists stored
export const hasPlaylists = async (): Promise<boolean> => {
  const playlists = await getPlaylists();
  return playlists.length > 0;
};
