"use client";

import { useMemo, useState } from "react";
import {
  formatDuration,
  sharedTracksBetween,
  similarPlaylists,
  topArtists,
  type Library,
} from "@/lib/analysis";
import { clusterColor } from "@/lib/graph";
import type { Playlist, Track } from "@/lib/types";

interface Props {
  library: Library;
  clusters: Map<string, number>;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

export default function Panel({ library, clusters, selected, onSelect }: Props) {
  const ctx = { library, clusters, onSelect };
  if (selected && library.playlists.has(selected))
    return <PlaylistDetail key={selected} id={selected} {...ctx} />;
  if (selected && library.artists.has(selected))
    return <ArtistDetail id={selected} {...ctx} />;
  if (selected && library.tracks.has(selected))
    return <TrackDetail id={selected} {...ctx} />;
  return <Overview {...ctx} />;
}

type Ctx = Omit<Props, "selected">;

/* ---------- building blocks ---------- */

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-line px-5 py-5 last:border-b-0">
      <h3 className="text-xs font-semibold uppercase tracking-wider text-zinc-400">{title}</h3>
      {hint && <p className="mt-1 text-xs text-zinc-500">{hint}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Row({
  onClick,
  children,
  right,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-white/5"
    >
      <span className="min-w-0 flex-1">{children}</span>
      {right && <span className="shrink-0 text-xs tabular-nums text-zinc-400">{right}</span>}
    </button>
  );
}

function Bar({ value, color = "#1ed760" }: { value: number; color?: string }) {
  return (
    <span className="mt-1 block h-1 overflow-hidden rounded-full bg-white/5">
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.max(3, Math.min(100, value * 100))}%`, background: color }}
      />
    </span>
  );
}

function Cover({ playlist, color, size = 56 }: { playlist: Playlist; color: string; size?: number }) {
  if (playlist.image)
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={playlist.image}
        alt=""
        width={size}
        height={size}
        className="shrink-0 rounded-lg object-cover"
        style={{ width: size, height: size }}
      />
    );
  return (
    <span
      className="grid shrink-0 place-items-center rounded-lg text-lg font-semibold text-black/70"
      style={{ width: size, height: size, background: `linear-gradient(135deg, ${color}, ${color}55)` }}
    >
      {playlist.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-2 w-2 shrink-0 rounded-full" style={{ background: color }} />;
}

function TrackRow({ track, onSelect, right }: { track: Track; onSelect: Ctx["onSelect"]; right?: React.ReactNode }) {
  return (
    <Row onClick={() => onSelect(track.id)} right={right}>
      <span className="flex items-center gap-2.5">
        {track.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={track.image} alt="" className="h-8 w-8 shrink-0 rounded object-cover" />
        ) : (
          <span className="h-8 w-8 shrink-0 rounded bg-white/5" />
        )}
        <span className="min-w-0">
          <span className="block truncate text-sm text-white">{track.name}</span>
          <span className="block truncate text-xs text-zinc-500">
            {track.artists.map((a) => a.name).join(", ")}
          </span>
        </span>
      </span>
    </Row>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-xl bg-raised px-3 py-3">
      <div className="text-xl font-semibold tabular-nums text-white">{value}</div>
      <div className="text-xs text-zinc-500">{label}</div>
    </div>
  );
}

function BackButton({ onSelect }: { onSelect: Ctx["onSelect"] }) {
  return (
    <button
      onClick={() => onSelect(null)}
      className="px-5 pt-4 text-xs text-zinc-400 transition hover:text-white"
    >
      ← Overview
    </button>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/* ---------- overview ---------- */

function Overview({ library, clusters, onSelect }: Ctx) {
  const stats = useMemo(() => {
    const multi = [...library.tracks.values()].filter((t) => t.playlists.length > 1);
    const totalMs = [...library.tracks.values()].reduce((s, t) => s + t.track.duration, 0);
    return { multi: multi.length, totalMs };
  }, [library]);

  const pairs = useMemo(
    () =>
      [...library.pairs.values()]
        .filter((p) => p.sharedTracks > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 6),
    [library]
  );

  const artists = useMemo(
    () =>
      [...library.artists.values()]
        .sort((a, b) => b.playlists.size - a.playlists.size || b.trackIds.size - a.trackIds.size)
        .slice(0, 8),
    [library]
  );

  const songs = useMemo(
    () =>
      [...library.tracks.values()]
        .filter((t) => t.playlists.length > 1)
        .sort((a, b) => b.playlists.length - a.playlists.length)
        .slice(0, 8),
    [library]
  );

  const clusterList = useMemo(() => {
    const groups = new Map<number, Playlist[]>();
    for (const p of library.playlists.values()) {
      const c = clusters.get(p.id) ?? 0;
      groups.set(c, [...(groups.get(c) ?? []), p]);
    }
    return [...groups.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([c, ps]) => ({ c, playlists: ps.sort((a, b) => b.tracks.length - a.tracks.length) }));
  }, [library, clusters]);

  const dupes = library.duplicates;
  const playlistCount = library.playlists.size;
  const name = (id: string) => library.playlists.get(id)?.name ?? "";

  return (
    <div>
      <Section title="Your library">
        <div className="grid grid-cols-2 gap-2">
          <Stat label="playlists" value={playlistCount} />
          <Stat label="unique songs" value={library.tracks.size} />
          <Stat label="artists" value={library.artists.size} />
          <Stat label="songs in 2+ playlists" value={stats.multi} />
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          {formatDuration(stats.totalMs)} of unique music.
        </p>
      </Section>

      {clusterList.length > 1 && (
        <Section title="Taste clusters" hint="Playlists grouped by what they share. Colours match the graph.">
          <ul className="space-y-2.5">
            {clusterList.map(({ c, playlists }) => (
              <li key={c} className="flex gap-2.5">
                <span className="mt-1.5">
                  <Dot color={clusterColor(c)} />
                </span>
                <span className="flex flex-wrap gap-x-1.5 gap-y-0.5 text-sm">
                  {playlists.slice(0, 6).map((p, i) => (
                    <button key={p.id} onClick={() => onSelect(p.id)} className="text-zinc-200 hover:text-white hover:underline">
                      {p.name}
                      {i < Math.min(playlists.length, 6) - 1 && <span className="text-zinc-600">,</span>}
                    </button>
                  ))}
                  {playlists.length > 6 && <span className="text-zinc-500">+{playlists.length - 6} more</span>}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      )}

      {pairs.length > 0 && (
        <Section title="Most alike" hint="Candidates for merging, or proof you have a type.">
          {pairs.map((p) => (
            <Row key={p.a + p.b} onClick={() => onSelect(p.a)} right={pct(p.score)}>
              <span className="block truncate text-sm text-white">
                {name(p.a)} <span className="text-zinc-500">&amp;</span> {name(p.b)}
              </span>
              <span className="block text-xs text-zinc-500">
                {plural(p.sharedTracks, "shared song")} · {plural(p.sharedArtists, "shared artist")}
              </span>
            </Row>
          ))}
        </Section>
      )}

      {artists.length > 0 && (
        <Section title="Artists everywhere" hint="Artists that show up across the most playlists.">
          {artists.map((a) => (
            <Row
              key={a.artist.id}
              onClick={() => onSelect(a.artist.id)}
              right={`${a.playlists.size}/${playlistCount}`}
            >
              <span className="block truncate text-sm text-white">{a.artist.name}</span>
              <Bar value={a.playlists.size / playlistCount} />
            </Row>
          ))}
        </Section>
      )}

      {songs.length > 0 && (
        <Section title="Songs you keep adding">
          {songs.map((t) => (
            <TrackRow
              key={t.track.id}
              track={t.track}
              onSelect={onSelect}
              right={`${t.playlists.length} playlists`}
            />
          ))}
        </Section>
      )}

      <Section
        title="Duplicates"
        hint="The same song twice, or two versions of it, inside one playlist."
      >
        {dupes.length === 0 ? (
          <p className="text-sm text-zinc-400">No duplicates found. Tidy!</p>
        ) : (
          <DuplicateList library={library} dupes={dupes} onSelect={onSelect} showPlaylist />
        )}
      </Section>
    </div>
  );
}

function DuplicateList({
  library,
  dupes,
  onSelect,
  showPlaylist,
}: {
  library: Library;
  dupes: Library["duplicates"];
  onSelect: Ctx["onSelect"];
  showPlaylist?: boolean;
}) {
  const [all, setAll] = useState(false);
  const shown = all ? dupes : dupes.slice(0, 6);
  return (
    <>
      {shown.map((d) => (
        <Row
          key={d.playlistId + d.track.id + d.kind}
          onClick={() => onSelect(showPlaylist ? d.playlistId : d.track.id)}
          right={d.kind === "exact" ? `${d.count}×` : `${d.count} versions`}
        >
          <span className="block truncate text-sm text-white">{d.track.name}</span>
          <span className="block truncate text-xs text-zinc-500">
            {showPlaylist ? `in ${library.playlists.get(d.playlistId)?.name}` : d.track.artists[0]?.name}
          </span>
        </Row>
      ))}
      {dupes.length > 6 && (
        <button onClick={() => setAll(!all)} className="mt-2 text-xs text-zinc-400 hover:text-white">
          {all ? "Show less" : `Show all ${dupes.length}`}
        </button>
      )}
    </>
  );
}

/* ---------- playlist ---------- */

function PlaylistDetail({ id, library, clusters, onSelect }: Ctx & { id: string }) {
  const playlist = library.playlists.get(id)!;
  const color = clusterColor(clusters.get(id) ?? 0);
  const similar = useMemo(() => similarPlaylists(library, id), [library, id]);
  const artists = useMemo(() => topArtists(library, id), [library, id]);
  const [compare, setCompare] = useState<string | null>(similar[0]?.other ?? null);
  const shared = useMemo(
    () => (compare ? sharedTracksBetween(library, id, compare) : []),
    [library, id, compare]
  );

  const unique = useMemo(() => {
    const ids = new Set(playlist.tracks.map((t) => t.id));
    return [...ids].filter((t) => library.tracks.get(t)?.playlists.length === 1).length;
  }, [library, playlist]);
  const uniqueTotal = new Set(playlist.tracks.map((t) => t.id)).size;
  const dupes = library.duplicates.filter((d) => d.playlistId === id);
  const duration = playlist.tracks.reduce((s, t) => s + t.duration, 0);
  const maxArtist = artists[0]?.count ?? 1;

  return (
    <div>
      <BackButton onSelect={onSelect} />
      <div className="flex items-center gap-4 px-5 pb-5 pt-3">
        <Cover playlist={playlist} color={color} size={72} />
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-zinc-500">
            <Dot color={color} /> Playlist
          </p>
          <h2 className="truncate text-lg font-semibold text-white">{playlist.name}</h2>
          <p className="text-xs text-zinc-400">
            {plural(playlist.tracks.length, "song")} · {formatDuration(duration)}
          </p>
          <a
            href={playlist.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
          >
            Open in Spotify ↗
          </a>
        </div>
      </div>

      <Section title="What makes it unique">
        <p className="text-sm text-zinc-300">
          <span className="font-semibold text-white">{pct(uniqueTotal ? unique / uniqueTotal : 0)}</span> of its
          songs ({unique}) aren't in any of your other playlists.
        </p>
        <Bar value={uniqueTotal ? unique / uniqueTotal : 0} color={color} />
      </Section>

      {similar.length > 0 && (
        <Section title="Closest playlists" hint="Pick one to see the songs they share.">
          {similar.map((s) => {
            const other = library.playlists.get(s.other)!;
            const active = compare === s.other;
            return (
              <Row key={s.other} onClick={() => setCompare(active ? null : s.other)} right={pct(s.score)}>
                <span className={`flex items-center gap-2 text-sm ${active ? "text-accent" : "text-white"}`}>
                  <Dot color={clusterColor(clusters.get(s.other) ?? 0)} />
                  <span className="truncate">{other.name}</span>
                </span>
                <span className="block pl-4 text-xs text-zinc-500">
                  {plural(s.sharedTracks, "song")} · {plural(s.sharedArtists, "artist")} in common
                </span>
              </Row>
            );
          })}
          {compare && (
            <div className="mt-3 rounded-xl bg-raised p-3">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="truncate text-xs text-zinc-400">
                  Shared with <span className="text-white">{library.playlists.get(compare)?.name}</span>
                </p>
                <button
                  onClick={() => onSelect(compare)}
                  className="shrink-0 text-xs text-zinc-400 hover:text-white"
                >
                  Open →
                </button>
              </div>
              {shared.length === 0 ? (
                <p className="text-sm text-zinc-500">No identical songs, only shared artists.</p>
              ) : (
                <div className="scrollbar-thin max-h-72 overflow-y-auto pr-1">
                  {shared.map((t) => (
                    <TrackRow key={t.id} track={t} onSelect={onSelect} />
                  ))}
                </div>
              )}
            </div>
          )}
        </Section>
      )}

      {artists.length > 0 && (
        <Section title="Top artists">
          {artists.map(({ artist, count }) => (
            <Row key={artist.id} onClick={() => onSelect(artist.id)} right={count}>
              <span className="block truncate text-sm text-white">{artist.name}</span>
              <Bar value={count / maxArtist} color={color} />
            </Row>
          ))}
        </Section>
      )}

      {dupes.length > 0 && (
        <Section title="Duplicates in this playlist">
          <DuplicateList library={library} dupes={dupes} onSelect={onSelect} />
        </Section>
      )}
    </div>
  );
}

/* ---------- artist ---------- */

function ArtistDetail({ id, library, clusters, onSelect }: Ctx & { id: string }) {
  const info = library.artists.get(id)!;
  const playlists = [...info.playlists.entries()].sort((a, b) => b[1] - a[1]);
  const max = playlists[0]?.[1] ?? 1;
  const tracks = [...info.trackIds]
    .map((t) => library.tracks.get(t)!)
    .sort((a, b) => b.playlists.length - a.playlists.length);

  return (
    <div>
      <BackButton onSelect={onSelect} />
      <div className="px-5 pb-5 pt-3">
        <p className="text-[11px] uppercase tracking-wider text-zinc-500">Artist</p>
        <h2 className="text-lg font-semibold text-white">{info.artist.name}</h2>
        <p className="text-xs text-zinc-400">
          {plural(tracks.length, "song")} across {plural(playlists.length, "playlist")}
        </p>
        <a
          href={`https://open.spotify.com/artist/${id}`}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
        >
          Open in Spotify ↗
        </a>
      </div>
      <Section title="In playlists">
        {playlists.map(([pid, count]) => (
          <Row key={pid} onClick={() => onSelect(pid)} right={count}>
            <span className="flex items-center gap-2 text-sm text-white">
              <Dot color={clusterColor(clusters.get(pid) ?? 0)} />
              <span className="truncate">{library.playlists.get(pid)?.name}</span>
            </span>
            <Bar value={count / max} color={clusterColor(clusters.get(pid) ?? 0)} />
          </Row>
        ))}
      </Section>
      <Section title="Songs">
        {tracks.map((t) => (
          <TrackRow
            key={t.track.id}
            track={t.track}
            onSelect={onSelect}
            right={t.playlists.length > 1 ? `${t.playlists.length} playlists` : undefined}
          />
        ))}
      </Section>
    </div>
  );
}

/* ---------- track ---------- */

function TrackDetail({ id, library, clusters, onSelect }: Ctx & { id: string }) {
  const info = library.tracks.get(id)!;
  const t = info.track;
  return (
    <div>
      <BackButton onSelect={onSelect} />
      <div className="flex items-center gap-4 px-5 pb-5 pt-3">
        {t.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={t.image} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />
        ) : (
          <span className="h-16 w-16 shrink-0 rounded-lg bg-white/5" />
        )}
        <div className="min-w-0">
          <p className="text-[11px] uppercase tracking-wider text-zinc-500">Song</p>
          <h2 className="truncate text-lg font-semibold text-white">{t.name}</h2>
          <p className="truncate text-xs text-zinc-400">{t.album}</p>
          <a
            href={t.url}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-xs font-medium text-accent hover:underline"
          >
            Play in Spotify ↗
          </a>
        </div>
      </div>
      <Section title="By">
        {t.artists.map((a) => (
          <Row key={a.id} onClick={() => onSelect(a.id)}>
            <span className="text-sm text-white">{a.name}</span>
          </Row>
        ))}
      </Section>
      <Section title={`In ${plural(info.playlists.length, "playlist")}`}>
        {info.playlists.map((pid) => (
          <Row key={pid} onClick={() => onSelect(pid)}>
            <span className="flex items-center gap-2 text-sm text-white">
              <Dot color={clusterColor(clusters.get(pid) ?? 0)} />
              <span className="truncate">{library.playlists.get(pid)?.name}</span>
            </span>
          </Row>
        ))}
      </Section>
    </div>
  );
}
