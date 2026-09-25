import Graph from "graphology";
import louvain from "graphology-communities-louvain";
import type { GenreProfile, Library } from "./analysis";
import { MAX_NODES, type GraphSettings } from "./settings";

export type GraphMode = "playlists" | "artists" | "songs" | "genres";
export type ClusterBy = "smart" | "overlap" | "artists" | "genre";
export type NodeKind = "playlist" | "artist" | "track" | "genre";

export const PALETTE = [
  "#1ed760", "#4cc9f0", "#f72585", "#ffb703", "#b388ff",
  "#ff7b54", "#2ec4b6", "#e9ff70", "#ff8fab", "#90a4ff",
  "#06d6a0", "#ef476f", "#c77dff", "#f4a261",
];
export const OTHER_COLOR = "#6b7280";

export const GENRE_PREFIX = "genre:";

export interface Clusters {
  /** playlist id -> cluster index (-1 = unclustered / other) */
  of: Map<string, number>;
  labels: string[];
}

export const clusterColor = (c: number) =>
  c < 0 ? OTHER_COLOR : PALETTE[c % PALETTE.length];

/**
 * Groups playlists by what they share: songs and artists ("overlap"),
 * or artists alone ("artists"), which also links playlists that share
 * an artist but not a single song.
 */
export function overlapClusters(lib: Library, by: "overlap" | "artists" = "overlap"): Clusters {
  const g = new Graph({ type: "undirected" });
  for (const id of lib.playlists.keys()) g.addNode(id);
  for (const pair of lib.pairs.values()) {
    const w = by === "overlap" ? pair.score : pair.artistScore;
    if (w >= 0.02) g.mergeEdge(pair.a, pair.b, { weight: w });
  }
  return communities(lib, g, (members) => nameAfterBiggest(lib, members));
}

/** Groups playlists by their dominant genre. */
export function genreClusters(lib: Library, genres: GenreProfile): Clusters {
  const top = genres.ranked.slice(0, PALETTE.length - 1).map((g) => g.name);
  const index = new Map(top.map((g, i) => [g, i]));
  const of = new Map<string, number>();
  for (const id of lib.playlists.keys()) {
    const dominant = genres.dominant.get(id);
    of.set(id, dominant !== undefined && index.has(dominant) ? index.get(dominant)! : -1);
  }
  return { of, labels: top };
}

/**
 * "Smart" clusters: each playlist becomes a TF-IDF vector over its artists
 * and genres, so rare shared artists and niche genres count for more than
 * mainstream ones. Playlists are linked to their nearest neighbours by
 * cosine similarity and grouped with Louvain. This finds "moods" that span
 * genres (e.g. a chill cluster of jazz, ambient and indie playlists).
 */
export function smartClusters(lib: Library, artistGenres: Map<string, string[]> | null): Clusters {
  const ids = [...lib.playlists.keys()];
  const raw = new Map<string, Map<string, number>>();
  const df = new Map<string, number>();
  for (const id of ids) {
    const v = new Map<string, number>();
    for (const [artist, count] of lib.playlistArtists.get(id) ?? []) {
      v.set("a:" + artist, (v.get("a:" + artist) ?? 0) + count);
      for (const genre of artistGenres?.get(artist) ?? [])
        v.set("g:" + genre, (v.get("g:" + genre) ?? 0) + count * 1.5);
    }
    raw.set(id, v);
    for (const f of v.keys()) df.set(f, (df.get(f) ?? 0) + 1);
  }

  const n = ids.length;
  const vectors = new Map<string, Map<string, number>>();
  for (const [id, v] of raw) {
    const out = new Map<string, number>();
    let norm = 0;
    for (const [f, tf] of v) {
      const w = Math.log(1 + tf) * Math.log(1 + n / df.get(f)!);
      out.set(f, w);
      norm += w * w;
    }
    norm = Math.sqrt(norm) || 1;
    for (const [f, w] of out) out.set(f, w / norm);
    vectors.set(id, out);
  }

  // Sparse cosine similarity via an inverted index.
  const byFeature = new Map<string, [string, number][]>();
  for (const [id, v] of vectors)
    for (const [f, w] of v) {
      const list = byFeature.get(f) ?? [];
      list.push([id, w]);
      byFeature.set(f, list);
    }
  const sims = new Map<string, Map<string, number>>();
  for (const list of byFeature.values()) {
    if (list.length > 200) continue; // ubiquitous features carry little signal
    for (let i = 0; i < list.length; i++)
      for (let j = i + 1; j < list.length; j++) {
        const [a, wa] = list[i];
        const [b, wb] = list[j];
        const m = sims.get(a) ?? new Map();
        m.set(b, (m.get(b) ?? 0) + wa * wb);
        sims.set(a, m);
        const m2 = sims.get(b) ?? new Map();
        m2.set(a, (m2.get(a) ?? 0) + wa * wb);
        sims.set(b, m2);
      }
  }

  const g = new Graph({ type: "undirected" });
  for (const id of ids) g.addNode(id);
  const k = Math.max(3, Math.round(Math.log2(n + 1)));
  for (const [a, m] of sims) {
    [...m.entries()]
      .sort((x, y) => y[1] - x[1])
      .slice(0, k)
      .filter(([, w]) => w > 0.05)
      .forEach(([b, w]) => g.mergeEdge(a, b, { weight: w }));
  }

  // Name each cluster after the genres (or artists) that set it apart.
  return communities(lib, g, (members) => {
    const score = new Map<string, number>();
    for (const id of members)
      for (const [f, w] of vectors.get(id)!) score.set(f, (score.get(f) ?? 0) + w);
    const top = (prefix: string) =>
      [...score.entries()]
        .filter(([f]) => f.startsWith(prefix))
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([f]) => f.slice(2));
    const genres = top("g:");
    if (genres.length) return genres.join(" · ");
    const artists = top("a:").map((id) => lib.artists.get(id)?.artist.name ?? id);
    return artists.length ? artists.join(" · ") : nameAfterBiggest(lib, members);
  });
}

function communities(lib: Library, g: Graph, name: (members: string[]) => string): Clusters {
  if (g.size === 0) {
    return { of: new Map([...lib.playlists.keys()].map((id) => [id, 0])), labels: ["All"] };
  }
  const raw = louvain(g, { getEdgeWeight: "weight", resolution: 1.1, rng: seeded(7) });
  // Renumber so the biggest cluster gets the first colour.
  const sizes = new Map<number, number>();
  for (const c of Object.values(raw)) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const of = new Map(Object.entries(raw).map(([id, c]) => [id, order.indexOf(c)]));
  const labels = order.map((_, i) => name([...of.entries()].filter(([, c]) => c === i).map(([id]) => id)));
  return { of, labels };
}

function nameAfterBiggest(lib: Library, members: string[]) {
  const sorted = members
    .map((id) => lib.playlists.get(id)!)
    .sort((a, b) => b.tracks.length - a.tracks.length);
  return sorted.length > 1 ? `${sorted[0].name} +${sorted.length - 1}` : sorted[0].name;
}

export function buildGraph(
  lib: Library,
  s: GraphSettings,
  clusters: Clusters,
  genres: GenreProfile | null
): Graph {
  const g = new Graph({ type: "undirected" });
  const clusterOf = (pid: string) => clusters.of.get(pid) ?? -1;
  const link = (a: string, b: string, attrs: Record<string, unknown>) => {
    if (a !== b) g.mergeEdge(a, b, attrs);
  };
  const minPlaylists = Math.min(s.minPlaylists, lib.playlists.size);
  const cap = s.maxNodes >= MAX_NODES ? Infinity : s.maxNodes;

  for (const p of lib.playlists.values()) {
    const c = clusterOf(p.id);
    g.mergeNode(p.id, {
      kind: "playlist" as NodeKind,
      label: p.name,
      size: 5 + Math.sqrt(p.tracks.length) * 1.1,
      color: clusterColor(c),
      cluster: c,
      zIndex: 2,
    });
  }

  if (s.mode === "playlists") {
    const byPlaylist = new Map<string, { score: number; key: string }[]>();
    for (const [key, pair] of lib.pairs) {
      for (const self of [pair.a, pair.b]) {
        const list = byPlaylist.get(self) ?? [];
        list.push({ score: pair.score, key });
        byPlaylist.set(self, list);
      }
    }
    // Keep each playlist's strongest links, so the map shows structure instead of a hairball.
    const keep = new Set<string>();
    for (const list of byPlaylist.values()) {
      list
        .sort((a, b) => b.score - a.score)
        .filter((e, i) => i < s.linksPerNode && e.score >= s.minSimilarity)
        .forEach((e) => keep.add(e.key));
    }
    for (const key of keep) {
      const pair = lib.pairs.get(key)!;
      link(pair.a, pair.b, {
        weight: pair.score,
        size: 0.5 + pair.score * 6,
        color: overlay(0.1 + Math.min(pair.score, 0.5) * 0.8),
      });
    }
  }

  if (s.mode === "artists") {
    const candidates = [...lib.artists.values()]
      .filter((a) => a.playlists.size >= minPlaylists)
      .sort((a, b) => b.playlists.size - a.playlists.size || b.trackIds.size - a.trackIds.size)
      .slice(0, cap);
    for (const a of candidates) {
      if (g.hasNode(a.artist.id)) continue;
      const home = [...a.playlists.entries()].sort((x, y) => y[1] - x[1])[0][0];
      const c = clusterOf(home);
      g.addNode(a.artist.id, {
        kind: "artist" as NodeKind,
        label: a.artist.name,
        size: 2 + Math.sqrt(a.playlists.size) * 1.6,
        color: fade(clusterColor(c)),
        cluster: c,
        zIndex: 1,
      });
      for (const [pid, count] of a.playlists) {
        link(pid, a.artist.id, {
          weight: count,
          size: 0.3 + Math.log2(1 + count) * 0.4,
          color: overlay(0.1),
        });
      }
    }
  }

  if (s.mode === "songs") {
    const candidates = [...lib.tracks.values()]
      .filter((t) => t.playlists.length >= minPlaylists)
      .sort((a, b) => b.playlists.length - a.playlists.length)
      .slice(0, cap);
    for (const t of candidates) {
      if (g.hasNode(t.track.id)) continue;
      const c = clusterOf(t.playlists[0]);
      g.addNode(t.track.id, {
        kind: "track" as NodeKind,
        label: `${t.track.name} · ${t.track.artists[0]?.name ?? ""}`,
        size: 1.5 + t.playlists.length * 0.9,
        color: fade(clusterColor(c)),
        cluster: c,
        zIndex: 1,
      });
      for (const pid of t.playlists) {
        link(pid, t.track.id, { weight: 1, size: 0.4, color: overlay(0.1) });
      }
    }
  }

  if (s.mode === "genres" && genres) {
    const shown = genres.ranked.slice(0, cap);
    const maxTracks = Math.max(1, ...shown.map((x) => x.tracks));
    const genreIndex = new Map(clusters.labels.map((l, i) => [l, i]));
    for (const genre of shown) {
      const id = GENRE_PREFIX + genre.name;
      // A genre sits with the playlist it makes up the biggest share of.
      let c = genreIndex.get(genre.name) ?? -1;
      if (c < 0) {
        let best = 0;
        for (const [pid, count] of genre.playlists) {
          const share = count / (lib.playlists.get(pid)!.tracks.length || 1);
          if (share > best) [best, c] = [share, clusterOf(pid)];
        }
      }
      g.addNode(id, {
        kind: "genre" as NodeKind,
        label: genre.name,
        size: 3 + Math.sqrt(genre.tracks / maxTracks) * 12,
        color: clusterColor(c),
        cluster: c,
        zIndex: 1,
      });
      for (const [pid, count] of genre.playlists) {
        const share = count / (lib.playlists.get(pid)!.tracks.length || 1);
        if (share < s.minSimilarity) continue;
        link(pid, id, {
          weight: share,
          size: 0.3 + share * 4,
          color: overlay(0.08 + share * 0.4),
        });
      }
    }
  }

  return g;
}

/** White at the given opacity over the canvas colour, as an opaque colour. */
export function overlay(alpha: number) {
  const v = Math.round(0x0b + (255 - 0x0b) * alpha);
  return `rgb(${v},${v},${Math.min(255, v + 4)})`;
}

function fade(hex: string) {
  const n = parseInt(hex.slice(1), 16);
  const mix = (c: number) => Math.round(c * 0.55 + 0x2a * 0.45);
  return `rgb(${mix(n >> 16)},${mix((n >> 8) & 255)},${mix(n & 255)})`;
}

export function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
