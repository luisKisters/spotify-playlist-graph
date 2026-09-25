"use client";

import type { ClusterBy, Clusters, GraphMode } from "@/lib/graph";
import { clusterColor } from "@/lib/graph";
import { DEFAULT_SETTINGS, MAX_NODES, type GraphSettings } from "@/lib/settings";
import { Button, Collapsible, Segmented, Slider, Toggle } from "./controls";

const MODES: { id: GraphMode; label: string }[] = [
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
  { id: "songs", label: "Songs" },
  { id: "genres", label: "Genres" },
];

const CLUSTER_BY: { id: ClusterBy; label: string; title: string }[] = [
  { id: "smart", label: "Smart", title: "Similar taste: rare shared artists and niche genres weigh most" },
  { id: "overlap", label: "Overlap", title: "Shared songs and artists" },
  { id: "artists", label: "Artists", title: "Shared artists only" },
  { id: "genre", label: "Genre", title: "Each playlist's most common genre" },
];

const PRESETS: { label: string; values: Partial<GraphSettings> }[] = [
  { label: "Tight", values: { centerForce: 0.6, repelForce: 4, linkForce: 0.8, linkDistance: 60, clusterForce: 0.3 } },
  { label: "Spread out", values: { centerForce: 0.1, repelForce: 16, linkForce: 0.4, linkDistance: 260, clusterForce: 0.2 } },
  { label: "Islands", values: { centerForce: 0.05, repelForce: 10, linkForce: 0.7, linkDistance: 140, clusterForce: 0.9 } },
];

interface Props {
  settings: GraphSettings;
  update: (patch: Partial<GraphSettings>) => void;
  clusters: Clusters;
  clusterSizes: Map<number, number>;
  hidden: Set<number>;
  setHidden: (h: Set<number>) => void;
  focusCluster: number | null;
  setFocusCluster: (c: number | null) => void;
  onAnimate: () => void;
  nodeCount: number;
  edgeCount: number;
  status: string | null;
}

export default function GraphSettingsPanel({
  settings: s,
  update,
  clusters,
  clusterSizes,
  hidden,
  setHidden,
  focusCluster,
  setFocusCluster,
  onAnimate,
  nodeCount,
  edgeCount,
  status,
}: Props) {
  const toggle = (c: number) => {
    const next = new Set(hidden);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    setHidden(next);
  };
  const clusterList = clusters.labels
    .map((label, i) => ({ label, i, size: clusterSizes.get(i) ?? 0 }))
    .filter((c) => c.size > 0);
  const others = clusterSizes.get(-1) ?? 0;

  return (
    <div className="text-sm">
      <div className="flex items-center justify-between border-b border-line px-4 py-2 text-xs text-zinc-500">
        <span>
          {nodeCount} nodes · {edgeCount} links
          {status && <span className="ml-2 text-zinc-400">{status}</span>}
        </span>
        <button
          onClick={() => update({ ...DEFAULT_SETTINGS, mode: s.mode, clusterBy: s.clusterBy })}
          className="hover:text-white"
          title="Reset all settings"
        >
          Reset
        </button>
      </div>

      <Collapsible title="View">
        <Segmented full options={MODES} value={s.mode} onChange={(mode) => update({ mode })} />
        {s.mode === "playlists" && (
          <>
            <Slider
              label="Links per playlist"
              value={s.linksPerNode}
              min={1}
              max={15}
              step={1}
              onChange={(linksPerNode) => update({ linksPerNode })}
              hint="Keep each playlist's N most similar neighbours"
            />
            <Slider
              label="Minimum similarity"
              value={s.minSimilarity}
              min={0}
              max={0.4}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(minSimilarity) => update({ minSimilarity })}
            />
          </>
        )}
        {(s.mode === "artists" || s.mode === "songs") && (
          <Slider
            label="In at least N playlists"
            value={s.minPlaylists}
            min={1}
            max={10}
            step={1}
            onChange={(minPlaylists) => update({ minPlaylists })}
          />
        )}
        {s.mode === "genres" && (
          <Slider
            label="Minimum share of a playlist"
            value={s.minSimilarity}
            min={0}
            max={0.4}
            step={0.01}
            format={(v) => `${Math.round(v * 100)}%`}
            onChange={(minSimilarity) => update({ minSimilarity })}
          />
        )}
        {s.mode !== "playlists" && (
          <Slider
            label={`Max ${s.mode}`}
            value={s.maxNodes}
            min={25}
            max={MAX_NODES}
            step={25}
            format={(v) => (v >= MAX_NODES ? "All" : String(v))}
            onChange={(maxNodes) => update({ maxNodes })}
          />
        )}
      </Collapsible>

      <Collapsible title="Filters">
        <div className="relative">
          <input
            value={s.filter}
            onChange={(e) => update({ filter: e.target.value })}
            placeholder='genre:"indie" -artist:drake'
            spellCheck={false}
            className="w-full rounded-md border border-line bg-raised px-3 py-1.5 font-mono text-xs text-white placeholder:text-zinc-600 focus:border-white/25 focus:outline-none"
          />
          {s.filter && (
            <button
              onClick={() => update({ filter: "" })}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
              aria-label="Clear filter"
            >
              ×
            </button>
          )}
        </div>
        <p className="text-[11px] leading-snug text-zinc-500">
          Words match names. Use <code className="text-zinc-400">playlist:</code>{" "}
          <code className="text-zinc-400">artist:</code> <code className="text-zinc-400">song:</code>{" "}
          <code className="text-zinc-400">genre:</code>, quotes for phrases, and{" "}
          <code className="text-zinc-400">-</code> to exclude.
        </p>
        <Toggle label="Orphans" value={s.orphans} onChange={(orphans) => update({ orphans })} />
      </Collapsible>

      <Collapsible
        title="Clusters"
        right={
          hidden.size > 0 || focusCluster !== null ? (
            <button
              onClick={() => {
                setHidden(new Set());
                setFocusCluster(null);
              }}
              className="text-xs text-zinc-500 hover:text-white"
            >
              Show all
            </button>
          ) : undefined
        }
      >
        <Segmented
          full
          options={CLUSTER_BY}
          value={s.clusterBy}
          onChange={(clusterBy) => update({ clusterBy })}
        />
        <ul className="-mx-2 space-y-0.5">
          {clusterList.map(({ label, i, size }) => {
            const isHidden = hidden.has(i);
            const dimmed = isHidden || (focusCluster !== null && focusCluster !== i);
            return (
              <li key={i} className="flex items-center gap-1">
                <button
                  onClick={() => setFocusCluster(focusCluster === i ? null : i)}
                  className={`flex min-w-0 flex-1 items-center gap-2 rounded px-2 py-1 text-left hover:bg-white/5 ${
                    focusCluster === i ? "bg-white/5" : ""
                  } ${dimmed ? "opacity-40" : ""}`}
                  title="Focus this cluster"
                >
                  <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: clusterColor(i) }} />
                  <span className="truncate text-[13px] text-zinc-200">{label}</span>
                  <span className="ml-auto shrink-0 text-xs tabular-nums text-zinc-500">{size}</span>
                </button>
                <button
                  onClick={() => toggle(i)}
                  className="rounded p-1 text-zinc-500 hover:bg-white/5 hover:text-white"
                  title={isHidden ? "Show" : "Hide"}
                  aria-label={isHidden ? `Show ${label}` : `Hide ${label}`}
                >
                  <Eye off={isHidden} />
                </button>
              </li>
            );
          })}
          {others > 0 && (
            <li className="flex items-center gap-2 px-2 py-1 text-[13px] text-zinc-500">
              <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: clusterColor(-1) }} />
              Other
              <span className="ml-auto pr-7 text-xs tabular-nums">{others}</span>
            </li>
          )}
        </ul>
        <Slider
          label="Cluster pull"
          value={s.clusterForce}
          min={0}
          max={1}
          step={0.01}
          onChange={(clusterForce) => update({ clusterForce })}
          hint="Pulls each cluster to its own area so groups separate"
        />
      </Collapsible>

      <Collapsible title="Display">
        <Slider
          label="Text fade threshold"
          value={s.textFade}
          min={-3}
          max={3}
          step={0.1}
          onChange={(textFade) => update({ textFade })}
        />
        <Slider label="Label size" value={s.labelSize} min={8} max={20} step={1} onChange={(labelSize) => update({ labelSize })} />
        <Slider label="Node size" value={s.nodeSize} min={0.2} max={3} step={0.01} onChange={(nodeSize) => update({ nodeSize })} />
        <Slider
          label="Link thickness"
          value={s.linkThickness}
          min={0.1}
          max={4}
          step={0.01}
          onChange={(linkThickness) => update({ linkThickness })}
        />
      </Collapsible>

      <Collapsible
        title="Forces"
        right={
          <Button onClick={onAnimate} title="Re-run the layout">
            Animate
          </Button>
        }
      >
        <div className="flex gap-1.5">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => update(p.values)}
              className="flex-1 rounded-md border border-line px-2 py-1 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
            >
              {p.label}
            </button>
          ))}
        </div>
        <Slider label="Center force" value={s.centerForce} min={0} max={1} step={0.01} onChange={(centerForce) => update({ centerForce })} />
        <Slider label="Repel force" value={s.repelForce} min={0} max={20} step={0.05} onChange={(repelForce) => update({ repelForce })} />
        <Slider label="Link force" value={s.linkForce} min={0} max={1} step={0.01} onChange={(linkForce) => update({ linkForce })} />
        <Slider label="Link distance" value={s.linkDistance} min={20} max={500} step={1} onChange={(linkDistance) => update({ linkDistance })} />
      </Collapsible>
    </div>
  );
}

function Eye({ off }: { off: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
      {off && <path d="M3 3l18 18" />}
    </svg>
  );
}
