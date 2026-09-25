import { strToU8, zipSync } from "fflate";
import type { Library } from "./analysis";
import type { Clusters } from "./graph";
import type { Playlist } from "./types";

export const EXPORT_VERSION = 1;

/** Everything needed to rebuild the app's view offline. */
export interface LibraryExport {
  version: number;
  exportedAt: string;
  playlists: Playlist[];
  /** artist id -> genres (only artists looked up so far) */
  artistGenres: Record<string, string[]>;
}

type Cell = string | number | null | undefined;

function csv(header: string[], rows: Cell[][]) {
  const esc = (v: Cell) => {
    const s = v === null || v === undefined ? "" : String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [header, ...rows].map((r) => r.map(esc).join(",")).join("\n") + "\n";
}

function download(data: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([data], { type }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function buildCsvFiles(
  lib: Library,
  artistGenres: Map<string, string[]> | null,
  clusters: Clusters
): Record<string, string> {
  const genresOf = (id: string) => (artistGenres?.get(id) ?? []).join("; ");
  const clusterName = (pid: string) => {
    const c = clusters.of.get(pid) ?? -1;
    return c < 0 ? "" : clusters.labels[c];
  };

  const playlists = csv(
    ["playlist_id", "name", "owner", "tracks", "unique_artists", "duration_min", "cluster", "url"],
    [...lib.playlists.values()].map((p) => [
      p.id,
      p.name,
      p.owner,
      p.tracks.length,
      lib.playlistArtists.get(p.id)?.size ?? 0,
      Math.round(p.tracks.reduce((s, t) => s + t.duration, 0) / 60000),
      clusterName(p.id),
      p.url,
    ])
  );

  const tracks = csv(
    ["track_id", "name", "artists", "artist_ids", "album", "duration_ms", "playlist_count", "genres", "url"],
    [...lib.tracks.values()].map(({ track: t, playlists }) => [
      t.id,
      t.name,
      t.artists.map((a) => a.name).join("; "),
      t.artists.map((a) => a.id).join("; "),
      t.album,
      t.duration,
      playlists.length,
      [...new Set(t.artists.flatMap((a) => artistGenres?.get(a.id) ?? []))].join("; "),
      t.url,
    ])
  );

  const artists = csv(
    ["artist_id", "name", "tracks", "playlist_count", "genres"],
    [...lib.artists.values()].map((a) => [
      a.artist.id,
      a.artist.name,
      a.trackIds.size,
      a.playlists.size,
      genresOf(a.artist.id),
    ])
  );

  const playlistTracks = csv(
    ["playlist_id", "playlist_name", "position", "track_id", "track_name", "artists"],
    [...lib.playlists.values()].flatMap((p) =>
      p.tracks.map((t, i) => [p.id, p.name, i + 1, t.id, t.name, t.artists.map((a) => a.name).join("; ")])
    )
  );

  const genreCounts = new Map<string, { artists: number; tracks: Set<string> }>();
  for (const a of lib.artists.values())
    for (const g of artistGenres?.get(a.artist.id) ?? []) {
      const e = genreCounts.get(g) ?? { artists: 0, tracks: new Set() };
      e.artists++;
      a.trackIds.forEach((t) => e.tracks.add(t));
      genreCounts.set(g, e);
    }
  const genres = csv(
    ["genre", "artists", "tracks"],
    [...genreCounts.entries()]
      .sort((a, b) => b[1].tracks.size - a[1].tracks.size)
      .map(([g, e]) => [g, e.artists, e.tracks.size])
  );

  const similarity = csv(
    ["playlist_a", "playlist_b", "shared_tracks", "shared_artists", "similarity", "artist_similarity"],
    [...lib.pairs.values()]
      .sort((a, b) => b.score - a.score)
      .map((p) => [
        lib.playlists.get(p.a)?.name,
        lib.playlists.get(p.b)?.name,
        p.sharedTracks,
        p.sharedArtists,
        p.score.toFixed(4),
        p.artistScore.toFixed(4),
      ])
  );

  return {
    "playlists.csv": playlists,
    "tracks.csv": tracks,
    "artists.csv": artists,
    "genres.csv": genres,
    "playlist_tracks.csv": playlistTracks,
    "playlist_similarity.csv": similarity,
  };
}

export function toExport(lib: Library, artistGenres: Map<string, string[]> | null): LibraryExport {
  return {
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    playlists: [...lib.playlists.values()],
    artistGenres: Object.fromEntries(artistGenres ?? []),
  };
}

export function downloadCsvZip(
  lib: Library,
  artistGenres: Map<string, string[]> | null,
  clusters: Clusters
) {
  const files = buildCsvFiles(lib, artistGenres, clusters);
  // BOM so Excel reads names with accents correctly.
  const entries = Object.fromEntries(
    Object.entries(files).map(([name, text]) => [name, strToU8("﻿" + text)])
  );
  entries["library.json"] = strToU8(JSON.stringify(toExport(lib, artistGenres)));
  download(zipSync(entries, { level: 6 }), `playlist-graph-${stamp()}.zip`, "application/zip");
}

export function downloadJson(lib: Library, artistGenres: Map<string, string[]> | null) {
  download(JSON.stringify(toExport(lib, artistGenres), null, 1), `playlist-graph-${stamp()}.json`, "application/json");
}

/** Reads a file made by downloadJson (or library.json from the zip). */
export async function readExport(file: File): Promise<LibraryExport> {
  const data = JSON.parse(await file.text());
  if (!Array.isArray(data?.playlists)) throw new Error("Not a Playlist Graph export");
  return { ...data, artistGenres: data.artistGenres ?? {} };
}
