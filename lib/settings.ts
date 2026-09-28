import type { ClusterBy, GraphMode } from "./graph";

export interface ForceSettings {
  /** Pull towards the middle, 0..1 */
  centerForce: number;
  /** Push between nodes, 0..20 */
  repelForce: number;
  /** Spring strength of links, 0..1 */
  linkForce: number;
  /** Preferred link length */
  linkDistance: number;
  /** Pull of each node towards its cluster's anchor, 0..1 */
  clusterForce: number;
}

export interface DisplaySettings {
  nodeSize: number;
  linkThickness: number;
  /** Like Obsidian: higher shows labels earlier when zooming, -3..3 */
  textFade: number;
  labelSize: number;
  /** Colour links by the cluster they belong to instead of plain grey */
  tintLinks: boolean;
}

export interface GraphSettings extends ForceSettings, DisplaySettings {
  mode: GraphMode;
  clusterBy: ClusterBy;
  /** Playlists view: strongest links kept per playlist */
  linksPerNode: number;
  /** Playlists view: minimum similarity for a link; genres view: minimum share */
  minSimilarity: number;
  /** Artists and songs views: only items in at least this many playlists */
  minPlaylists: number;
  /** Cap on non-playlist nodes; MAX_NODES means "all" */
  maxNodes: number;
  filter: string;
  orphans: boolean;
}

export const MAX_NODES = 3000;

/** The "Galaxy" look: every song, in islands of taste. */
export const DEFAULT_SETTINGS: GraphSettings = {
  mode: "songs",
  clusterBy: "smart",
  linksPerNode: 4,
  minSimilarity: 0.04,
  minPlaylists: 1,
  maxNodes: MAX_NODES,
  filter: "",
  orphans: true,
  nodeSize: 1,
  linkThickness: 0.7,
  textFade: 0,
  labelSize: 12,
  tintLinks: true,
  centerForce: 0.15,
  repelForce: 8,
  linkForce: 0.5,
  linkDistance: 90,
  clusterForce: 0.9,
};

// v2: forces are now scale-aware, so values saved for the old layout don't carry over.
const KEY = "graph-settings-v2";

export function loadSettings(): GraphSettings {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_SETTINGS;
}

export function saveSettings(s: GraphSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {}
}
