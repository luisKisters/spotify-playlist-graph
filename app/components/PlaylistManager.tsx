"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import { getPlaylists, savePlaylists } from "../lib/indexedDB";
import dynamic from "next/dynamic";
import type { Playlist } from "../types/spotify";
import Image from "next/image";
const NetworkGraph = dynamic(() => import("./network-graph"), {
  ssr: false,
});

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
        const storedPlaylists = await getPlaylists();

        if (storedPlaylists && storedPlaylists.length > 0) {
          setPlaylists(storedPlaylists);
          setLoading(false);
        } else {
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
        await savePlaylists(playlistsData);
        setPlaylists(playlistsData);
        setLoading(false);
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
      <NetworkGraph playlists={playlists} />
      <p className="mb-6">Successfully loaded {playlists.length} playlists</p>

      <div>
        <h2 className="text-xl font-semibold mb-4">Your Playlists</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {playlists.map((playlist) => (
            <div
              key={playlist.id}
              className="border rounded-lg p-4 hover:shadow-md transition"
            >
              {playlist.image && (
                <div className="relative w-full aspect-square mb-2">
                  <Image
                    fill
                    src={playlist.image}
                    alt={playlist.name}
                    className="rounded object-cover"
                    sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
                  />
                </div>
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
