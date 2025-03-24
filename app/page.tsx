import { cookies } from "next/headers";
import Link from "next/link";

export default async function Home() {
  const url = new URL(process.env.BASE_URL!);
  const searchParams = url.searchParams;
  const error = searchParams.get("error");

  const cookieStore = await cookies();
  const token = cookieStore.get("spotify_access_token")?.value;
  const refreshToken = cookieStore.get("spotify_refresh_token")?.value;

  console.log("playlists: ", cookieStore.get("playlists")?.value);
  // log all cookies
  console.log("all cookies: ", cookieStore.getAll());

  console.log("token: ", token);
  console.log("refreshToken: ", refreshToken);

  if (error) {
    return (
      <div>
        <h1>Authentication Error</h1>
        <p>Error: {error}</p>
        <p>
          <Link href="/api/auth/login">Try logging in again</Link>
        </p>
      </div>
    );
  }

  if (!token) {
    return (
      <div>
        <h1>Spotify Playlist Graph</h1>
        <p>
          Please <Link href="/api/auth/login">login with Spotify</Link> to view
          your playlists.
        </p>
      </div>
    );
  }

  const playlistsResponse = await fetch(
    `${process.env.BASE_URL}/api/get_playlists?token=${token}`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
    }
  );

  if (playlistsResponse.status === 401) {
    return (
      <div>
        <h1>Session Expired</h1>
        <p>Your session has expired. Please log in again.</p>
        <p>
          <Link href="/api/auth/login">Login with Spotify</Link>
        </p>
      </div>
    );
  }

  if (playlistsResponse.ok) {
    const playlistsData = await playlistsResponse.json();
    console.log(
      "playlistsData (first 200 chars) from page.tsx",
      playlistsData.slice(0, 200)
    );

    try {
      // Call the API route with revalidate option
      const savePlaylists = await fetch(
        `${process.env.BASE_URL}/api/set_playlists`,
        {
          method: "POST",
          body: JSON.stringify(playlistsData),
          cache: "no-store",
        }
      );

      if (savePlaylists.ok) {
        console.log("Playlists saved successfully");
      } else {
        console.error("Failed to save playlists", await savePlaylists.text());
      }
    } catch (error) {
      console.error("Error saving playlists:", error);
    }

    return (
      <div>
        <h1>Spotify Playlist Graph</h1>
        <p>Successfully loaded {playlistsData.length} playlists</p>
        <div>
          <h2>Your Playlists</h2>
          <ul>
            {playlistsData.map((playlist: any) => (
              <li key={playlist.id}>
                {playlist.name} - {playlist.tracks?.length || 0} tracks
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  return (
    <div>
      <h1>Error Loading Playlists</h1>
      <p>Status: {playlistsResponse.status}</p>
      <p>
        <Link href="/api/auth/login">Try logging in again</Link>
      </p>
    </div>
  );
}
