import { NextResponse } from "next/server";
import { errorResponse, pickImage, spotifyGet } from "@/lib/spotify";
import type { Track } from "@/lib/types";

export const maxDuration = 60;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  if (!/^[a-zA-Z0-9]+$/.test(id)) {
    return NextResponse.json({ error: "Invalid playlist id" }, { status: 400 });
  }

  try {
    const tracks: Track[] = [];
    let next: string | null = `/playlists/${id}/items?limit=50`;

    while (next) {
      const page: any = await spotifyGet(next);
      for (const entry of page.items ?? []) {
        // `track` was renamed to `item` in the February 2026 API update.
        const t = entry?.item ?? entry?.track;
        if (!t || t.type === "episode" || t.is_local || !t.id) continue;
        tracks.push({
          id: t.id,
          name: t.name,
          artists: (t.artists ?? [])
            .filter((a: any) => a?.id)
            .map((a: any) => ({ id: a.id, name: a.name })),
          album: t.album?.name ?? "",
          image: pickImage(t.album?.images, 64),
          url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
          duration: t.duration_ms ?? 0,
        });
      }
      next = page.next;
    }

    return NextResponse.json(tracks);
  } catch (e) {
    return errorResponse(e);
  }
}
