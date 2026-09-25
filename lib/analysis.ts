import type { ArtistRef, Playlist, Track } from "./types";

export interface TrackInfo {
  track: Track;
  playlists: string[];
}

export interface ArtistInfo {
  artist: ArtistRef;
  /** playlist id -> number of this artist's tracks in it */
  playlists: Map<string, number>;
  trackIds: Set<string>;
}

export interface PlaylistPair {
  a: string;
  b: string;
  sharedTracks: number;
  sharedArtists: number;
  /** 0..1 similarity blending track and artist overlap */
  score: number;
}

export interface Duplicate {
  playlistId: string;
  track: Track;
  count: number;
  /** "exact" = same track twice, "version" = same title and artist */
  kind: "exact" | "version";
}

export interface Library {
  playlists: Map<string, Playlist>;
  tracks: Map<string, TrackInfo>;
  artists: Map<string, ArtistInfo>;
  /** Pairs keyed by `${a}|${b}` with a < b */
  pairs: Map<string, PlaylistPair>;
  duplicates: Duplicate[];
  playlistArtists: Map<string, Map<string, number>>;
}

export const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

const normalizeTitle = (s: string) =>
  s
    .toLowerCase()
    .replace(/\s*[\(\[].*?(remaster|version|edit|mix|live|mono|stereo).*?[\)\]]/g, "")
    .replace(/\s+-\s+.*(remaster|version|edit|mix|live).*$/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

export function analyze(playlists: Playlist[]): Library {
  const byId = new Map(playlists.map((p) => [p.id, p]));
  const tracks = new Map<string, TrackInfo>();
  const artists = new Map<string, ArtistInfo>();
  const playlistArtists = new Map<string, Map<string, number>>();
  const duplicates: Duplicate[] = [];

  for (const p of playlists) {
    const seen = new Map<string, number>();
    const seenTitles = new Map<string, Track[]>();
    const artistCounts = new Map<string, number>();

    for (const t of p.tracks) {
      seen.set(t.id, (seen.get(t.id) ?? 0) + 1);
      const titleKey = normalizeTitle(t.name) + "|" + (t.artists[0]?.id ?? "");
      seenTitles.set(titleKey, [...(seenTitles.get(titleKey) ?? []), t]);

      if (seen.get(t.id)! > 1) continue;

      const info = tracks.get(t.id) ?? { track: t, playlists: [] };
      info.playlists.push(p.id);
      tracks.set(t.id, info);

      for (const a of t.artists) {
        artistCounts.set(a.id, (artistCounts.get(a.id) ?? 0) + 1);
        const ai =
          artists.get(a.id) ??
          ({ artist: a, playlists: new Map(), trackIds: new Set() } as ArtistInfo);
        ai.playlists.set(p.id, (ai.playlists.get(p.id) ?? 0) + 1);
        ai.trackIds.add(t.id);
        artists.set(a.id, ai);
      }
    }
    playlistArtists.set(p.id, artistCounts);

    for (const [id, count] of seen) {
      if (count > 1) {
        const track = p.tracks.find((t) => t.id === id)!;
        duplicates.push({ playlistId: p.id, track, count, kind: "exact" });
      }
    }
    for (const group of seenTitles.values()) {
      const distinct = new Set(group.map((t) => t.id));
      if (distinct.size > 1) {
        duplicates.push({
          playlistId: p.id,
          track: group[0],
          count: distinct.size,
          kind: "version",
        });
      }
    }
  }

  // Pairwise overlap via inverted indexes (track -> playlists, artist -> playlists).
  const sharedTracks = new Map<string, number>();
  for (const info of tracks.values()) {
    const ps = info.playlists;
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const k = pairKey(ps[i], ps[j]);
        sharedTracks.set(k, (sharedTracks.get(k) ?? 0) + 1);
      }
  }
  const sharedArtists = new Map<string, number>();
  for (const info of artists.values()) {
    const ps = [...info.playlists.keys()];
    for (let i = 0; i < ps.length; i++)
      for (let j = i + 1; j < ps.length; j++) {
        const k = pairKey(ps[i], ps[j]);
        sharedArtists.set(k, (sharedArtists.get(k) ?? 0) + 1);
      }
  }

  const uniqueCount = new Map<string, number>();
  for (const p of playlists) uniqueCount.set(p.id, new Set(p.tracks.map((t) => t.id)).size);

  const pairs = new Map<string, PlaylistPair>();
  for (const k of new Set([...sharedTracks.keys(), ...sharedArtists.keys()])) {
    const [a, b] = k.split("|");
    const st = sharedTracks.get(k) ?? 0;
    const sa = sharedArtists.get(k) ?? 0;
    const ta = uniqueCount.get(a)!;
    const tb = uniqueCount.get(b)!;
    const aa = playlistArtists.get(a)!.size;
    const ab = playlistArtists.get(b)!.size;
    const trackJaccard = st / Math.max(1, ta + tb - st);
    const artistJaccard = sa / Math.max(1, aa + ab - sa);
    pairs.set(k, {
      a,
      b,
      sharedTracks: st,
      sharedArtists: sa,
      score: 0.6 * trackJaccard + 0.4 * artistJaccard,
    });
  }

  return { playlists: byId, tracks, artists, pairs, duplicates, playlistArtists };
}

export function similarPlaylists(lib: Library, id: string, limit = 8) {
  const out: (PlaylistPair & { other: string })[] = [];
  for (const pair of lib.pairs.values()) {
    if (pair.a === id || pair.b === id) {
      out.push({ ...pair, other: pair.a === id ? pair.b : pair.a });
    }
  }
  return out.sort((x, y) => y.score - x.score).slice(0, limit);
}

export function sharedTracksBetween(lib: Library, a: string, b: string) {
  const inB = new Set(lib.playlists.get(b)!.tracks.map((t) => t.id));
  const seen = new Set<string>();
  return lib.playlists.get(a)!.tracks.filter((t) => {
    if (!inB.has(t.id) || seen.has(t.id)) return false;
    seen.add(t.id);
    return true;
  });
}

export function topArtists(lib: Library, playlistId: string, limit = 8) {
  const counts = lib.playlistArtists.get(playlistId) ?? new Map();
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([id, count]) => ({ artist: lib.artists.get(id)!.artist, count }));
}

export function formatDuration(ms: number) {
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  return `${Math.floor(mins / 60)} h ${mins % 60} min`;
}
