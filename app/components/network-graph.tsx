"use client";

import { useEffect } from "react";
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
    baseSize: 8 as number,
  },
  SONG: {
    color: "#2E77D0", // Blue
    prefix: "song-",
    baseSize: 5 as number,
  },
  ARTIST: {
    color: "#E91429", // Red
    prefix: "artist-",
    baseSize: 6 as number,
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
const LayoutControls = () => {
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
    </div>
  );
};

// Component that loads the graph
const LoadGraph = ({ playlists }: { playlists: Playlist[] }) => {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    // Initialize graph with multi-edge support
    const graph = new Graph({ multi: true, allowSelfLoops: false });

    // Maps to track node degrees (number of connections)
    const artistDegrees = new Map<string, number>();
    const songDegrees = new Map<string, number>();
    const playlistDegrees = new Map<string, number>();

    // Helper function to create a unique edge ID
    const createEdgeId = (source: string, target: string, type: string) => {
      return `${source}-${target}-${type}`;
    };

    // First pass: Create all nodes and track connections
    playlists.forEach((playlist) => {
      const playlistId = NODE_TYPES.PLAYLIST.prefix + playlist.id;

      // Add playlist node if it doesn't exist
      if (!graph.hasNode(playlistId)) {
        graph.addNode(playlistId, {
          x: Math.random(),
          y: Math.random(),
          label: playlist.name,
          color: NODE_TYPES.PLAYLIST.color,
          size: NODE_TYPES.PLAYLIST.baseSize,
        });
        playlistDegrees.set(playlistId, 0);
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
          songDegrees.set(songId, 0);
        }

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
          playlistDegrees.set(
            playlistId,
            (playlistDegrees.get(playlistId) || 0) + 1
          );
          songDegrees.set(songId, (songDegrees.get(songId) || 0) + 1);
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
            });
            artistDegrees.set(artistId, 0);
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
            });
            songDegrees.set(songId, (songDegrees.get(songId) || 0) + 1);
            artistDegrees.set(artistId, (artistDegrees.get(artistId) || 0) + 1);
          }
        });
      });
    });

    // Second pass: Update node sizes based on their connections
    graph.forEachNode((nodeId, attributes) => {
      let degree = 0;
      let baseSize = NODE_TYPES.SONG.baseSize;

      if (nodeId.startsWith(NODE_TYPES.PLAYLIST.prefix)) {
        degree = playlistDegrees.get(nodeId) || 0;
        baseSize = NODE_TYPES.PLAYLIST.baseSize;
      } else if (nodeId.startsWith(NODE_TYPES.SONG.prefix)) {
        degree = songDegrees.get(nodeId) || 0;
        baseSize = NODE_TYPES.SONG.baseSize;
      } else if (nodeId.startsWith(NODE_TYPES.ARTIST.prefix)) {
        degree = artistDegrees.get(nodeId) || 0;
        baseSize = NODE_TYPES.ARTIST.baseSize;
      }

      // Update node size based on log of degree to prevent huge variations
      graph.setNodeAttribute(nodeId, "size", baseSize + Math.log(degree + 1));
    });

    loadGraph(graph);
  }, [loadGraph, playlists]);

  return null;
};

export default function NetworkGraph({ playlists }: { playlists: Playlist[] }) {
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
        <LoadGraph playlists={playlists} />
        <ControlsContainer position={"bottom-right"}>
          <LayoutForceAtlas2Control settings={{ settings: { slowDown: 10 } }} />
          <LayoutControls />
        </ControlsContainer>
      </SigmaContainer>
    </div>
  );
}
