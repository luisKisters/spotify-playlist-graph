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
import { NodeDisplayData, EdgeDisplayData } from "sigma/types";

// Define node types and colors
const NODE_TYPES = {
  PLAYLIST: {
    color: "#1DB954", // Spotify green
    prefix: "playlist-",
    baseSize: 5 as number,
    maxSize: 15 as number,
  },
  SONG: {
    color: "#2E77D0", // Blue
    prefix: "song-",
    baseSize: 3 as number,
    maxSize: 10 as number,
  },
  ARTIST: {
    color: "#E91429", // Red
    prefix: "artist-",
    baseSize: 4 as number,
    maxSize: 12 as number, // Increased from 10
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

// State interface
interface GraphState {
  hoveredNode?: string;
  hoveredNeighbors?: Set<string>;
}

// Interaction Controls Component with hover functionality
const InteractionControls = () => {
  const sigma = useSigma();
  const graph = sigma.getGraph();
  const [state, setState] = useState<GraphState>({});
  const [showArtists, setShowArtists] = useState(false);

  useEffect(() => {
    // Set up node reducers for hover effects
    sigma.setSetting("nodeReducer", (node, data) => {
      const res: Partial<NodeDisplayData> = { ...data };

      // If a node is hovered, make non-neighbors less visible
      if (
        state.hoveredNeighbors &&
        !state.hoveredNeighbors.has(node) &&
        state.hoveredNode !== node
      ) {
        res.label = "";
        res.color = "#cccccc"; // Grey color for non-connected nodes
        res.size = data.size * 0.8; // Slightly reduce size of non-highlighted nodes
        res.zIndex = 0;
      }

      // Highlight hovered node
      if (state.hoveredNode === node) {
        res.highlighted = true;
        res.color = data.color; // Ensure original color is kept
        res.size = data.size * 1.3; // Increase size for better visibility
        res.zIndex = 3; // Ensure it's on top of everything
        res.forceLabel = true;
      }

      // Raise z-index for neighboring nodes
      if (state.hoveredNeighbors && state.hoveredNeighbors.has(node)) {
        res.zIndex = 2;
        res.color = data.color; // Ensure original color is kept
        res.size = data.size * 1.1; // Slightly increase size
        res.forceLabel = true;
      }

      return res;
    });

    // Set up edge reducers for hover effects
    sigma.setSetting("edgeReducer", (edge, data) => {
      const res: Partial<EdgeDisplayData> = { ...data };

      // If a node is hovered, hide edges that are not connected to it
      if (
        state.hoveredNode &&
        !graph
          .extremities(edge)
          .every(
            (n) =>
              n === state.hoveredNode ||
              (state.hoveredNeighbors && state.hoveredNeighbors.has(n))
          )
      ) {
        res.hidden = true;
      }

      // Highlight edges connected to hovered node
      if (
        state.hoveredNode &&
        graph.extremities(edge).some((n) => n === state.hoveredNode)
      ) {
        res.size = 2; // Make highlighted edges thicker
        res.color = "#000000"; // Make them more visible
        res.zIndex = 1;
      }

      return res;
    });

    // Register enter/leave events
    sigma.on("enterNode", ({ node }) => {
      setState({
        hoveredNode: node,
        hoveredNeighbors: new Set(graph.neighbors(node)),
      });
    });

    sigma.on("leaveNode", () => {
      setState({});
    });

    // Cleanup on unmount
    return () => {
      sigma.removeAllListeners();
    };
  }, [sigma, graph, state]);

  // Toggle artist nodes
  const toggleArtists = () => {
    const newShowArtists = !showArtists;
    setShowArtists(newShowArtists);

    // Hide or show artist nodes
    graph.forEachNode((nodeId, attributes) => {
      if (nodeId.startsWith(NODE_TYPES.ARTIST.prefix)) {
        graph.setNodeAttribute(nodeId, "hidden", !newShowArtists);
      }
    });

    // Hide or show artist edges
    graph.forEachEdge((edgeId, attributes, source, target) => {
      if (
        source.startsWith(NODE_TYPES.SONG.prefix) &&
        target.startsWith(NODE_TYPES.ARTIST.prefix)
      ) {
        graph.setEdgeAttribute(edgeId, "hidden", !newShowArtists);
      }
    });
  };

  return null;
};

// Component that loads the graph
const LoadGraph = ({
  playlists,
  nodeSpacing,
}: {
  playlists: Playlist[];
  nodeSpacing: number;
}) => {
  const loadGraph = useLoadGraph();

  useEffect(() => {
    // Initialize graph with multi-edge support
    const graph = new Graph({ multi: true, allowSelfLoops: false });

    // Maps to track node connections
    const playlistSongCounts = new Map<string, number>();
    const songPlaylistCounts = new Map<string, number>();
    const artistConnections = new Map<string, number>();

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
          songCount: songCount,
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
            playlistCount: 0,
          });
          songPlaylistCounts.set(songId, 0);
        }

        // Update song's playlist count
        const currentCount = songPlaylistCounts.get(songId) || 0;
        songPlaylistCounts.set(songId, currentCount + 1);
        graph.setNodeAttribute(songId, "playlistCount", currentCount + 1);

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
              hidden: true, // Hide artists by default
            });
            artistConnections.set(artistId, 0);
          }

          // Update artist connection count
          const currentArtistCount = artistConnections.get(artistId) || 0;
          artistConnections.set(artistId, currentArtistCount + 1);

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
              hidden: true, // Hide artist edges by default
            });
          }
        });
      });
    });

    // Second pass: Update node sizes based on their connections
    graph.forEachNode((nodeId, attributes) => {
      // Apply node spacing
      const spacingMultiplier = nodeSpacing / 25;
      graph.setNodeAttribute(nodeId, "x", attributes.x * spacingMultiplier);
      graph.setNodeAttribute(nodeId, "y", attributes.y * spacingMultiplier);

      if (nodeId.startsWith(NODE_TYPES.PLAYLIST.prefix)) {
        // Scale playlist size based on number of songs
        const songCount = playlistSongCounts.get(nodeId) || 0;
        // Use square root scaling to prevent extreme size differences
        const size = NODE_TYPES.PLAYLIST.baseSize + Math.sqrt(songCount) * 1.5;
        const cappedSize = Math.min(size, NODE_TYPES.PLAYLIST.maxSize);
        graph.setNodeAttribute(nodeId, "size", cappedSize);
      } else if (nodeId.startsWith(NODE_TYPES.SONG.prefix)) {
        // Scale song size based on how many playlists include it
        const playlistCount = songPlaylistCounts.get(nodeId) || 0;
        const size =
          NODE_TYPES.SONG.baseSize +
          (playlistCount > 1 ? Math.sqrt(playlistCount) : 0);
        const cappedSize = Math.min(size, NODE_TYPES.SONG.maxSize);
        graph.setNodeAttribute(nodeId, "size", cappedSize);
      } else if (nodeId.startsWith(NODE_TYPES.ARTIST.prefix)) {
        // Scale artist size based on connections
        const connections = artistConnections.get(nodeId) || 0;
        const size = NODE_TYPES.ARTIST.baseSize + Math.sqrt(connections) * 0.8;
        const cappedSize = Math.min(size, NODE_TYPES.ARTIST.maxSize);
        graph.setNodeAttribute(nodeId, "size", cappedSize);
      }
    });

    loadGraph(graph);
  }, [loadGraph, playlists, nodeSpacing]);

  return null;
};

export default function NetworkGraph({ playlists }: { playlists: Playlist[] }) {
  // Fixed layout settings with optimal values
  const nodeSpacing = 50;

  // Create custom settings with nodeSpacing applied
  const customSettings: Partial<Settings> = {
    ...SIGMA_SETTINGS,
  };

  return (
    <div className="mb-6">
      <SigmaContainer
        style={{
          height: "600px",
          width: "100%",
          border: "1px solid #ddd",
          borderRadius: "8px",
        }}
        settings={customSettings}
      >
        <LoadGraph playlists={playlists} nodeSpacing={nodeSpacing} />
        <ControlsContainer position={"bottom-right"}>
          <LayoutForceAtlas2Control
            settings={{
              settings: {
                adjustSizes: true, // Prevent node collisions
                scalingRatio: 14, // Control the force intensity
                gravity: 0.8, // Higher gravity pulls nodes to center
                slowDown: 3, // Reduces movement speed
                barnesHutOptimize: true, // Better performance for large graphs
                barnesHutTheta: 0.5, // Precision of optimization (0.5-1.2)
                linLogMode: false, // Linear-linear mode for cleaner distribution
                outboundAttractionDistribution: true, // Better spread for connected nodes
                edgeWeightInfluence: 1, // Consider edge weights
              },
            }}
          />
          <InteractionControls />
        </ControlsContainer>
      </SigmaContainer>
    </div>
  );
}
