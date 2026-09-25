import { NextResponse } from "next/server";
import { errorResponse, pickImage, spotifyGet } from "@/lib/spotify";
import type { PlaylistSummary } from "@/lib/types";

// Lists every playlist the user owns or collaborates on. Spotify only lets
// Development Mode apps read the items of those playlists.
export async function GET() {
  try {
    const me = await spotifyGet<{ id: string }>("/me");
    const playlists: PlaylistSummary[] = [];
    const seen = new Set<string>();
    let next: string | null = "/me/playlists?limit=50";

    while (next) {
      const page: any = await spotifyGet(next);
      for (const p of page.items ?? []) {
        if (!p || seen.has(p.id)) continue;
        if (p.owner?.id !== me.id && !p.collaborative) continue;
        seen.add(p.id);
        playlists.push({
          id: p.id,
          name: p.name || "Untitled playlist",
          owner: p.owner?.display_name || p.owner?.id || "",
          image: pickImage(p.images),
          url: p.external_urls?.spotify ?? `https://open.spotify.com/playlist/${p.id}`,
          snapshot: p.snapshot_id ?? "",
          // Renamed from `tracks` to `items` in the February 2026 API update.
          total: (p.items ?? p.tracks)?.total ?? 0,
        });
      }
      next = page.next;
    }

    return NextResponse.json(playlists);
  } catch (e) {
    return errorResponse(e);
  }
}
