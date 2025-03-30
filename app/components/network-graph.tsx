"use client";

import { useEffect, useState } from "react";
import Sigma from "sigma";
import Graph from "graphology";
import {
  SigmaContainer,
  useLoadGraph,
  ControlsContainer,
} from "@react-sigma/core";
import "@react-sigma/core/lib/style.css";
import { LayoutForceAtlas2Control } from "@react-sigma/layout-forceatlas2";
import { Playlist, Track } from "../types/spotify"; // We'll create this type file next
import { Settings } from "sigma/settings";
import { circular } from "graphology-layout";
import { animateNodes } from "sigma/utils";
import { useRegisterEvents, useSigma } from "@react-sigma/core";

// Define node types and colors
const NODE_TYPES = {
  PLAYLIST: {
    color: "#1DB954", // Spotify green
    prefix: "playlist-",
    baseSize: 4 as number,
  },
  SONG: {
    color: "#2E77D0", // Blue
    prefix: "song-",
    baseSize: 2 as number,
  },
  ARTIST: {
    color: "#E91429", // Red
    prefix: "artist-",
    baseSize: 3 as number,
  },
} as const;

// Define simplified Sigma settings
const SIGMA_SETTINGS: Partial<Settings> = {
  allowInvalidContainer: true,
  defaultNodeType: "circle",
  defaultEdgeType: "line",
  labelSize: 12,
  minCameraRatio: 0.1,
  maxCameraRatio: 10,
};

// Layout Controls Component
const LayoutControls = ({
  showArtists,
  setShowArtists,
}: {
  showArtists: boolean;
  setShowArtists: (show: boolean) => void;
}) => {
  const sigma = useSigma();
  const registerEvents = useRegisterEvents();

  useEffect(() => {
    // Register click handlers
    registerEvents({
      // Add your custom events here
    });
  }, [registerEvents]);

  const handleCircularLayout = () => {
    const graph = sigma.getGraph();
    const circularPositions = circular(graph, { scale: 100 });
    animateNodes(graph, circularPositions, {
      duration: 2000,
      easing: "linear",
    });
  };

  const handleRandomLayout = () => {
    const graph = sigma.getGraph();
    const randomPositions: { [key: string]: { x: number; y: number } } = {};

    // Calculate position extents
    const xExtents = { min: 0, max: 0 };
    const yExtents = { min: 0, max: 0 };
    graph.forEachNode((node, attributes) => {
      xExtents.min = Math.min(attributes.x, xExtents.min);
      xExtents.max = Math.max(attributes.x, xExtents.max);
      yExtents.min = Math.min(attributes.y, yExtents.min);
      yExtents.max = Math.max(attributes.y, yExtents.max);
    });

    // Create random positions
    graph.forEachNode((node) => {
      randomPositions[node] = {
        x: Math.random() * (xExtents.max - xExtents.min),
        y: Math.random() * (yExtents.max - yExtents.min),
      };
    });

    animateNodes(graph, randomPositions, { duration: 2000 });
  };

  const toggleArtists = () => {
    setShowArtists(!showArtists);
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={handleCircularLayout}
        className="bg-blue-500 hover:bg-blue-600 text-white px-3 py-1 rounded text-sm"
      >
        Circular Layout
      </button>
      <button
        onClick={handleRandomLayout}
        className="bg-purple-500 hover:bg-purple-600 text-white px-3 py-1 rounded text-sm"
      >
        Random Layout
      </button>
      <button
        onClick={toggleArtists}
        className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm"
      >
        {showArtists ? "Hide Artists" : "Show Artists"}
      </button>
    </div>
  );
};

// Component that loads the graph
const LoadGraph = ({
  playlists,
  showArtists,
}: {
  playlists: Playlist[];
  showArtists: boolean;
}) => {
  const loadGraph = useLoadGraph();
  const sigma = useSigma();

  useEffect(() => {
    // Initialize graph with multi-edge support
    const graph = new Graph({ multi: true, allowSelfLoops: false });

    // Maps to track node degrees (number of connections)
    const artistDegrees = new Map<string, number>();
    const songDegrees = new Map<string, number>();
    const playlistSongCounts = new Map<string, number>();
    const songPlaylistCounts = new Map<string, number>();

    // Maps to keep track of all artists and their connections for toggling
    const artistNodes = new Set<string>();
    const artistEdges = new Set<string>();

    // Helper function to create a unique edge ID
    const createEdgeId = (source: string, target: string, type: string) => {
      return `${source}-${target}-${type}`;
    };

    // First pass: Create all nodes and track connections
    playlists.forEach((playlist) => {
      const playlistId = NODE_TYPES.PLAYLIST.prefix + playlist.id;
      const songCount = playlist.tracks.length;

      // Add playlist node if it doesn't exist
      if (!graph.hasNode(playlistId)) {
        graph.addNode(playlistId, {
          x: Math.random(),
          y: Math.random(),
          label: playlist.name,
          color: NODE_TYPES.PLAYLIST.color,
          size: NODE_TYPES.PLAYLIST.baseSize,
        });
        playlistSongCounts.set(playlistId, songCount);
      }

      // Process tracks
      playlist.tracks.forEach((track: Track) => {
        const songId = NODE_TYPES.SONG.prefix + track.uri;

        // Add song node if it doesn't exist
        if (!graph.hasNode(songId)) {
          graph.addNode(songId, {
            x: Math.random(),
            y: Math.random(),
            label: track.name,
            color: NODE_TYPES.SONG.color,
            size: NODE_TYPES.SONG.baseSize,
          });
          songPlaylistCounts.set(songId, 0);
        }

        // Increment the song's playlist count
        songPlaylistCounts.set(
          songId,
          (songPlaylistCounts.get(songId) || 0) + 1
        );

        // Create playlist-song edge with unique ID
        const playlistSongEdgeId = createEdgeId(
          playlistId,
          songId,
          "playlist-song"
        );
        if (!graph.hasEdge(playlistId, songId)) {
          graph.addEdge(playlistId, songId, {
            key: playlistSongEdgeId,
            color: NODE_TYPES.PLAYLIST.color + "80",
            size: 1,
          });
        }

        // Process artists
        const artists = track.artist.split(", ");
        artists.forEach((artist: string) => {
          const artistId =
            NODE_TYPES.ARTIST.prefix +
            artist.toLowerCase().replace(/[^a-z0-9]/g, "-");

          // Add artist node if it doesn't exist
          if (!graph.hasNode(artistId)) {
            graph.addNode(artistId, {
              x: Math.random(),
              y: Math.random(),
              label: artist,
              color: NODE_TYPES.ARTIST.color,
              size: NODE_TYPES.ARTIST.baseSize,
              hidden: !showArtists, // Hide artists by default
            });
            artistDegrees.set(artistId, 0);
            artistNodes.add(artistId);
          }

          // Create song-artist edge with unique ID
          const songArtistEdgeId = createEdgeId(
            songId,
            artistId,
            "song-artist"
          );
          if (!graph.hasEdge(songId, artistId)) {
            graph.addEdge(songId, artistId, {
              key: songArtistEdgeId,
              color: NODE_TYPES.SONG.color + "80",
              size: 1,
              hidden: !showArtists, // Hide artist edges by default
            });
            artistEdges.add(songArtistEdgeId);
            artistDegrees.set(artistId, (artistDegrees.get(artistId) || 0) + 1);
          }
        });
      });
    });

    // Second pass: Update node sizes based on their connections
    graph.forEachNode((nodeId, attributes) => {
      if (nodeId.startsWith(NODE_TYPES.PLAYLIST.prefix)) {
        // For playlists, size based on number of songs
        const songCount = playlistSongCounts.get(nodeId) || 0;
        // Scaling formula: base size + logarithmic scaling of song count to prevent huge nodes
        const size = NODE_TYPES.PLAYLIST.baseSize + 2 * Math.log(songCount + 1);
        graph.setNodeAttribute(nodeId, "size", size);
      } else if (nodeId.startsWith(NODE_TYPES.SONG.prefix)) {
        // For songs, size based on in how many playlists they appear
        const playlistCount = songPlaylistCounts.get(nodeId) || 0;
        // Small base size with small increase based on playlist appearances
        const size = NODE_TYPES.SONG.baseSize + Math.log(playlistCount + 1);
        graph.setNodeAttribute(nodeId, "size", size);
      } else if (nodeId.startsWith(NODE_TYPES.ARTIST.prefix)) {
        // For artists, a fixed size with small variation based on connections
        const degree = artistDegrees.get(nodeId) || 0;
        const size = NODE_TYPES.ARTIST.baseSize + 0.5 * Math.log(degree + 1);
        graph.setNodeAttribute(nodeId, "size", size);
      }
    });

    loadGraph(graph);

    // Store artist nodes and edges references for toggling visibility
    return () => {
      // Cleanup if needed
    };
  }, [loadGraph, playlists, showArtists]);

  // Effect to update artist visibility when toggle changes
  useEffect(() => {
    if (sigma) {
      const graph = sigma.getGraph();

      graph.forEachNode((nodeId, attributes) => {
        if (nodeId.startsWith(NODE_TYPES.ARTIST.prefix)) {
          graph.setNodeAttribute(nodeId, "hidden", !showArtists);
        }
      });

      graph.forEachEdge((edgeId, attributes, source, target) => {
        if (
          source.startsWith(NODE_TYPES.SONG.prefix) &&
          target.startsWith(NODE_TYPES.ARTIST.prefix)
        ) {
          graph.setEdgeAttribute(edgeId, "hidden", !showArtists);
        }
      });
    }
  }, [sigma, showArtists]);

  return null;
};

export default function NetworkGraph({ playlists }: { playlists: Playlist[] }) {
  const [showArtists, setShowArtists] = useState(false);

  return (
    <div className="mb-6">
      <SigmaContainer
        style={{
          height: "600px",
          width: "100%",
          border: "1px solid #ddd",
          borderRadius: "8px",
        }}
        settings={SIGMA_SETTINGS}
      >
        <LoadGraph playlists={playlists} showArtists={showArtists} />
        <ControlsContainer position={"bottom-right"}>
          <LayoutForceAtlas2Control settings={{ settings: { slowDown: 10 } }} />
          <LayoutControls
            showArtists={showArtists}
            setShowArtists={setShowArtists}
          />
        </ControlsContainer>
      </SigmaContainer>
    </div>
  );
}
