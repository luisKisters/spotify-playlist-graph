import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET(request: NextRequest) {
  const cookieStore = await cookies();
  const token = cookieStore.get("spotify_access_token")?.value;
  const playlists = cookieStore.get("playlists");
  const playlists_array = JSON.parse(playlists?.value || "[]");

  const playlist_data = playlists_array.map(async (playlist: any) => {
    const response = await fetch(
      `https://api.spotify.com/v1/playlists/${playlist.id}/tracks`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );
    const data = await response.json();
    return {
      ...playlist,
      tracks: data.items,
    };
  });

  // Wait for all playlist track data to be fetched
  const playlists_with_tracks = await Promise.all(playlist_data);

  const playlist_id = request.nextUrl.searchParams.get("playlist_id");

  const playlist_items = await fetch(
    `https://api.spotify.com/v1/playlists/${playlist_id}/tracks`
  );

  const data = await playlist_items.json();

  return NextResponse.json({
    ...data,
    playlists: playlists_with_tracks,
  });
}
