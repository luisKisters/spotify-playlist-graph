"use client";

import dynamic from "next/dynamic";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Library } from "@/lib/analysis";
import { buildGraph, playlistClusters, type GraphMode } from "@/lib/graph";
import type { User } from "@/lib/types";
import { Logo } from "./Landing";
import Panel from "./Panel";

const GraphView = dynamic(() => import("./GraphView"), { ssr: false });

const MODES: { id: GraphMode; label: string; hint: string }[] = [
  { id: "playlists", label: "Playlists", hint: "Linked by shared songs and artists" },
  { id: "artists", label: "Artists", hint: "Artists that appear in 2+ playlists" },
  { id: "songs", label: "Shared songs", hint: "Songs that appear in 2+ playlists" },
];

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
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const clusters = useMemo(() => playlistClusters(library), [library]);
  const graph = useMemo(() => buildGraph(library, mode, clusters), [library, mode, clusters]);

  const results = useMemo(() => search(library, query), [library, query]);

  // Dim everything except the search hits (and the playlists they live in),
  // or the playlists of a selected song/artist that isn't drawn in this view.
  const highlight = useMemo(() => {
    const ids = new Set<string>();
    const add = (id: string) => {
      ids.add(id);
      library.tracks.get(id)?.playlists.forEach((p) => ids.add(p));
      library.artists.get(id)?.playlists.forEach((_, p) => ids.add(p));
    };
    if (query.trim()) results.forEach((r) => add(r.id));
    else if (selected && !graph.hasNode(selected)) add(selected);
    return ids.size ? ids : null;
  }, [query, results, selected, graph, library]);

  const select = (id: string | null) => {
    setSelected(id);
    setQuery("");
  };

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-panel px-4 py-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-white">
          <Logo />
          <span className="hidden sm:inline">Playlist Graph</span>
          {demo && (
            <span className="rounded-full bg-accent/15 px-2 py-0.5 text-[11px] font-medium text-accent">
              Demo
            </span>
          )}
        </div>

        <nav className="order-last flex w-full rounded-full bg-raised p-1 md:order-none md:w-auto">
          {MODES.map((m) => (
            <button
              key={m.id}
              title={m.hint}
              onClick={() => setMode(m.id)}
              className={`flex-1 rounded-full px-3.5 py-1.5 text-xs font-medium transition md:flex-none ${
                mode === m.id ? "bg-white text-black" : "text-zinc-400 hover:text-white"
              }`}
            >
              {m.label}
            </button>
          ))}
        </nav>

        <SearchBox query={query} setQuery={setQuery} results={results} onPick={select} />

        <UserMenu user={user} demo={demo} onRefresh={onRefresh} onLogout={onLogout} />
      </header>

      {error && (
        <div className="border-b border-red-500/30 bg-red-500/10 px-4 py-2 text-sm text-red-300">
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
            <div className="grid h-full place-items-center px-6 text-center text-zinc-400">
              No playlists of your own yet. Create one on Spotify, then hit Refresh.
            </div>
          ) : (
            <GraphView
              graph={graph}
              selected={query.trim() ? null : selected}
              highlight={highlight}
              onSelect={setSelected}
            />
          )}
          <p className="pointer-events-none absolute right-4 top-3 hidden text-xs text-zinc-500 sm:block">
            {MODES.find((m) => m.id === mode)!.hint} · click a node for details
          </p>
        </div>
        <aside className="scrollbar-thin min-h-0 flex-1 overflow-y-auto border-t border-line bg-panel lg:w-[400px] lg:flex-none lg:border-l lg:border-t-0">
          <Panel library={library} clusters={clusters} selected={selected} onSelect={select} />
        </aside>
      </div>
    </div>
  );
}

interface Result {
  id: string;
  kind: "playlist" | "artist" | "track";
  label: string;
  sub: string;
}

function search(lib: Library, query: string): Result[] {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return [];
  const out: Result[] = [];
  for (const p of lib.playlists.values())
    if (p.name.toLowerCase().includes(q))
      out.push({ id: p.id, kind: "playlist", label: p.name, sub: `${p.tracks.length} songs` });
  for (const a of lib.artists.values())
    if (a.artist.name.toLowerCase().includes(q))
      out.push({
        id: a.artist.id,
        kind: "artist",
        label: a.artist.name,
        sub: `in ${a.playlists.size} playlist${a.playlists.size === 1 ? "" : "s"}`,
      });
  for (const t of lib.tracks.values())
    if (t.track.name.toLowerCase().includes(q))
      out.push({
        id: t.track.id,
        kind: "track",
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

  return (
    <div ref={ref} className="relative order-last w-full md:order-none md:w-auto md:max-w-sm md:flex-1">
      <input
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={(e) => {
          if (e.key === "Escape") setQuery("");
          if (e.key === "Enter" && results[0]) {
            onPick(results[0].id);
            setOpen(false);
          }
        }}
        placeholder="Search playlists, artists, songs"
        className="w-full rounded-full border border-line bg-raised px-4 py-2 text-sm text-white placeholder:text-zinc-500 focus:border-accent/60 focus:outline-none"
      />
      {open && results.length > 0 && (
        <ul className="scrollbar-thin absolute left-0 right-0 top-full z-20 mt-2 max-h-80 overflow-y-auto rounded-xl border border-line bg-raised p-1 shadow-2xl">
          {results.map((r) => (
            <li key={r.kind + r.id}>
              <button
                onClick={() => {
                  onPick(r.id);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-white/5"
              >
                <span className="w-14 shrink-0 text-[10px] uppercase tracking-wide text-zinc-500">
                  {r.kind === "track" ? "song" : r.kind}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm text-white">{r.label}</span>
                  <span className="block truncate text-xs text-zinc-500">{r.sub}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function UserMenu({
  user,
  demo,
  onRefresh,
  onLogout,
}: {
  user: User | null;
  demo: boolean;
  onRefresh?: () => void;
  onLogout: () => void;
}) {
  return (
    <div className="ml-auto flex items-center gap-2">
      {onRefresh && (
        <button
          onClick={onRefresh}
          title="Reload everything from Spotify"
          className="rounded-full border border-line px-3 py-1.5 text-xs text-zinc-300 transition hover:bg-white/5 hover:text-white"
        >
          Refresh
        </button>
      )}
      {demo ? (
        <a
          href="/api/auth/login"
          className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-black hover:bg-accent-strong"
        >
          <span className="sm:hidden">Connect</span>
          <span className="hidden sm:inline">Use my Spotify</span>
        </a>
      ) : null}
      <button
        onClick={onLogout}
        title={demo ? "Leave demo" : "Log out"}
        className="flex items-center gap-2 rounded-full border border-line py-1 pl-1 pr-3 text-xs text-zinc-300 transition hover:bg-white/5 hover:text-white"
      >
        {user?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={user.image} alt="" className="h-6 w-6 rounded-full object-cover" />
        ) : (
          <span className="grid h-6 w-6 place-items-center rounded-full bg-white/10 text-[11px] font-semibold">
            {user?.name?.[0]?.toUpperCase() ?? "?"}
          </span>
        )}
        {demo ? "Exit" : "Log out"}
      </button>
    </div>
  );
}
