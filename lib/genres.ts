import type { Library } from "./analysis";
import { loadCachedGenres, saveCachedGenres } from "./cache";

const BATCH = 10;

/**
 * Looks up genres for the library's artists, most-shared artists first,
 * reporting partial results as they arrive. Stops when `signal` aborts.
 */
export async function loadGenres(
  lib: Library,
  onUpdate: (genres: Map<string, string[]>, done: number, total: number) => void,
  signal: AbortSignal,
  limit = 400
) {
  const genres = await loadCachedGenres();
  const wanted = [...lib.artists.values()]
    .sort((a, b) => b.playlists.size - a.playlists.size || b.trackIds.size - a.trackIds.size)
    .slice(0, limit)
    .map((a) => a.artist);
  const missing = wanted.filter((a) => !genres.has(a.id));
  let done = wanted.length - missing.length;
  onUpdate(new Map(genres), done, wanted.length);

  for (let i = 0; i < missing.length && !signal.aborted; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    const res = await fetch("/api/genres", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ artists: batch }),
      signal,
    }).catch(() => null);
    if (!res?.ok) break;
    const found: Record<string, string[]> = await res.json();
    for (const a of batch) found[a.id] ??= [];
    saveCachedGenres(found);
    for (const [id, g] of Object.entries(found)) genres.set(id, g);
    done += batch.length;
    onUpdate(new Map(genres), done, wanted.length);
  }
}
