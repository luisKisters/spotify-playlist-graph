"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getPlaylists, savePlaylists } from "../lib/indexedDB";

type Playlist = {
  id: string;
  name: string;
  tracks: any[];
  images?: any[];
};

export default function PlaylistManager() {
  const { token, isAuthenticated, login } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchAndStorePlaylists = async () => {
      try {
        setLoading(true);

        // First try to get playlists from IndexedDB
        const storedPlaylists = await getPlaylists();

        if (storedPlaylists && storedPlaylists.length > 0) {
          setPlaylists(storedPlaylists);
          setLoading(false);

          //   // Optional: Check how old the data is before refreshing
          //   const lastFetchTime = localStorage.getItem("playlist_last_fetch");
          //   const shouldRefresh =
          //     !lastFetchTime || Date.now() - parseInt(lastFetchTime) > 3600000; // 1 hour

          //   if (shouldRefresh) {
          //     // Fetch in background only if data is stale
          //     fetchFromAPI(true); // Pass true to indicate background refresh
          //   }
        } else {
          // If no data in IndexedDB, fetch from API
          await fetchFromAPI(false);
        }
      } catch (err) {
        console.error("Error loading playlists:", err);
        setError("Failed to load playlists. Please try again.");
        setLoading(false);
      }
    };

    const fetchFromAPI = async (isBackgroundFetch = false) => {
      try {
        if (!isBackgroundFetch) {
          setLoading(true);
        }

        const response = await fetch("/api/get_playlists", {
          headers: { Authorization: `Bearer ${token}` },
        });

        if (response.status === 401) {
          setError("Your session has expired. Please log in again.");
          return;
        }

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const playlistsData = await response.json();

        // Save to IndexedDB
        await savePlaylists(playlistsData);

        // Update state
        setPlaylists(playlistsData);
        setLoading(false);

        // Update last fetch timestamp
        localStorage.setItem("playlist_last_fetch", Date.now().toString());
      } catch (err) {
        console.error("Error fetching from API:", err);
        if (!isBackgroundFetch) {
          setError("Failed to load playlists from Spotify.");
          setLoading(false);
        }
      }
    };

    fetchAndStorePlaylists();
  }, [isAuthenticated, token]);

  if (!isAuthenticated) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Spotify Playlist Graph</h1>
        <p className="mb-4">Please log in to view your playlists.</p>
        <button
          onClick={login}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded transition"
        >
          Login with Spotify
        </button>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Loading Playlists...</h1>
        <div className="animate-pulse bg-gray-200 h-6 w-full max-w-md rounded mb-2"></div>
        <div className="animate-pulse bg-gray-200 h-6 w-full max-w-sm rounded mb-2"></div>
        <div className="animate-pulse bg-gray-200 h-6 w-full max-w-lg rounded"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-4xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">Error Loading Playlists</h1>
        <p className="text-red-500 mb-4">{error}</p>
        <button
          onClick={login}
          className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded transition"
        >
          Try logging in again
        </button>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Spotify Playlist Graph</h1>
      <p className="mb-6">Successfully loaded {playlists.length} playlists</p>

      <div>
        <h2 className="text-xl font-semibold mb-4">Your Playlists</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className="border rounded-lg p-4 hover:shadow-md transition"
            >
              {playlist.images && playlist.images[0] && (
                <img
                  src={playlist.images[0].url}
                  alt={playlist.name}
                  className="w-full h-40 object-cover rounded mb-2"
                />
              )}
              <h3 className="font-medium">{playlist.name}</h3>
              <p className="text-sm text-gray-600">
                {playlist.tracks?.length || 0} tracks
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
