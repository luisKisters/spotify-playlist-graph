"use client";

import dynamic from "next/dynamic";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { genreProfile, type Library } from "@/lib/analysis";
import {
  GENRE_PREFIX,
  buildGraph,
  clusterColor,
  genreClusters,
  overlapClusters,
  smartClusters,
  type Clusters,
} from "@/lib/graph";
import { applyFilters } from "@/lib/filter";
import type { LibraryExport } from "@/lib/export";
import { loadGenres } from "@/lib/genres";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type GraphSettings } from "@/lib/settings";
import type { User } from "@/lib/types";
import { Logo } from "./Landing";
import Panel from "./Panel";
import GraphSettingsPanel from "./GraphSettingsPanel";
import ExportPanel from "./ExportPanel";
import type { GraphHandle } from "./GraphView";

const GraphView = dynamic(() => import("./GraphView"), { ssr: false });

type Tab = "graph" | "analytics" | "export";
const TABS: { id: Tab; label: string }[] = [
  { id: "graph", label: "Graph settings" },
  { id: "analytics", label: "Analytics" },
  { id: "export", label: "Export" },
];

export type Source = "spotify" | "demo" | "file";

interface Props {
  library: Library;
  user: User | null;
  source: Source;
  /** Genres that come with the data (demo or an opened export), so no lookup is needed. */
  presetGenres: Map<string, string[]> | null;
  error: string | null;
  onRefresh?: () => void;
  onLogout: () => void;
  onImport: (data: LibraryExport) => void;
}

export default function Dashboard({
  library,
  user,
  source,
  presetGenres,
  error,
  onRefresh,
  onLogout,
  onImport,
}: Props) {
  const [settings, setSettings] = useState<GraphSettings>(DEFAULT_SETTINGS);
  useEffect(() => setSettings(loadSettings()), []);
  const update = (patch: Partial<GraphSettings>) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });

  const [tab, setTab] = useState<Tab>("graph");
  const [panelOpen, setPanelOpen] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [focusCluster, setFocusCluster] = useState<number | null>(null);
  const [hidden, setHidden] = useState<Set<number>>(new Set());
  const [query, setQuery] = useState("");
  const graphRef = useRef<GraphHandle>(null);

  // Cluster indexes mean something else once the grouping changes.
  useEffect(() => {
    setHidden(new Set());
    setFocusCluster(null);
  }, [settings.clusterBy, library]);

  // Genres are looked up lazily, the first time something needs them.
  const wantGenres =
    settings.mode === "genres" ||
    settings.clusterBy === "genre" ||
    settings.clusterBy === "smart" ||
    tab === "export" ||
    /genre:/i.test(settings.filter);
  const [artistGenres, setArtistGenres] = useState<Map<string, string[]> | null>(presetGenres);
  const [genreProgress, setGenreProgress] = useState<{ done: number; total: number } | null>(null);
  const genresStarted = useRef(false);
  useEffect(() => {
    if (presetGenres) {
      setArtistGenres(presetGenres);
      return;
    }
    if (!wantGenres || genresStarted.current) return;
    genresStarted.current = true;
    const controller = new AbortController();
    loadGenres(
      library,
      (genres, done, total) => {
        setArtistGenres(genres);
        setGenreProgress({ done, total });
      },
      controller.signal
    ).finally(() => setGenreProgress((p) => (p ? { ...p, total: p.done } : p)));
    return () => {
      controller.abort();
      genresStarted.current = false;
    };
  }, [wantGenres, presetGenres, library]);

  const genresLoading = !presetGenres && wantGenres && (!genreProgress || genreProgress.done < genreProgress.total);
  // While genres stream in, keep the layout stable; rebuild once they're all here.
  const stableGenres = useStable(artistGenres, genresLoading);

  const genres = useMemo(
    () => (stableGenres ? genreProfile(library, stableGenres) : null),
    [library, stableGenres]
  );
  const clusters: Clusters = useMemo(() => {
    if (settings.clusterBy === "genre" && genres?.ranked.length) return genreClusters(library, genres);
    if (settings.clusterBy === "smart") return smartClusters(library, stableGenres);
    return overlapClusters(library, settings.clusterBy === "artists" ? "artists" : "overlap");
  }, [settings.clusterBy, genres, library, stableGenres]);

  const filter = useDeferredValue(settings.filter);
  const { mode, linksPerNode, minSimilarity, minPlaylists, maxNodes, orphans } = settings;
  const graph = useMemo(() => {
    const g = buildGraph(
      library,
      { ...DEFAULT_SETTINGS, mode, linksPerNode, minSimilarity, minPlaylists, maxNodes },
      clusters,
      genres
    );
    applyFilters(g, library, stableGenres, { query: filter, orphans, hidden });
    return g;
  }, [library, mode, linksPerNode, minSimilarity, minPlaylists, maxNodes, clusters, genres, stableGenres, filter, orphans, hidden]);

  const clusterSizes = useMemo(() => {
    const sizes = new Map<number, number>();
    clusters.of.forEach((c) => sizes.set(c, (sizes.get(c) ?? 0) + 1));
    return sizes;
  }, [clusters]);

  const { centerForce, repelForce, linkForce, linkDistance, clusterForce } = settings;
  const forces = useMemo(
    () => ({ centerForce, repelForce, linkForce, linkDistance, clusterForce }),
    [centerForce, repelForce, linkForce, linkDistance, clusterForce]
  );
  const { nodeSize, linkThickness, textFade, labelSize } = settings;
  const display = useMemo(
    () => ({ nodeSize, linkThickness, textFade, labelSize }),
    [nodeSize, linkThickness, textFade, labelSize]
  );

  const results = useMemo(() => search(library, genres, query), [library, genres, query]);

  // Dim everything except the search hits (and the playlists they live in),
  // the focused cluster, or the playlists of a selection not drawn in this view.
  const highlight = useMemo(() => {
    const ids = new Set<string>();
    const add = (id: string) => {
      ids.add(id);
      library.tracks.get(id)?.playlists.forEach((p) => ids.add(p));
      library.artists.get(id)?.playlists.forEach((_, p) => ids.add(p));
      genres?.byName.get(id.slice(GENRE_PREFIX.length))?.playlists.forEach((_, p) => ids.add(p));
    };
    if (query.trim()) results.forEach((r) => add(r.id));
    else if (focusCluster !== null) {
      graph.forEachNode((node, a) => a.cluster === focusCluster && ids.add(node));
    } else if (selected && !graph.hasNode(selected)) add(selected);
    return ids.size ? ids : null;
  }, [query, results, focusCluster, selected, graph, library, genres]);

  const select = (id: string | null) => {
    setSelected(id);
    setQuery("");
    setFocusCluster(null);
    if (id) {
      setTab("analytics");
      setPanelOpen(true);
    }
  };

  const genreStatus = !wantGenres
    ? null
    : genresLoading
      ? `Looking up genres${genreProgress ? ` ${genreProgress.done}/${genreProgress.total}` : "…"}`
      : genres && genres.ranked.length === 0
        ? "No genre data found"
        : null;

  const legend = clusters.labels
    .map((label, i) => ({ label, i }))
    .filter(({ i }) => clusterSizes.has(i) && !hidden.has(i));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-white">
          <Logo />
          <span className="hidden sm:inline">Playlist Graph</span>
        </div>
        <SearchBox query={query} setQuery={setQuery} results={results} onPick={select} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {source !== "spotify" ? (
            <a href="/api/auth/login" className="px-2 py-1.5 text-xs font-medium text-accent hover:underline">
              Connect Spotify
            </a>
          ) : (
            onRefresh && (
              <button onClick={onRefresh} className="rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white">
                Refresh
              </button>
            )
          )}
          <button
            onClick={onLogout}
            className="flex items-center gap-2 rounded-md px-2 py-1.5 text-xs text-zinc-400 hover:bg-white/5 hover:text-white"
          >
            {user?.image && (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={user.image} alt="" className="h-5 w-5 rounded-full object-cover" />
            )}
            {source === "demo" ? "Exit demo" : source === "file" ? "Close file" : "Log out"}
          </button>
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className="hidden rounded-md p-1.5 text-zinc-400 hover:bg-white/5 hover:text-white lg:block"
            title={panelOpen ? "Hide sidebar" : "Show sidebar"}
            aria-label={panelOpen ? "Hide sidebar" : "Show sidebar"}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="M15 4v16" />
            </svg>
          </button>
        </div>
      </header>

      {error && (
        <div className="border-b border-line px-4 py-2 text-xs text-red-300">
          Couldn't load everything from Spotify: {error}
          {onRefresh && (
            <button onClick={onRefresh} className="ml-2 underline">
              Try again
            </button>
          )}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <div className="relative h-[60vh] shrink-0 lg:h-auto lg:flex-1">
          {library.playlists.size === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-zinc-400">
              No playlists of your own yet. Create one on Spotify, then refresh.
            </div>
          ) : (
            <GraphView
              handle={graphRef}
              graph={graph}
              forces={forces}
              display={display}
              selected={query.trim() || focusCluster !== null ? null : selected}
              highlight={highlight}
              onSelect={select}
            />
          )}
          {settings.mode === "genres" && !genres?.ranked.length && (
            <div className="pointer-events-none absolute inset-x-0 top-4 text-center text-xs text-zinc-400">
              {genreStatus ?? "Loading genres…"}
            </div>
          )}
          {legend.length > 1 && !(panelOpen && tab === "graph") && (
            <ul className="scrollbar-thin absolute bottom-4 right-4 hidden max-h-[45%] max-w-56 space-y-0.5 overflow-y-auto rounded-lg border border-line bg-canvas/85 p-2 text-xs backdrop-blur md:block">
              {legend.map(({ label, i }) => (
                <li key={i}>
                  <button
                    onClick={() => setFocusCluster(focusCluster === i ? null : i)}
                    className={`flex w-full items-center gap-2 rounded px-1.5 py-1 text-left hover:bg-white/5 ${
                      focusCluster !== null && focusCluster !== i ? "opacity-40" : ""
                    }`}
                  >
                    <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: clusterColor(i) }} />
                    <span className="truncate text-zinc-300">{label}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
        {panelOpen && (
          <aside className="flex min-h-0 flex-1 flex-col border-t border-line bg-panel lg:w-[360px] lg:flex-none lg:border-l lg:border-t-0">
            <nav className="flex shrink-0 border-b border-line px-2" role="tablist">
              {TABS.map((t) => (
                <button
                  key={t.id}
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={`-mb-px border-b-2 px-3 py-2.5 text-xs font-medium transition ${
                    tab === t.id
                      ? "border-accent text-white"
                      : "border-transparent text-zinc-500 hover:text-zinc-200"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </nav>
            <div key={tab} className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
              {tab === "graph" && (
                <GraphSettingsPanel
                  settings={settings}
                  update={update}
                  clusters={clusters}
                  clusterSizes={clusterSizes}
                  hidden={hidden}
                  setHidden={setHidden}
                  focusCluster={focusCluster}
                  setFocusCluster={setFocusCluster}
                  onAnimate={() => graphRef.current?.animate()}
                  nodeCount={graph.order}
                  edgeCount={graph.size}
                  status={genreStatus}
                />
              )}
              {tab === "analytics" && (
                <Panel library={library} clusters={clusters} genres={genres} selected={selected} onSelect={select} />
              )}
              {tab === "export" && (
                <ExportPanel
                  library={library}
                  artistGenres={artistGenres}
                  clusters={clusters}
                  genreStatus={genresLoading ? genreStatus : null}
                  exportPng={async (whole) => graphRef.current?.exportPng(whole)}
                  onImport={onImport}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/** Returns `value`, but holds the last settled one while `pending` is true. */
function useStable<T>(value: T, pending: boolean): T | null {
  const last = useRef<T | null>(null);
  if (!pending) last.current = value;
  return last.current;
}

interface Result {
  id: string;
  kind: "playlist" | "artist" | "song" | "genre";
  label: string;
  sub: string;
}

function search(
  lib: Library,
  genres: ReturnType<typeof genreProfile> | null,
  query: string
): Result[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: Result[] = [];
  for (const p of lib.playlists.values())
    if (p.name.toLowerCase().includes(q))
      out.push({ id: p.id, kind: "playlist", label: p.name, sub: `${p.tracks.length} songs` });
  for (const g of genres?.ranked ?? [])
    if (g.name.includes(q))
      out.push({ id: GENRE_PREFIX + g.name, kind: "genre", label: g.name, sub: `${g.tracks} songs` });
  for (const a of lib.artists.values())
    if (a.artist.name.toLowerCase().includes(q))
      out.push({ id: a.artist.id, kind: "artist", label: a.artist.name, sub: `${a.playlists.size} playlists` });
  for (const t of lib.tracks.values())
    if (t.track.name.toLowerCase().includes(q))
      out.push({
        id: t.track.id,
        kind: "song",
        label: t.track.name,
        sub: t.track.artists.map((a) => a.name).join(", "),
      });
  return out.slice(0, 30);
}

function SearchBox({
  query,
  setQuery,
  results,
  onPick,
}: {
  query: string;
  setQuery: (q: string) => void;
  results: Result[];
  onPick: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1 md:mx-auto md:max-w-md">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
          if (e.key === "Enter" && results[0]) pick(results[0].id);
        }}
        placeholder="Search"
        className="w-full rounded-md border border-line bg-raised px-3 py-1.5 text-sm text-white placeholder:text-zinc-500 focus:border-white/25 focus:outline-none"
      />
      {open && results.length > 0 && (
        <ul className="scrollbar-thin absolute left-0 right-0 top-full z-20 mt-1 max-h-80 overflow-y-auto rounded-md border border-line bg-raised p-1 shadow-xl">
          {results.map((r) => (
            <li key={r.kind + r.id}>
              <button
                onClick={() => pick(r.id)}
                className="flex w-full items-baseline gap-3 rounded px-2 py-1.5 text-left hover:bg-white/5"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-white">{r.label}</span>
                <span className="shrink-0 text-xs text-zinc-500">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
