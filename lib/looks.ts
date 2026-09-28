import { MAX_NODES, type GraphSettings } from "./settings";

/**
 * Curated combinations of view, clustering, forces and display that make
 * good-looking, readable graphs out of the box. Each one sets every setting
 * it depends on, so picking it always gives the same picture.
 */
export interface Look {
  id: string;
  name: string;
  blurb: string;
  values: Partial<GraphSettings>;
}

const BASE: Partial<GraphSettings> = {
  filter: "",
  orphans: true,
  nodeSize: 1,
  linkThickness: 1,
  labelSize: 12,
  tintLinks: true,
  centerForce: 0.15,
  repelForce: 8,
  linkForce: 0.5,
  linkDistance: 90,
};

export const LOOKS: Look[] = [
  {
    id: "islands",
    name: "Taste islands",
    blurb: "Playlists grouped into islands of similar taste",
    values: {
      ...BASE,
      mode: "playlists",
      clusterBy: "smart",
      linksPerNode: 4,
      minSimilarity: 0.04,
      clusterForce: 0.7,
      textFade: 0.5,
    },
  },
  {
    id: "galaxy",
    name: "Galaxy",
    blurb: "Every song you've saved, orbiting its playlists",
    values: {
      ...BASE,
      mode: "songs",
      clusterBy: "smart",
      minPlaylists: 1,
      maxNodes: MAX_NODES,
      clusterForce: 0.9,
      linkThickness: 0.7,
      textFade: 0,
    },
  },
  {
    id: "continent",
    name: "Continent",
    blurb: "All songs on one landmass, shared ones pulling scenes together",
    values: {
      ...BASE,
      mode: "songs",
      clusterBy: "smart",
      minPlaylists: 1,
      maxNodes: MAX_NODES,
      clusterForce: 0.35,
      linkThickness: 0.7,
      textFade: 0,
    },
  },
  {
    id: "bridges",
    name: "Bridges",
    blurb: "Only songs in two or more playlists: the glue between them",
    values: {
      ...BASE,
      mode: "songs",
      clusterBy: "overlap",
      minPlaylists: 2,
      maxNodes: MAX_NODES,
      clusterForce: 0.3,
      textFade: 0.5,
    },
  },
  {
    id: "artists",
    name: "Artist web",
    blurb: "Every artist, sitting with the playlists that play them",
    values: {
      ...BASE,
      mode: "artists",
      clusterBy: "smart",
      minPlaylists: 1,
      maxNodes: MAX_NODES,
      clusterForce: 0.8,
      linkThickness: 0.7,
      textFade: 0,
    },
  },
  {
    id: "genres",
    name: "Genre sky",
    blurb: "Genres as stars, playlists as the constellations around them",
    values: {
      ...BASE,
      mode: "genres",
      clusterBy: "genre",
      minSimilarity: 0.05,
      maxNodes: 150,
      clusterForce: 0.4,
      textFade: 1,
    },
  },
  {
    id: "constellation",
    name: "Constellation",
    blurb: "A calm, Obsidian-style map: each playlist and its two closest",
    values: {
      ...BASE,
      mode: "playlists",
      clusterBy: "overlap",
      linksPerNode: 2,
      minSimilarity: 0.02,
      clusterForce: 0,
      centerForce: 0.4,
      tintLinks: false,
      textFade: 1,
    },
  },
];

export function activeLook(s: GraphSettings): string | null {
  const match = LOOKS.find((l) =>
    Object.entries(l.values).every(([k, v]) => s[k as keyof GraphSettings] === v)
  );
  return match?.id ?? null;
}
