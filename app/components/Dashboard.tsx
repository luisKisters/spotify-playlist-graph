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
  type GraphMode,
} from "@/lib/graph";
import { LOOKS, activeLook, type Look } from "@/lib/looks";
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
import LookGlyph from "./LookGlyph";

const GraphView = dynamic(() => import("./GraphView"), { ssr: false });

type Tab = "graph" | "analytics" | "export";
const TABS: { id: Tab; label: string }[] = [
  { id: "analytics", label: "Insights" },
  { id: "graph", label: "Customize" },
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
  const [settling, setSettling] = useState(false);
  // Open by default on desktop; on phones the graph gets the whole screen first.
  const [panelOpen, setPanelOpen] = useState(() => typeof window === "undefined" || window.innerWidth >= 1024);
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
  const { nodeSize, linkThickness, textFade, labelSize, tintLinks } = settings;
  const display = useMemo(
    () => ({ nodeSize, linkThickness, textFade, labelSize, tintLinks }),
    [nodeSize, linkThickness, textFade, labelSize, tintLinks]
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

  const applyLook = (look: Look) => {
    update(look.values);
    setHidden(new Set());
    setFocusCluster(null);
    setSelected(null);
    // A look that keeps the same graph only changes forces; show the result framed.
    requestAnimationFrame(() => graphRef.current?.fit());
  };
  const current = activeLook(settings);

  const counts: Record<GraphMode, number | null> = {
    playlists: library.playlists.size,
    artists: library.artists.size,
    songs: library.tracks.size,
    genres: genres?.ranked.length ?? null,
  };

  return (
    <div className="relative h-full overflow-hidden bg-canvas">
      <div
        className={`absolute inset-x-0 top-24 transition-[right] duration-300 lg:bottom-0 lg:top-0 ${
          panelOpen ? "bottom-[46vh] lg:right-[384px]" : "bottom-0"
        }`}
      >
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
            onSettling={setSettling}
          />
        )}

        {settings.mode === "genres" && !genres?.ranked.length && (
          <div className="pointer-events-none absolute inset-x-0 top-24 text-center text-xs text-zinc-400">
            {genreStatus ?? "Loading genres…"}
          </div>
        )}

        <div className="pointer-events-none absolute bottom-3 left-16 flex h-9 items-center gap-2 text-[11px] text-zinc-500">
          {(settling || genresLoading) && (
            <span className="glass flex items-center gap-2 rounded-full px-3 py-1.5 text-zinc-300">
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />
              {genresLoading ? genreStatus : `Arranging ${graph.order.toLocaleString()} nodes`}
            </span>
          )}
        </div>

        <LooksStrip current={current} onPick={applyLook} />

        {legend.length > 1 && !(panelOpen && tab === "graph") && (
          <ul className="glass scrollbar-thin absolute bottom-[4.75rem] right-3 hidden max-h-[40%] max-w-56 space-y-0.5 overflow-y-auto rounded-xl p-1.5 text-xs md:block">
            {legend.map(({ label, i }) => (
              <li key={i}>
                <button
                  onClick={() => setFocusCluster(focusCluster === i ? null : i)}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1 text-left transition hover:bg-white/5 ${
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

      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 flex flex-wrap items-start gap-2 p-3 lg:flex-nowrap">
        <div className="glass pointer-events-auto flex h-10 shrink-0 items-center gap-2.5 rounded-xl px-3">
          <Logo />
          <span className="hidden font-display text-[19px] leading-none tracking-tight text-white sm:inline">Playlist Graph</span>
          {source !== "spotify" && (
            <span className="rounded-full border border-white/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-zinc-400">
              {source === "demo" ? "Demo" : "File"}
            </span>
          )}
        </div>

        <ViewSwitcher mode={settings.mode} counts={counts} onChange={(mode) => update({ mode })} />

        <div className="pointer-events-auto ml-auto flex min-w-0 flex-1 items-center justify-end gap-2 lg:flex-none">
          <SearchBox query={query} setQuery={setQuery} results={results} onPick={select} />
          <AccountMenu user={user} source={source} onRefresh={onRefresh} onLogout={onLogout} />
          <button
            onClick={() => setPanelOpen(!panelOpen)}
            className={`glass grid h-10 w-10 place-items-center rounded-xl transition hover:text-white ${
              panelOpen ? "text-white" : "text-zinc-400"
            }`}
            title={panelOpen ? "Hide panel" : "Show panel"}
            aria-label={panelOpen ? "Hide panel" : "Show panel"}
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="16" rx="2.5" />
              <path d="M15 4v16" />
            </svg>
          </button>
        </div>
      </header>

      {error && (
        <div className="glass absolute left-1/2 top-16 z-20 max-w-md -translate-x-1/2 rounded-xl px-4 py-2 text-xs text-red-300">
          Couldn't load everything from Spotify: {error}
          {onRefresh && (
            <button onClick={onRefresh} className="ml-2 underline">
              Try again
            </button>
          )}
        </div>
      )}

      {panelOpen && (
        <aside className="glass absolute inset-x-2 bottom-2 z-10 flex h-[calc(46vh-1rem)] flex-col overflow-hidden rounded-2xl lg:inset-x-auto lg:bottom-3 lg:right-3 lg:top-16 lg:h-auto lg:w-[360px]">
          <nav className="flex shrink-0 gap-1 border-b border-line p-1.5" role="tablist">
            {TABS.map((t) => (
              <button
                key={t.id}
                role="tab"
                aria-selected={tab === t.id}
                onClick={() => setTab(t.id)}
                className={`flex-1 rounded-lg px-3 py-1.5 text-xs font-medium transition ${
                  tab === t.id ? "bg-white/[0.08] text-white" : "text-zinc-500 hover:text-zinc-200"
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
  );
}

const MODES: { id: GraphMode; label: string }[] = [
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
  { id: "songs", label: "Songs" },
  { id: "genres", label: "Genres" },
];

function ViewSwitcher({
  mode,
  counts,
  onChange,
}: {
  mode: GraphMode;
  counts: Record<GraphMode, number | null>;
  onChange: (m: GraphMode) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="What to show"
      className="glass pointer-events-auto order-last flex h-10 w-full items-center gap-0.5 rounded-xl p-1 lg:order-none lg:absolute lg:left-1/2 lg:w-auto lg:-translate-x-1/2"
    >
      {MODES.map((m) => (
        <button
          key={m.id}
          role="tab"
          aria-selected={mode === m.id}
          onClick={() => onChange(m.id)}
          className={`flex h-full flex-1 items-center justify-center gap-1.5 rounded-lg px-3 text-xs font-medium transition lg:flex-none ${
            mode === m.id ? "bg-white text-black" : "text-zinc-400 hover:bg-white/5 hover:text-white"
          }`}
        >
          {m.label}
          {counts[m.id] !== null && (
            <span className={`hidden tabular-nums sm:inline ${mode === m.id ? "text-black/50" : "text-zinc-600"}`}>
              {compact(counts[m.id]!)}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

const compact = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n.toLocaleString());

function LooksStrip({ current, onPick }: { current: string | null; onPick: (l: Look) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-3 flex justify-center px-3 md:px-16">
      <div className="glass pointer-events-auto flex max-w-full items-stretch overflow-hidden rounded-2xl">
        <button
          onClick={() => setOpen(!open)}
          className="flex shrink-0 items-center gap-2 border-r border-line px-3 text-left text-zinc-300 transition hover:text-white"
          title={open ? "Hide looks" : "Show looks"}
          aria-expanded={open}
        >
          <span className="font-display text-[17px] italic leading-none">Looks</span>
          <svg viewBox="0 0 16 16" className={`h-3 w-3 transition ${open ? "" : "rotate-180"}`} fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M4 10l4-4 4 4" />
          </svg>
        </button>
        {open && (
          <div className="scrollbar-none flex gap-1 overflow-x-auto p-1.5">
            {LOOKS.map((look) => (
              <button
                key={look.id}
                onClick={() => onPick(look)}
                title={look.blurb}
                className={`group flex shrink-0 items-center gap-2 rounded-xl p-1 pr-3 text-left transition ${
                  current === look.id ? "bg-white/[0.09] ring-1 ring-accent/60" : "hover:bg-white/5"
                }`}
              >
                <LookGlyph id={look.id} className="h-8 w-[52px] rounded-lg ring-1 ring-white/5" />
                <span className="text-xs font-medium text-zinc-300 group-hover:text-white">{look.name}</span>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function AccountMenu({
  user,
  source,
  onRefresh,
  onLogout,
}: {
  user: User | null;
  source: Source;
  onRefresh?: () => void;
  onLogout: () => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const close = (e: MouseEvent) => !ref.current?.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const item = "block w-full rounded-lg px-3 py-2 text-left text-xs text-zinc-300 transition hover:bg-white/5 hover:text-white";
  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen(!open)}
        className="glass grid h-10 w-10 place-items-center overflow-hidden rounded-xl text-zinc-400 hover:text-white"
        aria-label="Account"
        aria-expanded={open}
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="12" cy="9" r="3.5" />
            <path d="M5 20c1.5-3.5 4-5 7-5s5.5 1.5 7 5" />
          </svg>
        )}
      </button>
      {open && (
        <div className="glass absolute right-0 top-12 z-30 w-52 rounded-xl p-1">
          {user && <p className="truncate px-3 pb-1.5 pt-2 text-[11px] text-zinc-500">Signed in as {user.name}</p>}
          {source !== "spotify" ? (
            <a href="/api/auth/login" className={`${item} text-accent`}>
              Connect Spotify
            </a>
          ) : (
            onRefresh && (
              <button onClick={() => (setOpen(false), onRefresh())} className={item}>
                Reload playlists
              </button>
            )
          )}
          <button onClick={onLogout} className={item}>
            {source === "demo" ? "Exit demo" : source === "file" ? "Close file" : "Log out"}
          </button>
        </div>
      )}
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
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    // "/" focuses search, like on GitHub.
    const key = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement)?.closest?.("input, textarea");
      if (e.key === "/" && !typing) {
        e.preventDefault();
        input.current?.focus();
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", key);
    };
  }, []);

  const pick = (id: string) => {
    onPick(id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative min-w-0 flex-1 sm:w-56 sm:flex-none xl:w-64">
      <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-zinc-500" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="6.5" />
        <path d="M16 16l4 4" strokeLinecap="round" />
      </svg>
      {!query && (
        <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-white/10 px-1.5 font-mono text-[10px] text-zinc-500 sm:block">
          /
        </kbd>
      )}
      <input
        ref={input}
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
        placeholder="Search your library"
        className="glass h-10 w-full rounded-xl pl-8 pr-8 text-sm text-white placeholder:text-zinc-500 focus:border-white/20 focus:outline-none"
      />
      {open && results.length > 0 && (
        <ul className="glass scrollbar-thin absolute right-0 top-full z-30 mt-2 max-h-96 w-80 max-w-[90vw] overflow-y-auto rounded-xl p-1">
          {results.map((r) => (
            <li key={r.kind + r.id}>
              <button
                onClick={() => pick(r.id)}
                className="flex w-full items-center gap-3 rounded-lg px-2.5 py-1.5 text-left hover:bg-white/5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-white">{r.label}</span>
                  <span className="block truncate text-[11px] text-zinc-500">{r.sub}</span>
                </span>
                <span className="shrink-0 rounded-full border border-white/10 px-1.5 py-px text-[10px] text-zinc-500">{r.kind}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
