import type Graph from "graphology";
import type { Library } from "./analysis";
import { GENRE_PREFIX, type NodeKind } from "./graph";

type Field = "any" | "playlist" | "artist" | "song" | "genre";

interface Term {
  field: Field;
  value: string;
  negate: boolean;
}

const FIELDS: Record<string, Field> = {
  playlist: "playlist",
  artist: "artist",
  song: "song",
  track: "song",
  genre: "genre",
};

/**
 * Parses Obsidian-style queries: `genre:"indie pop" -artist:drake chill`.
 * Bare words match a node's name; `field:` matches what the node contains
 * or belongs to (a playlist matches `artist:x` if x is in it).
 */
export function parseFilter(query: string): Term[] {
  const terms: Term[] = [];
  const re = /(-?)(?:(\w+):)?(?:"([^"]*)"?|(\S+))/g;
  for (const m of query.matchAll(re)) {
    const [, neg, field, quoted, bare] = m;
    let f: Field = "any";
    let value = quoted ?? bare ?? "";
    if (field) {
      if (FIELDS[field.toLowerCase()]) f = FIELDS[field.toLowerCase()];
      else value = `${field}:${value}`;
    }
    value = value.trim().toLowerCase();
    if (value) terms.push({ field: f, value, negate: neg === "-" });
  }
  return terms;
}

/** Removes nodes that don't match the filter, from hidden clusters, and (optionally) orphans. */
export function applyFilters(
  g: Graph,
  lib: Library,
  artistGenres: Map<string, string[]> | null,
  opts: { query: string; orphans: boolean; hidden: Set<number> }
) {
  const terms = parseFilter(opts.query);
  if (terms.length) {
    const values = (node: string, field: Exclude<Field, "any">) =>
      fieldValues(lib, artistGenres, node, g.getNodeAttribute(node, "kind"), field);
    const matches = (node: string, t: Term) => {
      const list =
        t.field === "any"
          ? [String(g.getNodeAttribute(node, "label")).toLowerCase()]
          : values(node, t.field);
      return list.some((v) => v.includes(t.value));
    };
    g.nodes()
      .filter((node) => !terms.every((t) => matches(node, t) !== t.negate))
      .forEach((node) => g.dropNode(node));
  }
  if (opts.hidden.size) {
    g.filterNodes((_, a) => opts.hidden.has(a.cluster)).forEach((node) => g.dropNode(node));
  }
  if (!opts.orphans) {
    g.filterNodes((node) => g.degree(node) === 0).forEach((node) => g.dropNode(node));
  }
}

function fieldValues(
  lib: Library,
  artistGenres: Map<string, string[]> | null,
  node: string,
  kind: NodeKind,
  field: Exclude<Field, "any">
): string[] {
  const lower = (xs: Iterable<string>) => [...xs].map((x) => x.toLowerCase());
  const genresOf = (artistIds: Iterable<string>) => {
    const out = new Set<string>();
    for (const a of artistIds) for (const g of artistGenres?.get(a) ?? []) out.add(g);
    return out;
  };
  const playlistName = (id: string) => lib.playlists.get(id)?.name ?? "";
  const artistName = (id: string) => lib.artists.get(id)?.artist.name ?? "";

  if (kind === "playlist") {
    const p = lib.playlists.get(node)!;
    const artists = lib.playlistArtists.get(node)?.keys() ?? [];
    if (field === "playlist") return lower([p.name]);
    if (field === "artist") return lower([...artists].map(artistName));
    if (field === "song") return lower(p.tracks.map((t) => t.name));
    return lower(genresOf(artists));
  }
  if (kind === "artist") {
    const a = lib.artists.get(node)!;
    if (field === "artist") return lower([a.artist.name]);
    if (field === "playlist") return lower([...a.playlists.keys()].map(playlistName));
    if (field === "song") return lower([...a.trackIds].map((t) => lib.tracks.get(t)!.track.name));
    return lower(genresOf([node]));
  }
  if (kind === "track") {
    const t = lib.tracks.get(node)!;
    if (field === "song") return lower([t.track.name]);
    if (field === "artist") return lower(t.track.artists.map((a) => a.name));
    if (field === "playlist") return lower(t.playlists.map(playlistName));
    return lower(genresOf(t.track.artists.map((a) => a.id)));
  }
  // genre node
  const name = node.slice(GENRE_PREFIX.length);
  if (field === "genre") return [name];
  if (field === "artist") {
    const out: string[] = [];
    artistGenres?.forEach((gs, id) => gs.includes(name) && out.push(artistName(id)));
    return lower(out);
  }
  if (field === "playlist") {
    const out: string[] = [];
    for (const [pid, artists] of lib.playlistArtists)
      for (const a of artists.keys())
        if (artistGenres?.get(a)?.includes(name)) {
          out.push(playlistName(pid));
          break;
        }
    return lower(out);
  }
  return [];
}
