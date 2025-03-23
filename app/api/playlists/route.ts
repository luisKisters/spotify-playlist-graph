import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const cookieStore = await cookies();
  const token = cookieStore.get("spotify_access_token")?.value;

  // Create a Set to track unique playlist IDs
  const uniquePlaylistIds = new Set<string>();
  const allPlaylists: any[] = [];

  const response = await fetch(
    "https://api.spotify.com/v1/me/playlists?limit=50",
    {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    }
  );

  if (response.status === 401) {
    const refreshResponse = await fetch("/api/auth/refresh");
    const refreshData = await refreshResponse.json();
    console.log("refreshData", refreshData);
    const new_access_token = refreshData.access_token;
    const new_refresh_token = refreshData.refresh_token;
    cookieStore.set("spotify_access_token", JSON.stringify(new_access_token));
    cookieStore.set("spotify_refresh_token", JSON.stringify(new_refresh_token));
    const new_response = await fetch(
      "https://api.spotify.com/v1/me/playlists?limit=50",
      {
        headers: {
          Authorization: `Bearer ${new_access_token}`,
        },
      }
    );
  }
  if (!response.ok) {
    return NextResponse.json({
      error: "Failed to fetch playlists",
      status: response.status,
      statusText: response.statusText,
    });
  }

  const data = await response.json();
  console.log("dataa", data);
  //   console.log("Initial data items count:", data.items.length);

  // Get user ID from the href URL
  const userId = data.href.split("/users/")[1].split("/")[0];

  // Process initial items
  data.items.forEach((item: any) => {
    if (
      item.owner.id === userId &&
      item.type === "playlist" &&
      // item.public === true &&
      //   item.collaborative === false &&
      !uniquePlaylistIds.has(item.id)
    ) {
      uniquePlaylistIds.add(item.id);
      allPlaylists.push(item);
    }
  });

  let nextUrl = data.next;
  let pageCount = 1;
  const MAX_PAGES = 4; // Safeguard against infinite loops

  while (nextUrl && pageCount < MAX_PAGES) {
    const nextResponse = await fetch(nextUrl, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    const nextData = await nextResponse.json();
    console.log(`Page ${pageCount + 1} items count:`, nextData.items.length);

    // Process items from this page
    nextData.items.forEach((item: any) => {
      if (
        item.owner.id === userId &&
        item.type === "playlist" &&
        item.public === true &&
        item.collaborative === false &&
        !uniquePlaylistIds.has(item.id)
      ) {
        uniquePlaylistIds.add(item.id);
        allPlaylists.push(item);
      }
    });

    nextUrl = nextData.next;
    pageCount++;
    console.log("Total unique items so far:", allPlaylists.length);
  }

  // Extract playlist names
  const playlistNames = allPlaylists.map((item: any) => item.name);
  console.log("Final unique items count:", allPlaylists.length);
  console.log("Playlist names:", playlistNames);

  const playlist_array = allPlaylists.map((playlist) => {
    return {
      name: playlist.name,
      id: playlist.id,
      owner: playlist.owner.display_name,
      image: playlist.images[0].url,
      description: playlist.description,
      url: playlist.external_urls.spotify,
    };
  });

  cookieStore.set("playlists", JSON.stringify(playlist_array));

  return NextResponse.redirect("/");
}
