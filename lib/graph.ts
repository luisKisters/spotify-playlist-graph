import Graph from "graphology";
import forceAtlas2 from "graphology-layout-forceatlas2";
import louvain from "graphology-communities-louvain";
import type { Library } from "./analysis";

export type GraphMode = "playlists" | "artists" | "songs";
export type NodeKind = "playlist" | "artist" | "track";

export const CLUSTER_COLORS = [
  "#1ed760", "#4cc9f0", "#f72585", "#ffb703", "#b388ff",
  "#ff7b54", "#2ec4b6", "#e9ff70", "#ff8fab", "#90a4ff",
];

/** Groups playlists into clusters of similar taste. */
export function playlistClusters(lib: Library): Map<string, number> {
  const g = new Graph({ type: "undirected" });
  for (const id of lib.playlists.keys()) g.addNode(id);
  for (const pair of lib.pairs.values()) {
    if (pair.score >= 0.02) g.addEdge(pair.a, pair.b, { weight: pair.score });
  }
  if (g.size === 0) return new Map([...lib.playlists.keys()].map((id) => [id, 0]));

  const raw = louvain(g, { getEdgeWeight: "weight", resolution: 1.1, rng: seeded(7) });
  // Renumber so the biggest cluster gets the first colour.
  const sizes = new Map<number, number>();
  for (const c of Object.values(raw)) sizes.set(c, (sizes.get(c) ?? 0) + 1);
  const order = [...sizes.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
  return new Map(Object.entries(raw).map(([id, c]) => [id, order.indexOf(c)]));
}

export const clusterColor = (c: number) => CLUSTER_COLORS[c % CLUSTER_COLORS.length];

export function buildGraph(
  lib: Library,
  mode: GraphMode,
  clusters: Map<string, number>
): Graph {
  const g = new Graph({ type: "undirected" });
  const rand = seeded(1);

  for (const p of lib.playlists.values()) {
    g.addNode(p.id, {
      kind: "playlist" as NodeKind,
      label: p.name,
      size: 5 + Math.sqrt(p.tracks.length) * 1.1,
      color: clusterColor(clusters.get(p.id) ?? 0),
      x: rand() * 100,
      y: rand() * 100,
      zIndex: 2,
    });
  }

  if (mode === "playlists") {
    const byPlaylist = new Map<string, { other: string; score: number; key: string }[]>();
    for (const [key, pair] of lib.pairs) {
      for (const [self, other] of [[pair.a, pair.b], [pair.b, pair.a]]) {
        const list = byPlaylist.get(self) ?? [];
        list.push({ other, score: pair.score, key });
        byPlaylist.set(self, list);
      }
    }
    // Keep each playlist's strongest links plus every strong link overall,
    // so the map shows structure instead of a hairball.
    const keep = new Set<string>();
    for (const list of byPlaylist.values()) {
      list
        .sort((a, b) => b.score - a.score)
        .filter((e, i) => e.score >= 0.3 || (i < 3 && e.score >= 0.05))
        .forEach((e) => keep.add(e.key));
    }
    for (const key of keep) {
      const pair = lib.pairs.get(key)!;
      g.addEdge(pair.a, pair.b, {
        weight: pair.score,
        size: 0.5 + pair.score * 6,
        color: overlay(0.1 + Math.min(pair.score, 0.5) * 0.8),
      });
    }
  }

  if (mode === "artists") {
    const candidates = [...lib.artists.values()]
      .filter((a) => a.playlists.size >= 2)
      .sort((a, b) => b.playlists.size - a.playlists.size || b.trackIds.size - a.trackIds.size)
      .slice(0, 300);
    for (const a of candidates) {
      const home = [...a.playlists.entries()].sort((x, y) => y[1] - x[1])[0][0];
      g.addNode(a.artist.id, {
        kind: "artist" as NodeKind,
        label: a.artist.name,
        size: 2 + Math.sqrt(a.playlists.size) * 1.6,
        color: fade(clusterColor(clusters.get(home) ?? 0)),
        x: rand() * 100,
        y: rand() * 100,
        zIndex: 1,
      });
      for (const [pid, count] of a.playlists) {
        g.addEdge(pid, a.artist.id, {
          weight: count,
          size: 0.3 + Math.log2(1 + count) * 0.4,
          color: overlay(0.1),
        });
      }
    }
  }

  if (mode === "songs") {
    const candidates = [...lib.tracks.values()]
      .filter((t) => t.playlists.length >= 2)
      .sort((a, b) => b.playlists.length - a.playlists.length)
      .slice(0, 400);
    for (const t of candidates) {
      g.addNode(t.track.id, {
        kind: "track" as NodeKind,
        label: `${t.track.name} · ${t.track.artists[0]?.name ?? ""}`,
        size: 1.5 + t.playlists.length * 0.9,
        color: fade(clusterColor(clusters.get(t.playlists[0]) ?? 0)),
        x: rand() * 100,
        y: rand() * 100,
        zIndex: 1,
      });
      for (const pid of t.playlists) {
        g.addEdge(pid, t.track.id, { weight: 1, size: 0.4, color: overlay(0.1) });
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
  const max = Math.max(...g.mapEdges((_, a) => a.weight as number), 1e-6);
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
