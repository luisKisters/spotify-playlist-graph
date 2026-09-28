"use client";

import dynamic from "next/dynamic";
import { useRef, useState } from "react";
import { readExport, type LibraryExport } from "@/lib/export";
import { LOOKS } from "@/lib/looks";
import { DEFAULT_SETTINGS, saveSettings } from "@/lib/settings";
import LookGlyph from "./LookGlyph";

const HeroGraph = dynamic(() => import("./HeroGraph"), { ssr: false });

const FEATURES: [string, string][] = [
  ["Islands of taste", "Playlists grouped by the rare artists and niche genres they share, not just by overlap."],
  ["Every song at once", "Thousands of songs laid out live, each orbiting the playlists it lives in."],
  ["Bridges and doubles", "The songs that tie scenes together, and the ones you added twice."],
];

interface Props {
  error?: string;
  onDemo: () => void;
  onOpen: (data: LibraryExport) => void;
}

export default function Landing({ error, onDemo, onOpen }: Props) {
  const file = useRef<HTMLInputElement>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  return (
    <main className="relative min-h-full overflow-x-hidden">
      <section className="relative flex min-h-[100svh] flex-col">
        <HeroGraph className="fade-in absolute inset-0 h-full w-full opacity-55 lg:opacity-100" />
        <div className="pointer-events-none absolute inset-0 bg-gradient-to-r from-canvas via-canvas/70 to-transparent lg:via-canvas/40" />
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-40 bg-gradient-to-t from-canvas to-transparent" />

        <nav className="rise relative z-10 mx-auto flex w-full max-w-6xl items-center gap-2.5 px-5 pt-6 sm:px-8">
          <Logo />
          <span className="font-display text-xl tracking-tight text-white">Playlist Graph</span>
          <a
            href="https://github.com/luisKisters/spotify-playlist-graph"
            target="_blank"
            rel="noreferrer"
            className="ml-auto text-xs text-zinc-500 transition hover:text-white"
          >
            GitHub
          </a>
        </nav>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center px-5 py-16 sm:px-8">
          <p className="rise text-xs font-medium uppercase tracking-[0.2em] text-accent" style={{ animationDelay: "80ms" }}>
            For Spotify
          </p>
          <h1
            className="rise mt-4 max-w-xl font-display text-[3.4rem] leading-[0.95] tracking-tight text-white sm:text-7xl"
            style={{ animationDelay: "160ms" }}
          >
            Your taste,
            <br />
            <em className="text-zinc-400">mapped.</em>
          </h1>
          <p className="rise mt-6 max-w-md text-[15px] leading-relaxed text-zinc-400" style={{ animationDelay: "260ms" }}>
            Every playlist and every song you&apos;ve saved, drawn as one living graph. See the scenes
            your library falls into, what connects them, and what only lives in one place.
          </p>

          {(error || fileError) && (
            <p className="rise mt-6 max-w-md rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error ?? fileError}
            </p>
          )}

          <div className="rise mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: "360ms" }}>
            <a
              href="/api/auth/login"
              className="inline-flex h-11 items-center gap-2.5 rounded-full bg-accent pl-4 pr-5 text-sm font-semibold text-black shadow-[0_0_40px_-8px_rgba(30,215,96,0.6)] transition hover:bg-accent-strong"
            >
              <SpotifyMark />
              Connect Spotify
            </a>
            <button
              onClick={onDemo}
              className="h-11 rounded-full border border-white/15 bg-white/[0.03] px-5 text-sm font-semibold text-white backdrop-blur transition hover:border-white/30 hover:bg-white/[0.07]"
            >
              Explore the demo
            </button>
          </div>
          <p className="rise mt-5 text-xs text-zinc-500" style={{ animationDelay: "440ms" }}>
            Read-only access ·{" "}
            <button onClick={() => file.current?.click()} className="text-zinc-300 underline decoration-white/20 underline-offset-4 hover:decoration-white">
              open an export
            </button>{" "}
            instead
          </p>
          <input
            ref={file}
            type="file"
            accept=".json,application/json"
            className="hidden"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (!f) return;
              try {
                onOpen(await readExport(f));
              } catch (err) {
                setFileError(err instanceof Error ? err.message : String(err));
              }
            }}
          />
        </div>

        <ul className="rise relative z-10 mx-auto grid w-full max-w-6xl gap-6 px-5 pb-10 sm:grid-cols-3 sm:px-8" style={{ animationDelay: "560ms" }}>
          {FEATURES.map(([title, body], i) => (
            <li key={title} className="border-t border-white/10 pt-4">
              <p className="flex items-baseline gap-3 text-sm font-medium text-zinc-100">
                <span className="font-mono text-[11px] text-zinc-600">0{i + 1}</span>
                {title}
              </p>
              <p className="mt-1.5 pl-7 text-[13px] leading-relaxed text-zinc-500">{body}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-6xl px-5 pb-24 pt-10 sm:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h2 className="font-display text-4xl tracking-tight text-white">
            Seven ways <em className="text-zinc-400">to look</em>
          </h2>
          <p className="max-w-sm text-sm text-zinc-500">
            One click each, from a calm constellation of playlists to a galaxy of every song. Tune any
            of them from there.
          </p>
        </div>
        <ul className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {LOOKS.map((look) => (
            <li key={look.id}>
              <button
                onClick={() => {
                  saveSettings({ ...DEFAULT_SETTINGS, ...look.values });
                  onDemo();
                }}
                title={`Open the demo as ${look.name}`}
                className="group h-full w-full rounded-2xl border border-white/[0.07] bg-white/[0.02] p-2 text-left transition hover:-translate-y-0.5 hover:border-white/15 hover:bg-white/[0.04]"
              >
                <LookGlyph id={look.id} className="aspect-[8/5] w-full rounded-xl transition group-hover:brightness-125" />
                <p className="mt-3 px-1.5 text-sm font-medium text-zinc-100">{look.name}</p>
                <p className="mb-1.5 mt-0.5 px-1.5 text-xs leading-snug text-zinc-500">{look.blurb}</p>
              </button>
            </li>
          ))}
          <li className="col-span-2 flex flex-col justify-between rounded-2xl border border-accent/25 bg-accent/[0.04] p-4 sm:col-span-1">
            <p className="text-sm text-zinc-300">Read-only: it can see your playlists, never change them. Your library is cached in your own browser.</p>
            <button onClick={onDemo} className="mt-4 self-start text-sm font-medium text-accent hover:underline">
              Try it on demo data →
            </button>
          </li>
        </ul>
      </section>

      <footer className="border-t border-white/5 px-5 py-6 text-center text-xs text-zinc-600">
        Playlist Graph · not affiliated with Spotify
      </footer>
    </main>
  );
}

function SpotifyMark() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
      <circle cx="12" cy="12" r="11" fill="#000" fillOpacity=".85" />
      <path
        d="M7 9.3c3.4-1 7.2-.7 10.2 1M7.6 12.4c2.8-.8 5.9-.5 8.4.9M8.2 15.3c2.2-.6 4.5-.4 6.4.7"
        stroke="#1ed760"
        strokeWidth="1.6"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}

export function Logo() {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
      <line x1="6" y1="7" x2="17" y2="6" stroke="#1ed760" strokeWidth="1.5" opacity=".6" />
      <line x1="6" y1="7" x2="12" y2="18" stroke="#1ed760" strokeWidth="1.5" opacity=".6" />
      <line x1="17" y1="6" x2="12" y2="18" stroke="#1ed760" strokeWidth="1.5" opacity=".6" />
      <circle cx="6" cy="7" r="3.2" fill="#1ed760" />
      <circle cx="17" cy="6" r="2.4" fill="#4cc9f0" />
      <circle cx="12" cy="18" r="2.8" fill="#f72585" />
    </svg>
  );
}
