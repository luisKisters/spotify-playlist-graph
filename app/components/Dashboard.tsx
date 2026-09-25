"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import { genreProfile, type Library } from "@/lib/analysis";
import {
  GENRE_PREFIX,
  buildGraph,
  clusterColor,
  genreClusters,
  overlapClusters,
  type ColorBy,
  type Density,
  type GraphMode,
} from "@/lib/graph";
import { demoGenres } from "@/lib/demo";
import { loadGenres } from "@/lib/genres";
import type { User } from "@/lib/types";
import { Logo } from "./Landing";
import Panel from "./Panel";

const GraphView = dynamic(() => import("./GraphView"), { ssr: false });

const MODES: { id: GraphMode; label: string }[] = [
  { id: "playlists", label: "Playlists" },
  { id: "artists", label: "Artists" },
  { id: "songs", label: "Songs" },
  { id: "genres", label: "Genres" },
];
const DENSITY_LABELS = ["Sparse", "Light", "Balanced", "Rich", "Dense"];

interface Props {
  library: Library;
  user: User | null;
  demo: boolean;
  error: string | null;
  onRefresh?: () => void;
  onLogout: () => void;
}

export default function Dashboard({ library, user, demo, error, onRefresh, onLogout }: Props) {
  const [mode, setMode] = useState<GraphMode>("playlists");
  const [density, setDensity] = useState<Density>(3);
  const [colorBy, setColorBy] = useState<ColorBy>("overlap");
  const [selected, setSelected] = useState<string | null>(null);
  const [focusCluster, setFocusCluster] = useState<number | null>(null);
  const [query, setQuery] = useState("");

  // Genres are looked up lazily, the first time a genre feature is used.
  const wantGenres = mode === "genres" || colorBy === "genre";
  const [artistGenres, setArtistGenres] = useState<Map<string, string[]> | null>(null);
  const [genreProgress, setGenreProgress] = useState<{ done: number; total: number } | null>(null);
  const genresStarted = useRef(false);
  useEffect(() => {
    if (!wantGenres || genresStarted.current) return;
    genresStarted.current = true;
    if (demo) {
      setArtistGenres(demoGenres());
      return;
    }
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
  }, [wantGenres, demo, library]);

  const genres = useMemo(
    () => (artistGenres ? genreProfile(library, artistGenres) : null),
    [library, artistGenres]
  );
  const overlap = useMemo(() => overlapClusters(library), [library]);
  const clusters = useMemo(
    () => (colorBy === "genre" && genres?.ranked.length ? genreClusters(library, genres) : overlap),
    [colorBy, genres, library, overlap]
  );
  const graph = useMemo(
    () => buildGraph(library, mode, density, clusters, genres),
    [library, mode, density, clusters, genres]
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
      clusters.of.forEach((c, pid) => c === focusCluster && ids.add(pid));
      if (colorBy === "genre") ids.add(GENRE_PREFIX + clusters.labels[focusCluster]);
    } else if (selected && !graph.hasNode(selected)) add(selected);
    return ids.size ? ids : null;
  }, [query, results, focusCluster, clusters, colorBy, selected, graph, library, genres]);

  const select = (id: string | null) => {
    setSelected(id);
    setQuery("");
    setFocusCluster(null);
  };

  const genresLoading = wantGenres && !demo && (!genreProgress || genreProgress.done < genreProgress.total);
  const genreStatus = !wantGenres
    ? null
    : genresLoading
      ? `Looking up genres${genreProgress ? ` ${genreProgress.done}/${genreProgress.total}` : "…"}`
      : genres && genres.ranked.length === 0
        ? "No genre data found"
        : null;

  const legend = clusters.labels
    .map((label, i) => ({ label, i }))
    .filter(({ i }) => [...clusters.of.values()].includes(i));

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-3 border-b border-line px-4 py-2.5">
        <div className="flex shrink-0 items-center gap-2 text-sm font-semibold text-white">
          <Logo />
          <span className="hidden sm:inline">Playlist Graph</span>
        </div>
        <SearchBox query={query} setQuery={setQuery} results={results} onPick={select} />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          {demo ? (
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
            {demo ? "Exit demo" : "Log out"}
          </button>
        </div>
      </header>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 border-b border-line px-4 py-2 text-xs">
        <Segmented options={MODES} value={mode} onChange={(m) => { setMode(m); setFocusCluster(null); }} />
        <label className="flex items-center gap-2 text-zinc-400">
          Density
          <input
            type="range"
            min={1}
            max={5}
            step={1}
            value={density}
            onChange={(e) => setDensity(Number(e.target.value) as Density)}
            className="w-24 accent-[var(--color-accent)] focus:outline-none"
          />
          <span className="w-14 text-zinc-300">{DENSITY_LABELS[density - 1]}</span>
        </label>
        <div className="flex items-center gap-2 text-zinc-400">
          Color by
          <Segmented
            options={[
              { id: "overlap" as ColorBy, label: "Overlap" },
              { id: "genre" as ColorBy, label: "Genre" },
            ]}
            value={colorBy}
            onChange={(c) => { setColorBy(c); setFocusCluster(null); }}
          />
        </div>
        {genreStatus && <span className="text-zinc-500">{genreStatus}</span>}
      </div>

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
        <div className="relative h-[55vh] shrink-0 lg:h-auto lg:flex-1">
          {library.playlists.size === 0 ? (
            <div className="grid h-full place-items-center px-6 text-center text-sm text-zinc-400">
              No playlists of your own yet. Create one on Spotify, then refresh.
            </div>
          ) : (
            <GraphView
              graph={graph}
              selected={query.trim() || focusCluster !== null ? null : selected}
              highlight={highlight}
              onSelect={select}
            />
          )}
          {mode === "genres" && !genres?.ranked.length && (
            <div className="pointer-events-none absolute inset-x-0 top-4 text-center text-xs text-zinc-400">
              {genreStatus ?? "Loading genres…"}
            </div>
          )}
          {legend.length > 1 && (
            <ul className="absolute bottom-4 right-4 hidden max-w-56 space-y-0.5 rounded-lg border border-line bg-canvas/85 p-2 text-xs backdrop-blur md:block">
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
        <aside className="scrollbar-thin min-h-0 flex-1 overflow-y-auto border-t border-line lg:w-[380px] lg:flex-none lg:border-l lg:border-t-0">
          <Panel
            library={library}
            clusters={clusters}
            genres={genres}
            selected={selected}
            onSelect={select}
          />
        </aside>
      </div>
    </div>
  );
}

function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { id: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="flex rounded-md bg-raised p-0.5">
      {options.map((o) => (
        <button
          key={o.id}
          onClick={() => onChange(o.id)}
          className={`rounded px-2.5 py-1 font-medium transition ${
            value === o.id ? "bg-white/10 text-white" : "text-zinc-500 hover:text-zinc-200"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
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
