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

export const DEFAULT_SETTINGS: GraphSettings = {
  mode: "playlists",
  clusterBy: "smart",
  linksPerNode: 3,
  minSimilarity: 0.04,
  minPlaylists: 2,
  maxNodes: 300,
  filter: "",
  orphans: true,
  nodeSize: 1,
  linkThickness: 1,
  textFade: 0,
  labelSize: 12,
  centerForce: 0.3,
  repelForce: 8,
  linkForce: 0.6,
  linkDistance: 120,
  clusterForce: 0.3,
};

const KEY = "graph-settings-v1";

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
