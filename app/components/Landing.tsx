import { PALETTE } from "@/lib/graph";

const FEATURES = [
  "Which playlists overlap, and by how much",
  "Clusters by shared songs or by genre",
  "Songs added twice, or in two versions",
  "Artists and songs that tie playlists together",
];

// Decorative mini-graph for the hero.
const DOTS: [number, number, number, number][] = [
  [60, 70, 16, 0], [140, 40, 10, 0], [120, 120, 12, 0], [220, 90, 18, 1],
  [300, 50, 9, 1], [290, 140, 13, 1], [380, 100, 15, 2], [440, 45, 8, 2],
  [450, 150, 11, 2], [200, 170, 7, 3], [360, 185, 8, 3],
];
const LINKS = [
  [0, 1], [0, 2], [1, 2], [2, 3], [3, 4], [3, 5], [4, 5], [5, 6], [6, 7],
  [6, 8], [7, 8], [2, 9], [9, 5], [5, 10], [10, 8],
];

export default function Landing({ error, onDemo }: { error?: string; onDemo: () => void }) {
  return (
    <main className="mx-auto flex min-h-full max-w-5xl flex-col px-4 py-10 sm:px-8 sm:py-16">
      <div className="flex items-center gap-2 text-sm font-semibold text-white">
        <Logo />
        Playlist Graph
      </div>

      <section className="mt-12 grid items-center gap-10 md:mt-20 md:grid-cols-[1.1fr_1fr]">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            See how your playlists connect
          </h1>
          <p className="mt-4 max-w-md text-base leading-relaxed text-zinc-400">
            Map your Spotify playlists by the songs and artists they share. Spot
            clusters, near-duplicates and the tracks you keep coming back to.
          </p>

          {error && (
            <p className="mt-6 rounded-lg border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-300">
              {error}
            </p>
          )}

          <div className="mt-8 flex flex-wrap gap-3">
            <a
              href="/api/auth/login"
              className="inline-flex items-center gap-2 rounded-md bg-accent px-5 py-2.5 text-sm font-semibold text-black transition hover:bg-accent-strong"
            >
              Connect Spotify
            </a>
            <button
              onClick={onDemo}
              className="rounded-md border border-white/15 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-white/5"
            >
              Try the demo
            </button>
          </div>
          <p className="mt-4 text-xs text-zinc-500">
            Read-only access. Spotify only shares playlists you own or collaborate on.
          </p>
        </div>

        <svg viewBox="0 0 500 220" className="w-full" aria-hidden>
          {LINKS.map(([a, b], i) => (
            <line
              key={i}
              x1={DOTS[a][0]}
              y1={DOTS[a][1]}
              x2={DOTS[b][0]}
              y2={DOTS[b][1]}
              stroke="rgba(255,255,255,0.15)"
              strokeWidth={1.5}
            />
          ))}
          {DOTS.map(([x, y, r, c], i) => (
            <circle key={i} cx={x} cy={y} r={r} fill={PALETTE[c]} opacity={0.9} />
          ))}
        </svg>
      </section>

      <ul className="mt-16 grid gap-x-10 gap-y-3 border-t border-line pt-8 text-sm text-zinc-400 sm:grid-cols-2 md:mt-24">
        {FEATURES.map((f) => (
          <li key={f} className="flex gap-3">
            <span className="mt-2 h-1 w-1 shrink-0 rounded-full bg-zinc-500" />
            {f}
          </li>
        ))}
      </ul>
    </main>
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
