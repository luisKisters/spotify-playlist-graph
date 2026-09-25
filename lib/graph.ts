import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import louvain from "graphology-communities-louvain";
import type { GenreProfile, Library } from "./analysis";

export type GraphMode = "playlists" | "artists" | "songs" | "genres";
export type ColorBy = "overlap" | "genre";
export type NodeKind = "playlist" | "artist" | "track" | "genre";

/** Density level, 1 (sparse) to 5 (dense). */
export type Density = 1 | 2 | 3 | 4 | 5;

export const PALETTE = [
  "#1ed760", "#4cc9f0", "#f72585", "#ffb703", "#b388ff",
  "#ff7b54", "#2ec4b6", "#e9ff70", "#ff8fab", "#90a4ff",
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

/** Groups playlists by what they share (songs and artists). */
export function overlapClusters(lib: Library): Clusters {
  const g = new Graph({ type: "undirected" });
  for (const id of lib.playlists.keys()) g.addNode(id);
  for (const pair of lib.pairs.values()) {
    if (pair.score >= 0.02) g.mergeEdge(pair.a, pair.b, { weight: pair.score });
  }
  if (g.size === 0) {
    return { of: new Map([...lib.playlists.keys()].map((id) => [id, 0])), labels: ["All"] };
  }

  const raw = louvain(g, { getEdgeWeight: "weight", resolution: 1.1, rng: seeded(7) });
  // Renumber so the biggest cluster gets the first colour.
  const sizes = new Map<number, number>();
  for (const c of Object.values(raw)) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  const of = new Map(Object.entries(raw).map(([id, c]) => [id, order.indexOf(c)]));

  // Name each cluster after its biggest playlist.
  const labels = order.map((_, i) => {
    const members = [...of.entries()]
      .filter(([, c]) => c === i)
      .map(([id]) => lib.playlists.get(id)!)
      .sort((a, b) => b.tracks.length - a.tracks.length);
    return members.length > 1 ? `${members[0].name} +${members.length - 1}` : members[0].name;
  });
  return { of, labels };
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

const PLAYLIST_LINKS: Record<Density, { perNode: number; min: number; strong: number }> = {
  1: { perNode: 1, min: 0.1, strong: 0.5 },
  2: { perNode: 2, min: 0.06, strong: 0.4 },
  3: { perNode: 3, min: 0.04, strong: 0.3 },
  4: { perNode: 5, min: 0.02, strong: 0.2 },
  5: { perNode: 10, min: 0.005, strong: 0.1 },
};
const MIN_PLAYLISTS: Record<Density, number> = { 1: 5, 2: 4, 3: 3, 4: 2, 5: 2 };
const MAX_ITEMS: Record<Density, number> = { 1: 60, 2: 120, 3: 200, 4: 350, 5: 700 };
const MAX_GENRES: Record<Density, number> = { 1: 8, 2: 15, 3: 25, 4: 40, 5: 70 };

export function buildGraph(
  lib: Library,
  mode: GraphMode,
  density: Density,
  clusters: Clusters,
  genres: GenreProfile | null
): Graph {
  const g = new Graph({ type: "undirected" });
  const rand = seeded(1);
  const pos = () => ({ x: rand() * 100, y: rand() * 100 });
  const colorOf = (pid: string) => clusterColor(clusters.of.get(pid) ?? -1);
  const link = (a: string, b: string, attrs: Record<string, unknown>) => {
    if (a !== b) g.mergeEdge(a, b, attrs);
  };

  for (const p of lib.playlists.values()) {
    g.mergeNode(p.id, {
      kind: "playlist" as NodeKind,
      label: p.name,
      size: 5 + Math.sqrt(p.tracks.length) * 1.1,
      color: colorOf(p.id),
      zIndex: 2,
      ...pos(),
    });
  }

  if (mode === "playlists") {
    const { perNode, min, strong } = PLAYLIST_LINKS[density];
    const byPlaylist = new Map<string, { score: number; key: string }[]>();
    for (const [key, pair] of lib.pairs) {
      for (const self of [pair.a, pair.b]) {
        const list = byPlaylist.get(self) ?? [];
        list.push({ score: pair.score, key });
        byPlaylist.set(self, list);
      }
    }
    // Keep each playlist's strongest links plus every strong link overall,
    // so the map shows structure instead of a hairball.
    const keep = new Set<string>();
    for (const list of byPlaylist.values()) {
      list
        .sort((a, b) => b.score - a.score)
        .filter((e, i) => e.score >= strong || (i < perNode && e.score >= min))
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

  if (mode === "artists") {
    const candidates = [...lib.artists.values()]
      .filter((a) => a.playlists.size >= Math.min(MIN_PLAYLISTS[density], lib.playlists.size))
      .sort((a, b) => b.playlists.size - a.playlists.size || b.trackIds.size - a.trackIds.size)
      .slice(0, MAX_ITEMS[density]);
    for (const a of candidates) {
      if (g.hasNode(a.artist.id)) continue;
      const home = [...a.playlists.entries()].sort((x, y) => y[1] - x[1])[0][0];
      g.addNode(a.artist.id, {
        kind: "artist" as NodeKind,
        label: a.artist.name,
        size: 2 + Math.sqrt(a.playlists.size) * 1.6,
        color: fade(colorOf(home)),
        zIndex: 1,
        ...pos(),
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

  if (mode === "songs") {
    const candidates = [...lib.tracks.values()]
      .filter((t) => t.playlists.length >= Math.min(MIN_PLAYLISTS[density], lib.playlists.size))
      .sort((a, b) => b.playlists.length - a.playlists.length)
      .slice(0, MAX_ITEMS[density]);
    for (const t of candidates) {
      if (g.hasNode(t.track.id)) continue;
      g.addNode(t.track.id, {
        kind: "track" as NodeKind,
        label: `${t.track.name} · ${t.track.artists[0]?.name ?? ""}`,
        size: 1.5 + t.playlists.length * 0.9,
        color: fade(colorOf(t.playlists[0])),
        zIndex: 1,
        ...pos(),
      });
      for (const pid of t.playlists) {
        link(pid, t.track.id, { weight: 1, size: 0.4, color: overlay(0.1) });
      }
    }
  }

  if (mode === "genres" && genres) {
    const shown = genres.ranked.slice(0, MAX_GENRES[density]);
    const colorIndex = new Map(clusters.labels.map((l, i) => [l, i]));
    const maxTracks = Math.max(1, ...shown.map((x) => x.tracks));
    for (const genre of shown) {
      const id = GENRE_PREFIX + genre.name;
      const c = colorIndex.get(genre.name);
      g.addNode(id, {
        kind: "genre" as NodeKind,
        label: genre.name,
        size: 3 + Math.sqrt(genre.tracks / maxTracks) * 12,
        color: c !== undefined ? clusterColor(c) : "#9ca3af",
        zIndex: 1,
        ...pos(),
      });
      // At low density only link a playlist to genres that matter to it.
      const minShare = [0.25, 0.15, 0.08, 0.04, 0][density - 1];
      for (const [pid, count] of genre.playlists) {
        const size = lib.playlists.get(pid)!.tracks.length || 1;
        if (count / size < minShare) continue;
        link(pid, id, {
          weight: count / size,
          size: 0.3 + (count / size) * 4,
          color: overlay(0.08 + (count / size) * 0.4),
        });
      }
    }
  }

  layout(g);
  return g;
}

function layout(g: Graph) {
  if (g.order < 2) return;
  const settings = forceAtlas2.inferSettings(g);
  // Scale weights so attraction is comparable across views.
  let max = 1e-6;
  g.forEachEdge((_, a) => (max = Math.max(max, a.weight)));
  g.forEachEdge((e, a) => g.setEdgeAttribute(e, "layoutWeight", (a.weight / max) * 10));
  forceAtlas2.assign(g, {
    iterations: g.order > 600 ? 300 : 800,
    getEdgeWeight: "layoutWeight",
    settings: {
      ...settings,
      linLogMode: g.order > 100,
      outboundAttractionDistribution: g.order > 100,
      gravity: 1,
      scalingRatio: g.order > 100 ? 10 : 1.2,
      edgeWeightInfluence: 1,
      barnesHutOptimize: g.order > 300,
    },
  });
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

function seeded(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}
