import { NextResponse } from "next/server";
import { errorResponse, getAccessToken } from "@/lib/spotify";

// Spotify no longer returns artist genres to Development Mode apps, so genres
// come from Last.fm tags (when LASTFM_API_KEY is set) or MusicBrainz.

export const maxDuration = 60;

const MAX_ARTISTS = 10;
const USER_AGENT = "PlaylistGraph/1.0 (https://spotify-playlist-graph.vercel.app)";

// Tags that describe the listener or origin rather than the music.
const JUNK = new Set([
  "seen live", "favorites", "favourites", "favorite", "love", "awesome",
  "beautiful", "albums i own", "under 2000 listeners", "spotify",
  "male vocalists", "female vocalists", "female vocalist", "male vocalist",
  "singer-songwriter", "british", "american", "english", "german", "french",
  "swedish", "canadian", "australian", "uk", "usa", "japanese", "korean",
  "spanish", "italian", "dutch", "norwegian", "irish", "scottish", "all",
]);

function clean(tags: { name: string; count: number }[], minCount: number) {
  return tags
    .map((t) => ({ name: t.name.toLowerCase().trim(), count: Number(t.count) || 0 }))
    .filter((t) => t.count >= minCount && t.name.length > 1 && t.name.length < 30)
    .filter((t) => !JUNK.has(t.name) && !/^\d{2,4}s?$/.test(t.name))
    .sort((a, b) => b.count - a.count)
    .slice(0, 3)
    .map((t) => t.name);
}

async function fromLastfm(name: string, key: string): Promise<string[]> {
  const url =
    "https://ws.audioscrobbler.com/2.0/?method=artist.gettoptags&autocorrect=1&format=json" +
    `&artist=${encodeURIComponent(name)}&api_key=${key}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) return [];
  const data = await res.json();
  const tags = data?.toptags?.tag;
  return Array.isArray(tags) ? clean(tags, 10) : [];
}

async function fromMusicBrainz(name: string): Promise<string[]> {
  const url =
    "https://musicbrainz.org/ws/2/artist?fmt=json&limit=3&query=" +
    encodeURIComponent(`artist:"${name.replace(/"/g, "")}"`);
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(8000),
    });
    if (res.status === 503) {
      await new Promise((r) => setTimeout(r, 1500));
      continue;
    }
    if (!res.ok) return [];
    const data = await res.json();
    const match = (data.artists ?? []).find(
      (a: any) => a.score >= 90 && a.name?.toLowerCase() === name.toLowerCase()
    ) ?? (data.artists?.[0]?.score === 100 ? data.artists[0] : null);
    return match?.tags ? clean(match.tags, 1) : [];
  }
  return [];
}

export async function POST(request: Request) {
  try {
    // Only logged-in users, so this isn't an open proxy.
    await getAccessToken();
  } catch (e) {
    return errorResponse(e);
  }

  const body = await request.json().catch(() => null);
  const artists: { id: string; name: string }[] = Array.isArray(body?.artists)
    ? body.artists
        .filter((a: any) => typeof a?.id === "string" && typeof a?.name === "string")
        .slice(0, MAX_ARTISTS)
    : [];

  const key = process.env.LASTFM_API_KEY;
  const result: Record<string, string[]> = {};

  if (key) {
    await Promise.all(
      artists.map(async (a) => {
        result[a.id] = await fromLastfm(a.name, key).catch(() => []);
      })
    );
  } else {
    // MusicBrainz allows about one request per second.
    for (const [i, a] of artists.entries()) {
      if (i > 0) await new Promise((r) => setTimeout(r, 1050));
      result[a.id] = await fromMusicBrainz(a.name).catch(() => []);
    }
  }

  return NextResponse.json(result);
}
