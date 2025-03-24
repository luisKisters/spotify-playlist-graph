import { NextResponse } from "next/server";
import { cookies } from "next/headers";
export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("spotify_access_token")?.value;

  if (!token) {
    console.error("No access token found");
    return NextResponse.redirect(
      new URL("/api/auth/login", process.env.BASE_URL!)
    );
  }

  // Create a Set to track unique playlist IDs
  const uniquePlaylistIds = new Set<string>();
  const allPlaylists: any[] = [];

  async function spotify_request(
    url: string,
    currentToken: string,
    retryCount = 0
  ) {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000; // 1 second base delay for exponential backoff

    try {
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (response.status === 401) {
        const refreshResponse = await fetch("/api/auth/refresh");
        const refreshData = await refreshResponse.json();
        const new_access_token = refreshData.access_token;
        const new_refresh_token = refreshData.refresh_token;

        cookieStore.set("spotify_access_token", new_access_token);
        cookieStore.set("spotify_refresh_token", new_refresh_token);

        // Retry the request with the new token
        return spotify_request(url, new_access_token);
      }

      // Handle rate limiting
      if (response.status === 429) {
        if (retryCount >= MAX_RETRIES) {
          throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries`);
        }

        // Get retry delay from header or use exponential backoff
        const retryAfter = parseInt(
          response.headers.get("Retry-After") || "0",
          10
        );
        const delay = retryAfter * 1000 || Math.pow(2, retryCount) * BASE_DELAY;

        console.log(
          `Rate limited. Waiting ${delay / 1000} seconds before retry ${
            retryCount + 1
          }/${MAX_RETRIES}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        // Retry the request
        return spotify_request(url, currentToken, retryCount + 1);
      }

      if (!response.ok) {
        throw new Error(
          `Failed to fetch playlists: ${response.status} ${response.statusText}`
        );
      }

      return response.json();
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        if (retryCount >= MAX_RETRIES) {
          throw new Error(`Request timed out after ${MAX_RETRIES} retries`);
        }
        console.log(
          `Request timed out. Retrying (${retryCount + 1}/${MAX_RETRIES})...`
        );
        return spotify_request(url, currentToken, retryCount + 1);
      }
      throw error;
    }
  }

  try {
    const data = await spotify_request(
      "https://api.spotify.com/v1/me/playlists?limit=50",
      token
    );
    const userId = data.href.split("/users/")[1].split("/")[0];

    // Process initial items
    data.items.forEach((item: any) => {
      if (
        item.owner.id === userId &&
        item.type === "playlist" &&
        !uniquePlaylistIds.has(item.id)
      ) {
        uniquePlaylistIds.add(item.id);
        allPlaylists.push(item);
      }
    });

    let nextUrl = data.next;
    let pageCount = 1;
    const MAX_PAGES = 4;

    while (nextUrl && pageCount < MAX_PAGES) {
      const nextData = await spotify_request(nextUrl, token);

      nextData.items.forEach((item: any) => {
        if (
          item.owner.id === userId &&
          item.type === "playlist" &&
          !uniquePlaylistIds.has(item.id)
        ) {
          uniquePlaylistIds.add(item.id);
          allPlaylists.push(item);
        }
      });

      nextUrl = nextData.next;
      pageCount++;
    }

    const playlist_array = allPlaylists.map((playlist) => ({
      name: playlist.name,
      id: playlist.id,
      owner: playlist.owner.display_name,
      image: playlist.images[0]?.url || null,
      description: playlist.description,
      url: playlist.external_urls.spotify,
    }));

    const playlist_tracks = await Promise.all(
      playlist_array.map(async (playlist) => {
        const options =
          "items(track(album(external_urls,id,name,images),artists,duration_ms,external_urls,id,name,uri))";
        const response = await spotify_request(
          `https://api.spotify.com/v1/playlists/${
            playlist.id
          }/tracks?fields=${encodeURIComponent(options)}`,
          token
        );
        return {
          ...playlist,
          tracks: response.items.map((item: any) => ({
            name: item.track.name,
            artist: item.track.artists
              .map((artist: any) => artist.name)
              .join(", "),
            album: item.track.album.name,
            image: item.track.album.images[0].url,
            url: item.track.external_urls.spotify,
            uri: item.track.uri,
            duration: item.track.duration_ms,
          })),
        };
      })
    );
    return NextResponse.json(playlist_tracks);
  } catch (error) {
    console.error("Error fetching playlists:", error);
    return NextResponse.json(
      { error: "Failed to fetch playlists, error: " + error },
      { status: 500 }
    );
  }
}
