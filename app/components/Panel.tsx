"use client";

import { useMemo, useState } from "react";
import {
  formatDuration,
  playlistGenres,
  sharedTracksBetween,
  similarPlaylists,
  topArtists,
  type GenreProfile,
  type Library,
} from "@/lib/analysis";
import { GENRE_PREFIX, clusterColor, type Clusters } from "@/lib/graph";
import type { Playlist, Track } from "@/lib/types";

interface Props {
  library: Library;
  clusters: Clusters;
  genres: GenreProfile | null;
  selected: string | null;
  onSelect: (id: string | null) => void;
}

type Ctx = Omit<Props, "selected">;

export default function Panel({ selected, ...ctx }: Props) {
  const { library, genres } = ctx;
  if (selected && library.playlists.has(selected))
    return <PlaylistDetail key={selected} id={selected} {...ctx} />;
  if (selected && library.artists.has(selected)) return <ArtistDetail id={selected} {...ctx} />;
  if (selected && library.tracks.has(selected)) return <TrackDetail id={selected} {...ctx} />;
  if (selected?.startsWith(GENRE_PREFIX) && genres?.byName.has(selected.slice(GENRE_PREFIX.length)))
    return <GenreDetail name={selected.slice(GENRE_PREFIX.length)} {...ctx} />;
  return <Overview {...ctx} />;
}

/* ---------- building blocks ---------- */

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="px-5 py-4">
      <h3 className="mb-2 text-xs font-medium text-zinc-500">{title}</h3>
      {children}
    </section>
  );
}

function Row({
  onClick,
  children,
  right,
  active,
}: {
  onClick?: () => void;
  children: React.ReactNode;
  right?: React.ReactNode;
  active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={`-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-md px-2 py-1.5 text-left transition hover:bg-white/5 ${
        active ? "bg-white/5" : ""
      }`}
    >
      <span className="min-w-0 flex-1">{children}</span>
      {right !== undefined && <span className="shrink-0 text-xs tabular-nums text-zinc-500">{right}</span>}
    </button>
  );
}

function Dot({ color }: { color: string }) {
  return <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: color }} />;
}

function Name({ children, dot }: { children: React.ReactNode; dot?: string }) {
  return (
    <span className="flex items-center gap-2 text-sm text-zinc-100">
      {dot && <Dot color={dot} />}
      <span className="truncate">{children}</span>
    </span>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <span className="block truncate text-xs text-zinc-500">{children}</span>;
}

function TrackRow({ track, onSelect, right }: { track: Track; onSelect: Ctx["onSelect"]; right?: React.ReactNode }) {
  return (
    <Row onClick={() => onSelect(track.id)} right={right}>
      <Name>{track.name}</Name>
      <Sub>{track.artists.map((a) => a.name).join(", ")}</Sub>
    </Row>
  );
}

function Header({
  kind,
  title,
  meta,
  href,
  image,
  onBack,
}: {
  kind: string;
  title: string;
  meta: string;
  href?: string;
  image?: React.ReactNode;
  onBack: () => void;
}) {
  return (
    <div className="px-5 pb-2 pt-4">
      <button onClick={onBack} className="mb-3 text-xs text-zinc-500 hover:text-white">
        Back to overview
      </button>
      <div className="flex items-center gap-3">
        {image}
        <div className="min-w-0">
          <p className="text-xs text-zinc-500">{kind}</p>
          <h2 className="truncate text-base font-semibold text-white">{title}</h2>
          <p className="text-xs text-zinc-400">
            {meta}
            {href && (
              <>
                {" · "}
                <a href={href} target="_blank" rel="noreferrer" className="text-accent hover:underline">
                  Open in Spotify
                </a>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}

function Stats({ items }: { items: [string, string | number][] }) {
  return (
    <div className="grid grid-cols-4 gap-2 px-5 py-4">
      {items.map(([label, value]) => (
        <div key={label}>
          <div className="text-base font-semibold tabular-nums text-white">{value}</div>
          <div className="text-[11px] leading-tight text-zinc-500">{label}</div>
        </div>
      ))}
    </div>
  );
}

function Chips({ items, onSelect }: { items: { name: string; count?: number }[]; onSelect: Ctx["onSelect"] }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {items.map((g) => (
        <button
          key={g.name}
          onClick={() => onSelect(GENRE_PREFIX + g.name)}
          className="rounded bg-raised px-2 py-0.5 text-xs text-zinc-300 hover:bg-white/10 hover:text-white"
        >
          {g.name}
        </button>
      ))}
    </div>
  );
}

function ShowMore<T>({ items, limit, render }: { items: T[]; limit: number; render: (t: T) => React.ReactNode }) {
  const [all, setAll] = useState(false);
  return (
    <>
      {(all ? items : items.slice(0, limit)).map(render)}
      {items.length > limit && (
        <button onClick={() => setAll(!all)} className="mt-1 text-xs text-zinc-500 hover:text-white">
          {all ? "Show less" : `Show all ${items.length}`}
        </button>
      )}
    </>
  );
}

const pct = (n: number) => `${Math.round(n * 100)}%`;
const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;
const colorOf = (clusters: Clusters, pid: string) => clusterColor(clusters.of.get(pid) ?? -1);

/* ---------- overview ---------- */

function Overview({ library, genres, onSelect }: Ctx) {
  const data = useMemo(() => {
    const tracks = [...library.tracks.values()];
    return {
      shared: tracks.filter((t) => t.playlists.length > 1).length,
      pairs: [...library.pairs.values()]
        .filter((p) => p.sharedTracks > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5),
      artists: [...library.artists.values()]
        .sort((a, b) => b.playlists.size - a.playlists.size || b.trackIds.size - a.trackIds.size)
        .slice(0, 6),
      songs: tracks
        .filter((t) => t.playlists.length > 1)
        .sort((a, b) => b.playlists.length - a.playlists.length)
        .slice(0, 6),
    };
  }, [library]);

  const count = library.playlists.size;
  const name = (id: string) => library.playlists.get(id)?.name ?? "";

  return (
    <div className="divide-y divide-line">
      <Stats
        items={[
          ["playlists", count],
          ["songs", library.tracks.size],
          ["artists", library.artists.size],
          ["shared songs", data.shared],
        ]}
      />

      {data.pairs.length > 0 && (
        <Section title="Most alike">
          {data.pairs.map((p) => (
            <Row key={p.a + p.b} onClick={() => onSelect(p.a)} right={pct(p.score)}>
              <Name>
                {name(p.a)} <span className="text-zinc-500">and</span> {name(p.b)}
              </Name>
              <Sub>{plural(p.sharedTracks, "shared song")}</Sub>
            </Row>
          ))}
        </Section>
      )}

      {genres && genres.ranked.length > 0 && (
        <Section title="Top genres">
          <Chips items={genres.ranked.slice(0, 14)} onSelect={onSelect} />
        </Section>
      )}

      {data.artists.length > 0 && (
        <Section title="Artists in the most playlists">
          {data.artists.map((a) => (
            <Row key={a.artist.id} onClick={() => onSelect(a.artist.id)} right={`${a.playlists.size}/${count}`}>
              <Name>{a.artist.name}</Name>
            </Row>
          ))}
        </Section>
      )}

      {data.songs.length > 0 && (
        <Section title="Songs in the most playlists">
          {data.songs.map((t) => (
            <TrackRow key={t.track.id} track={t.track} onSelect={onSelect} right={t.playlists.length} />
          ))}
        </Section>
      )}

      <Section title="Duplicates">
        {library.duplicates.length === 0 ? (
          <p className="text-sm text-zinc-500">None found.</p>
        ) : (
          <ShowMore
            items={library.duplicates}
            limit={5}
            render={(d) => (
              <Row
                key={d.playlistId + d.track.id + d.kind}
                onClick={() => onSelect(d.playlistId)}
                right={d.kind === "exact" ? `${d.count}×` : `${d.count} versions`}
              >
                <Name>{d.track.name}</Name>
                <Sub>{name(d.playlistId)}</Sub>
              </Row>
            )}
          />
        )}
      </Section>
    </div>
  );
}

/* ---------- playlist ---------- */

function Cover({ playlist, color }: { playlist: Playlist; color: string }) {
  if (playlist.image)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={playlist.image} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />;
  return (
    <span
      className="grid h-14 w-14 shrink-0 place-items-center rounded text-base font-semibold text-black/70"
      style={{ background: color }}
    >
      {playlist.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function PlaylistDetail({ id, library, clusters, genres, onSelect }: Ctx & { id: string }) {
  const playlist = library.playlists.get(id)!;
  const color = colorOf(clusters, id);
  const similar = useMemo(() => similarPlaylists(library, id), [library, id]);
  const artists = useMemo(() => topArtists(library, id, 6), [library, id]);
  const [compare, setCompare] = useState<string | null>(null);
  const shared = useMemo(
    () => (compare ? sharedTracksBetween(library, id, compare) : []),
    [library, id, compare]
  );

  const ids = new Set(playlist.tracks.map((t) => t.id));
  const unique = [...ids].filter((t) => library.tracks.get(t)?.playlists.length === 1).length;
  const dupes = library.duplicates.filter((d) => d.playlistId === id);
  const duration = playlist.tracks.reduce((s, t) => s + t.duration, 0);
  const topGenres = genres ? playlistGenres(genres, id, 8) : [];

  return (
    <div className="divide-y divide-line">
      <Header
        kind="Playlist"
        title={playlist.name}
        meta={formatDuration(duration)}
        href={playlist.url}
        image={<Cover playlist={playlist} color={color} />}
        onBack={() => onSelect(null)}
      />
      <Stats
        items={[
          ["songs", playlist.tracks.length],
          ["artists", library.playlistArtists.get(id)?.size ?? 0],
          ["only here", ids.size ? pct(unique / ids.size) : "0%"],
          ["duplicates", dupes.length],
        ]}
      />

      {topGenres.length > 0 && (
        <Section title="Genres">
          <Chips items={topGenres} onSelect={onSelect} />
        </Section>
      )}

      {similar.length > 0 && (
        <Section title="Closest playlists">
          {similar.map((s) => {
            const active = compare === s.other;
            return (
              <div key={s.other}>
                <Row onClick={() => setCompare(active ? null : s.other)} right={pct(s.score)} active={active}>
                  <Name dot={colorOf(clusters, s.other)}>{library.playlists.get(s.other)!.name}</Name>
                  <Sub>
                    {plural(s.sharedTracks, "song")}, {plural(s.sharedArtists, "artist")} in common
                  </Sub>
                </Row>
                {active && (
                  <div className="mb-2 ml-2 border-l border-line pl-3">
                    {shared.length === 0 ? (
                      <p className="py-1 text-xs text-zinc-500">No identical songs, only shared artists.</p>
                    ) : (
                      <ShowMore
                        items={shared}
                        limit={8}
                        render={(t) => <TrackRow key={t.id} track={t} onSelect={onSelect} />}
                      />
                    )}
                    <button onClick={() => onSelect(s.other)} className="mt-1 text-xs text-zinc-500 hover:text-white">
                      Go to playlist
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </Section>
      )}

      {artists.length > 0 && (
        <Section title="Top artists">
          {artists.map(({ artist, count }) => (
            <Row key={artist.id} onClick={() => onSelect(artist.id)} right={count}>
              <Name>{artist.name}</Name>
            </Row>
          ))}
        </Section>
      )}

      {dupes.length > 0 && (
        <Section title="Duplicates">
          {dupes.map((d) => (
            <Row
              key={d.track.id + d.kind}
              onClick={() => onSelect(d.track.id)}
              right={d.kind === "exact" ? `${d.count}×` : `${d.count} versions`}
            >
              <Name>{d.track.name}</Name>
              <Sub>{d.track.artists[0]?.name}</Sub>
            </Row>
          ))}
        </Section>
      )}
    </div>
  );
}

/* ---------- artist ---------- */

function ArtistDetail({ id, library, clusters, onSelect, genres }: Ctx & { id: string }) {
  const info = library.artists.get(id)!;
  const playlists = [...info.playlists.entries()].sort((a, b) => b[1] - a[1]);
  const tracks = [...info.trackIds]
    .map((t) => library.tracks.get(t)!)
    .sort((a, b) => b.playlists.length - a.playlists.length);
  const artistGenres = genres
    ? genres.ranked.filter((g) => g.artists.has(id)).map((g) => ({ name: g.name }))
    : [];

  return (
    <div className="divide-y divide-line">
      <Header
        kind="Artist"
        title={info.artist.name}
        meta={`${plural(tracks.length, "song")} in ${plural(playlists.length, "playlist")}`}
        href={`https://open.spotify.com/artist/${id}`}
        onBack={() => onSelect(null)}
      />
      {artistGenres.length > 0 && (
        <Section title="Genres">
          <Chips items={artistGenres} onSelect={onSelect} />
        </Section>
      )}
      <Section title="Playlists">
        {playlists.map(([pid, count]) => (
          <Row key={pid} onClick={() => onSelect(pid)} right={count}>
            <Name dot={colorOf(clusters, pid)}>{library.playlists.get(pid)?.name}</Name>
          </Row>
        ))}
      </Section>
      <Section title="Songs">
        <ShowMore
          items={tracks}
          limit={10}
          render={(t) => (
            <TrackRow
              key={t.track.id}
              track={t.track}
              onSelect={onSelect}
              right={t.playlists.length > 1 ? t.playlists.length : undefined}
            />
          )}
        />
      </Section>
    </div>
  );
}

/* ---------- genre ---------- */

function GenreDetail({ name, library, clusters, genres, onSelect }: Ctx & { name: string }) {
  const info = genres!.byName.get(name)!;
  const playlists = [...info.playlists.entries()]
    .map(([pid, count]) => ({ pid, count, share: count / (library.playlists.get(pid)!.tracks.length || 1) }))
    .sort((a, b) => b.share - a.share);
  const artists = [...info.artists]
    .map((id) => library.artists.get(id)!)
    .filter(Boolean)
    .sort((a, b) => b.trackIds.size - a.trackIds.size);

  return (
    <div className="divide-y divide-line">
      <Header
        kind="Genre"
        title={name}
        meta={`${plural(info.tracks, "song")} in ${plural(playlists.length, "playlist")}`}
        onBack={() => onSelect(null)}
      />
      <Section title="Share of each playlist">
        {playlists.map(({ pid, share }) => (
          <Row key={pid} onClick={() => onSelect(pid)} right={pct(share)}>
            <Name dot={colorOf(clusters, pid)}>{library.playlists.get(pid)?.name}</Name>
          </Row>
        ))}
      </Section>
      <Section title="Artists">
        <ShowMore
          items={artists}
          limit={10}
          render={(a) => (
            <Row key={a.artist.id} onClick={() => onSelect(a.artist.id)} right={a.trackIds.size}>
              <Name>{a.artist.name}</Name>
            </Row>
          )}
        />
      </Section>
    </div>
  );
}

/* ---------- track ---------- */

function TrackDetail({ id, library, clusters, onSelect }: Ctx & { id: string }) {
  const info = library.tracks.get(id)!;
  const t = info.track;
  return (
    <div className="divide-y divide-line">
      <Header
        kind="Song"
        title={t.name}
        meta={t.album}
        href={t.url}
        image={
          t.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={t.image} alt="" className="h-14 w-14 shrink-0 rounded object-cover" />
          ) : undefined
        }
        onBack={() => onSelect(null)}
      />
      <Section title="Artists">
        {t.artists.map((a) => (
          <Row key={a.id} onClick={() => onSelect(a.id)}>
            <Name>{a.name}</Name>
          </Row>
        ))}
      </Section>
      <Section title={`In ${plural(info.playlists.length, "playlist")}`}>
        {info.playlists.map((pid) => (
          <Row key={pid} onClick={() => onSelect(pid)}>
            <Name dot={colorOf(clusters, pid)}>{library.playlists.get(pid)?.name}</Name>
          </Row>
        ))}
      </Section>
    </div>
  );
}
