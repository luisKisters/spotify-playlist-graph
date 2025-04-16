// IndexedDB utility functions
const DB_NAME = "spotifyPlaylistGraph";
const DB_VERSION = 2;
const PLAYLISTS_STORE = "playlists";
const ARTISTS_STORE = "artists";
const GENRES_STORE = "genres";
const METADATA_STORE = "metadata";

// Open database connection
export const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // Create or upgrade stores
      if (!db.objectStoreNames.contains(PLAYLISTS_STORE)) {
        db.createObjectStore(PLAYLISTS_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(ARTISTS_STORE)) {
        db.createObjectStore(ARTISTS_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(GENRES_STORE)) {
        db.createObjectStore(GENRES_STORE, { keyPath: "name" });
      }

      if (!db.objectStoreNames.contains(METADATA_STORE)) {
        db.createObjectStore(METADATA_STORE, { keyPath: "key" });
      }
    };
  });
};

// Save playlists to IndexedDB
export const savePlaylists = async (playlists: any[]): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction(PLAYLISTS_STORE, "readwrite");
  const store = transaction.objectStore(PLAYLISTS_STORE);

  // Clear existing data
  store.clear();

  // Add each playlist
  playlists.forEach((playlist) => {
    store.add(playlist);
  });

  // Update last fetch timestamp
  saveMetadata("lastPlaylistFetch", Date.now());

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Save artists to IndexedDB
export const saveArtists = async (artists: any[]): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction(ARTISTS_STORE, "readwrite");
  const store = transaction.objectStore(ARTISTS_STORE);

  // Clear existing data
  store.clear();

  // Add each artist
  artists.forEach((artist) => {
    if (artist && artist.id) {
      store.add(artist);
    }
  });

  // Update last fetch timestamp
  saveMetadata("lastArtistFetch", Date.now());

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Save genres to IndexedDB
export const saveGenres = async (genres: any[]): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction(GENRES_STORE, "readwrite");
  const store = transaction.objectStore(GENRES_STORE);

  // Clear existing data
  store.clear();

  // Add each genre
  genres.forEach((genre) => {
    if (genre && genre.name) {
      store.add(genre);
    }
  });

  // Update last fetch timestamp
  saveMetadata("lastGenreFetch", Date.now());

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Save metadata to IndexedDB
export const saveMetadata = async (key: string, value: any): Promise<void> => {
  const db = await openDB();
  const transaction = db.transaction(METADATA_STORE, "readwrite");
  const store = transaction.objectStore(METADATA_STORE);

  store.put({ key, value });

  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
  });
};

// Get metadata from IndexedDB
export const getMetadata = async (key: string): Promise<any> => {
  const db = await openDB();
  const transaction = db.transaction(METADATA_STORE, "readonly");
  const store = transaction.objectStore(METADATA_STORE);
  const request = store.get(key);

  return new Promise((resolve, reject) => {
    request.onsuccess = () =>
      resolve(request.result ? request.result.value : null);
    request.onerror = () => reject(request.error);
  });
};

// Get all playlists from IndexedDB
export const getPlaylists = async (): Promise<any[]> => {
  const db = await openDB();
  const transaction = db.transaction(PLAYLISTS_STORE, "readonly");
  const store = transaction.objectStore(PLAYLISTS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Get all artists from IndexedDB
export const getArtists = async (): Promise<any[]> => {
  const db = await openDB();
  const transaction = db.transaction(ARTISTS_STORE, "readonly");
  const store = transaction.objectStore(ARTISTS_STORE);
  const request = store.getAll();

  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

// Get all genres from IndexedDB
export const getGenres = async (): Promise<any[]> => {
  const db = await openDB();
  const transaction = db.transaction(GENRES_STORE, "readonly");
  const store = transaction.objectStore(GENRES_STORE);
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
