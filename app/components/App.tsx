"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Playlist, PlaylistSummary, User } from "@/lib/types";
import { clearCache, loadCachedPlaylists, saveCachedPlaylists } from "@/lib/cache";
import { demoGenres, makeDemoLibrary } from "@/lib/demo";
import type { LibraryExport } from "@/lib/export";
import { analyze } from "@/lib/analysis";
import Landing from "./Landing";
import Dashboard, { type Source } from "./Dashboard";

type Phase =
  | { name: "checking" }
  | { name: "landing"; error?: string }
  | { name: "loading"; done: number; total: number }
  | { name: "ready" };

const ERRORS: Record<string, string> = {
  access_denied: "You cancelled the Spotify login.",
  state_mismatch: "The login link expired. Please try again.",
  token_exchange_failed: "Spotify didn't accept the login. Please try again.",
  expired: "Your Spotify session expired. Please log in again.",
};

class AuthError extends Error {}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });
  if (res.status === 401) throw new AuthError("expired");
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error || `Request failed (${res.status})`);
  }
  return res.json();
}

export default function App() {
  const [phase, setPhase] = useState<Phase>({ name: "checking" });
  const [user, setUser] = useState<User | null>(null);
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [source, setSource] = useState<Source>("spotify");
  const [presetGenres, setPresetGenres] = useState<Map<string, string[]> | null>(null);
  const demo = source !== "spotify";
  const [loadError, setLoadError] = useState<string | null>(null);

  const startDemo = useCallback(() => {
    const lib = makeDemoLibrary();
    setUser(lib.user);
    setPlaylists(lib.playlists);
    setPresetGenres(demoGenres());
    setSource("demo");
    setPhase({ name: "ready" });
  }, []);

  const openExport = useCallback((data: LibraryExport) => {
    setUser(null);
    setPlaylists(data.playlists);
    setPresetGenres(new Map(Object.entries(data.artistGenres)));
    setSource("file");
    setPhase({ name: "ready" });
  }, []);

  const loadLibrary = useCallback(async (force = false) => {
    setLoadError(null);
    try {
      const [me, summaries, cached] = await Promise.all([
        getJson<User>("/api/me"),
        getJson<PlaylistSummary[]>("/api/playlists"),
        loadCachedPlaylists(),
      ]);
      setUser(me);

      const result: Playlist[] = [];
      const stale: PlaylistSummary[] = [];
      for (const s of summaries) {
        const hit = cached.get(s.id);
        if (!force && hit && hit.snapshot === s.snapshot && s.snapshot) {
          result.push({ ...hit, ...s });
        } else {
          stale.push(s);
        }
      }

      let done = 0;
      setPhase({ name: "loading", done, total: stale.length });
      const queue = [...stale];
      const worker = async () => {
        for (let s = queue.shift(); s; s = queue.shift()) {
          const tracks = await getJson<Playlist["tracks"]>(
            `/api/playlists/${s.id}/items`
          );
          result.push({ ...s, tracks });
          setPhase({ name: "loading", done: ++done, total: stale.length });
        }
      };
      await Promise.all(Array.from({ length: 4 }, worker));

      const order = new Map(summaries.map((s, i) => [s.id, i]));
      result.sort((a, b) => order.get(a.id)! - order.get(b.id)!);
      setPlaylists(result);
      setPhase({ name: "ready" });
      saveCachedPlaylists(result);
    } catch (e) {
      if (e instanceof AuthError) {
        setPhase({ name: "landing", error: ERRORS.expired });
      } else {
        setLoadError(e instanceof Error ? e.message : String(e));
        setPhase({ name: "ready" });
      }
    }
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const error = url.searchParams.get("error");
    if (url.searchParams.has("demo")) {
      startDemo();
      return;
    }
    if (error) {
      window.history.replaceState({}, "", "/");
      setPhase({ name: "landing", error: ERRORS[error] ?? `Login failed (${error}).` });
      return;
    }
    fetch("/api/me", { cache: "no-store" })
      .then((res) => {
        if (res.ok) loadLibrary();
        else setPhase({ name: "landing" });
      })
      .catch(() => setPhase({ name: "landing" }));
  }, [loadLibrary, startDemo]);

  const logout = useCallback(async () => {
    if (!demo) {
      await fetch("/api/auth/logout", { method: "POST" });
      await clearCache();
    }
    window.history.replaceState({}, "", "/");
    setSource("spotify");
    setPresetGenres(null);
    setUser(null);
    setPlaylists([]);
    setPhase({ name: "landing" });
  }, [demo]);

  const library = useMemo(() => analyze(playlists), [playlists]);

  if (phase.name === "checking") {
    return <div className="grid h-full place-items-center text-zinc-500">Loading…</div>;
  }
  if (phase.name === "landing") {
    return <Landing error={phase.error} onDemo={startDemo} />;
  }
  if (phase.name === "loading") {
    const pct = phase.total ? Math.round((phase.done / phase.total) * 100) : 0;
    return (
      <div className="grid h-full place-items-center px-6">
        <div className="w-full max-w-sm text-center">
          <p className="text-lg font-semibold text-white">Reading your playlists</p>
          <p className="mt-1 text-sm text-zinc-400">
            {phase.done} of {phase.total} playlists · only changed playlists are
            fetched next time
          </p>
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${pct}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Dashboard
      library={library}
      user={user}
      source={source}
      presetGenres={presetGenres}
      error={loadError}
      onImport={openExport}
      onRefresh={demo ? undefined : () => loadLibrary(true)}
      onLogout={logout}
    />
  );
}
