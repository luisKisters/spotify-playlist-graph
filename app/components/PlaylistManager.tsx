"use client";

import { useEffect, useState } from "react";
import { useAuth } from "./AuthProvider";
import {
  getPlaylists,
  savePlaylists,
  getArtists,
  saveArtists,
  getGenres,
  saveGenres,
  getMetadata,
  saveMetadata,
} from "../lib/indexedDB";
import dynamic from "next/dynamic";
import type { Playlist, Artist, Genre } from "../types/spotify";
import Image from "next/image";
const SpotifyNetworkGraph = dynamic(() => import("./SpotifyNetworkGraph"), {
  ssr: false,
});

// Caching settings
const CACHE_DURATION = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

export default function PlaylistManager() {
  const { token, isAuthenticated, login } = useAuth();
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [artists, setArtists] = useState<Artist[]>([]);
  const [genres, setGenres] = useState<Genre[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [fetchingGenres, setFetchingGenres] = useState(false);
  const [dataLastFetched, setDataLastFetched] = useState<number | null>(null);

  const fetchArtistGenres = async (playlistsData: Playlist[]) => {
    setFetchingGenres(true);
    try {
      // Check if we have recent artists and genres in IndexedDB
      const cachedArtists = await getArtists();
      const lastArtistFetch = await getMetadata("lastArtistFetch");
      const isCacheValid =
        lastArtistFetch &&
        Date.now() - lastArtistFetch < CACHE_DURATION &&
        cachedArtists.length > 0;

      if (isCacheValid) {
        console.log("Using cached artist data from IndexedDB");
        setArtists(cachedArtists);

        const cachedGenres = await getGenres();
        if (cachedGenres.length > 0) {
          console.log("Using cached genre data from IndexedDB");
          setGenres(cachedGenres);
          setFetchingGenres(false);
          return;
        }
      }

      // Extract unique artist IDs from all tracks
      const artistIdMap = new Map();

      playlistsData.forEach((playlist) => {
        playlist.tracks.forEach((track) => {
          if (track.artistIds && track.artistIds.length > 0) {
            track.artistIds.forEach((id) => {
              if (id && id.trim() !== "") {
                artistIdMap.set(id, true);
              }
            });
          }
        });
      });

      const uniqueArtistIds = Array.from(artistIdMap.keys());
      console.log(`Found ${uniqueArtistIds.length} unique artist IDs`);

      if (uniqueArtistIds.length === 0) {
        console.log("No artist IDs found in tracks, skipping genre fetch");
        return;
      }

      // Spotify API can only handle 50 IDs at a time, so batch them
      const batchSize = 50;
      const artistBatches = [];

      for (let i = 0; i < uniqueArtistIds.length; i += batchSize) {
        artistBatches.push(uniqueArtistIds.slice(i, i + batchSize));
      }

      let allArtists: Artist[] = [];
      let errorCount = 0;
      let authErrorOccurred = false;

      // Fetch each batch of artists
      for (let index = 0; index < artistBatches.length; index++) {
        if (authErrorOccurred) break;

        const batch = artistBatches[index];
        const idsParam = batch.join(",");
        console.log(
          `Fetching batch ${index + 1}/${artistBatches.length} with ${
            batch.length
          } artists`
        );
        console.log(`First few IDs in batch: ${batch.slice(0, 3).join(", ")}`);

        try {
          const response = await fetch(
            `/api/get_artist_genres?ids=${idsParam}`,
            {
              headers: { Authorization: `Bearer ${token}` },
            }
          );

          console.log(`Batch ${index + 1} response status:`, response.status);

          if (response.status === 401) {
            console.error("Auth token expired during artist data fetch");
            authErrorOccurred = true;
            // Set auth error that will prompt user to login again
            setError("Your session has expired. Please log in again.");
            setFetchingGenres(false);
            return;
          }

          if (!response.ok) {
            console.error("Error fetching artist data:", response.statusText);
            const errorText = await response.text();
            try {
              // Try to parse as JSON if possible
              const errorJson = JSON.parse(errorText);
              console.error("Error response JSON:", errorJson);
              errorCount++;
            } catch (e) {
              // If not JSON, log as text
              console.error("Error response body:", errorText);
              errorCount++;
            }
            continue;
          }

          const artistData = await response.json();
          console.log(
            `Received ${artistData.length} artists from batch ${index + 1}`
          );

          // Make sure we got a valid array of artists
          if (Array.isArray(artistData)) {
            allArtists = [...allArtists, ...artistData];
          } else {
            console.error("Invalid artist data format:", artistData);
            errorCount++;
          }
        } catch (error) {
          console.error(`Error in batch ${index + 1}:`, error);
          errorCount++;
        }
      }

      if (authErrorOccurred) return;

      if (errorCount > 0) {
        console.warn(
          `${errorCount}/${artistBatches.length} batches had errors`
        );
      }

      console.log(`Total artists data received: ${allArtists.length}`);
      setArtists(allArtists);

      // Save artists to IndexedDB
      await saveArtists(allArtists);

      if (allArtists.length === 0) {
        console.log("No artist data received, skipping genre processing");
        return;
      }

      // Extract and count unique genres
      const genreMap = new Map<string, number>();

      allArtists.forEach((artist) => {
        if (artist.genres && Array.isArray(artist.genres)) {
          artist.genres.forEach((genre) => {
            const count = genreMap.get(genre) || 0;
            genreMap.set(genre, count + 1);
          });
        }
      });

      const genreArray: Genre[] = Array.from(genreMap.entries())
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);

      console.log(`Processed ${genreArray.length} unique genres`);
      setGenres(genreArray);

      // Save genres to IndexedDB
      await saveGenres(genreArray);
    } catch (err) {
      console.error("Error fetching artist genres:", err);
    } finally {
      setFetchingGenres(false);
    }
  };

  useEffect(() => {
    if (!isAuthenticated) {
      setLoading(false);
      return;
    }

    const fetchAndStorePlaylists = async () => {
      try {
        setLoading(true);

        // Check if we have recent data in IndexedDB
        const lastPlaylistFetch = await getMetadata("lastPlaylistFetch");
        const storedPlaylists = await getPlaylists();
        const cacheValid =
          lastPlaylistFetch &&
          Date.now() - lastPlaylistFetch < CACHE_DURATION &&
          storedPlaylists.length > 0;

        setDataLastFetched(lastPlaylistFetch);

        if (cacheValid) {
          console.log("Using cached playlist data from IndexedDB");
          setPlaylists(storedPlaylists);

          // Also try to load artists and genres from cache
          await fetchArtistGenres(storedPlaylists);
          setLoading(false);
        } else {
          console.log("Cache invalid or expired, fetching fresh data");
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
          setLoading(false);
          return;
        }

        if (!response.ok) {
          throw new Error(`Error ${response.status}: ${response.statusText}`);
        }

        const playlistsData = await response.json();
        await savePlaylists(playlistsData);
        setPlaylists(playlistsData);

        try {
          await fetchArtistGenres(playlistsData);
        } catch (genreError) {
          console.error("Error fetching artist genres:", genreError);
          // Continue even if genre fetch fails, as we still have playlist data
        }

        setLoading(false);
        const now = Date.now();
        setDataLastFetched(now);
        await saveMetadata("lastFetch", now);
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

  // Function to manually refresh data
  const refreshData = async () => {
    if (!isAuthenticated) {
      login();
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const response = await fetch("/api/get_playlists", {
        headers: { Authorization: `Bearer ${token}` },
      });

      if (response.status === 401) {
        setError("Your session has expired. Please log in again.");
        setLoading(false);
        return;
      }

      if (!response.ok) {
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const playlistsData = await response.json();
      await savePlaylists(playlistsData);
      setPlaylists(playlistsData);
      await fetchArtistGenres(playlistsData);

      const now = Date.now();
      setDataLastFetched(now);
      await saveMetadata("lastFetch", now);
    } catch (err) {
      console.error("Error refreshing data:", err);
      setError("Failed to refresh data from Spotify.");
    } finally {
      setLoading(false);
    }
  };

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
        <div className="bg-red-50 border border-red-200 rounded-md p-4 mb-6">
          <p className="text-red-600 mb-4">{error}</p>
          <p className="text-gray-700 mb-4">
            This may be caused by an expired session. Please try logging in
            again.
          </p>
          <button
            onClick={login}
            className="bg-green-500 hover:bg-green-600 text-white px-4 py-2 rounded-md transition"
          >
            Login with Spotify
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Spotify Playlist Graph</h1>

      <div className="mb-4 flex justify-between items-center">
        <div>
          {dataLastFetched && (
            <p className="text-sm text-gray-500">
              Last updated: {new Date(dataLastFetched).toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={refreshData}
          disabled={loading}
          className="bg-green-500 hover:bg-green-600 text-white px-3 py-1 rounded text-sm"
        >
          Refresh Data
        </button>
      </div>

      <SpotifyNetworkGraph
        playlists={playlists}
        artists={artists}
        genres={genres}
      />

      <p className="mb-2 mt-4">
        Loaded {playlists.length} playlists, {artists.length} artists, and{" "}
        {genres.length} genres
      </p>

      {playlists.length > 0 && genres.length === 0 && (
        <div className="mb-6 bg-amber-50 border border-amber-200 p-3 rounded-md">
          <p className="text-amber-800 text-sm">
            Note: Unable to load genre information. This may affect the graph
            visualization.
          </p>
          <button
            onClick={() => fetchArtistGenres(playlists)}
            disabled={fetchingGenres}
            className={`mt-2 ${
              fetchingGenres
                ? "bg-amber-400"
                : "bg-amber-600 hover:bg-amber-700"
            } text-white text-xs px-3 py-1 rounded`}
          >
            {fetchingGenres ? "Loading genres..." : "Retry loading genres"}
          </button>
        </div>
      )}

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
