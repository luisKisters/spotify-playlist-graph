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
import { Playlist, Track, Artist, Genre } from "../types/spotify"; // We'll create this type file next
import { Settings } from "sigma/settings";
import { circular } from "graphology-layout";
import { animateNodes } from "sigma/utils";
import { useRegisterEvents, useSigma } from "@react-sigma/core";
import { NodeDisplayData, EdgeDisplayData } from "sigma/types";

// Define node types and colors
const NODE_TYPES = {
  PLAYLIST: {
    color: "#5865F2", // Discord blue
    prefix: "playlist-",
    baseSize: 5 as number,
    maxSize: 15 as number,
  },
  SONG: {
    color: "#4CA3FD", // Light blue
    prefix: "song-",
    baseSize: 3 as number,
    maxSize: 10 as number,
  },
  ARTIST: {
    color: "#EB459E", // Pink
    prefix: "artist-",
    baseSize: 4 as number,
    maxSize: 12 as number,
  },
  GENRE: {
    color: "#9B59B6", // Purple
    prefix: "genre-",
    baseSize: 4 as number,
    maxSize: 14 as number,
  },
} as const;

// Define simplified Sigma settings
const SIGMA_SETTINGS: Partial<Settings> = {
  allowInvalidContainer: true,
  defaultNodeType: "circle",
  defaultEdgeType: "line",
  labelSize: 14,
  minCameraRatio: 0.1,
  maxCameraRatio: 10,
  labelColor: {
    color: "#ffffff", // White labels for dark mode
    attribute: "color",
  },
  renderEdgeLabels: false,
  defaultEdgeColor: "#4a4a4a", // Darker grey for default edge color
};

// State interface
interface GraphState {
  hoveredNode?: string;
  hoveredNeighbors?: Set<string>;
}

// GraphLegend component
const GraphLegend = () => {
  return (
    <div className="absolute top-4 left-4 bg-gray-800/90 text-white p-3 rounded-lg shadow-lg z-10">
      <h3 className="text-sm font-semibold mb-2">Graph Legend</h3>
      <div className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: NODE_TYPES.PLAYLIST.color }}
          ></div>
          <span className="text-xs">Playlist</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: NODE_TYPES.SONG.color }}
          ></div>
          <span className="text-xs">Song</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: NODE_TYPES.ARTIST.color }}
          ></div>
          <span className="text-xs">Artist</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className="w-4 h-4 rounded-full"
            style={{ backgroundColor: NODE_TYPES.GENRE.color }}
          ></div>
          <span className="text-xs">Genre</span>
        </div>
      </div>
    </div>
  );
};

// Collapsible Panel Component
const CollapsiblePanel = ({
  title,
  children,
  defaultOpen = false,
}: {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) => {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="bg-gray-800/90 rounded-lg overflow-hidden shadow-lg border border-gray-700">
      <button
        className="w-full p-3 text-left flex justify-between items-center hover:bg-gray-700 transition-colors text-white"
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-sm font-medium">{title}</span>
        <svg
          className={`w-5 h-5 transform transition-transform ${
            isOpen ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>
      {isOpen && <div className="p-3">{children}</div>}
    </div>
  );
};

// Interaction Controls Component with hover functionality
const InteractionControls = ({
  layoutSettings,
  setLayoutSettings,
  applySettings,
}: {
  layoutSettings: {
    scalingRatio: number;
    gravity: number;
    linLogMode: boolean;
    nodeSpacing: number;
  };
  setLayoutSettings: React.Dispatch<
    React.SetStateAction<typeof layoutSettings>
  >;
  applySettings: () => void;
}) => {
  const sigma = useSigma();
  const graph = sigma.getGraph();
  const [state, setState] = useState<GraphState>({});
  const [showArtists, setShowArtists] = useState(false);
  const [showGenres, setShowGenres] = useState(false);
  const [localSettings, setLocalSettings] = useState(layoutSettings);

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
        res.color = "#2A3050"; // Dark blue for non-connected nodes
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
        res.size = 0.5; // Make highlighted edges slightly thicker but still subtle
        res.color = "#666666"; // Lighter grey for highlighted edges
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

  // Apply layout settings when they change
  useEffect(() => {
    // Refresh sigma to apply new settings
    sigma.refresh();
  }, [layoutSettings, sigma]);

  const handleCircularLayout = () => {
    const circularPositions = circular(graph, { scale: 100 });
    animateNodes(graph, circularPositions, {
      duration: 2000,
      easing: "linear",
    });
  };

  const handleRandomLayout = () => {
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

    // If artists are hidden, also hide genres
    if (!newShowArtists && showGenres) {
      toggleGenres();
    }
  };

  const toggleGenres = () => {
    const newShowGenres = !showGenres;
    setShowGenres(newShowGenres);

    // Don't automatically show artists when showing genres
    // if (newShowGenres && !showArtists) {
    //   toggleArtists();
    // }

    // Hide or show genre nodes
    graph.forEachNode((nodeId, attributes) => {
      if (nodeId.startsWith(NODE_TYPES.GENRE.prefix)) {
        graph.setNodeAttribute(nodeId, "hidden", !newShowGenres);
      }
    });

    // Hide or show genre edges
    graph.forEachEdge((edgeId, attributes, source, target) => {
      // Show both artist-genre and song-genre edges
      if (
        (source.startsWith(NODE_TYPES.ARTIST.prefix) &&
          target.startsWith(NODE_TYPES.GENRE.prefix)) ||
        (source.startsWith(NODE_TYPES.SONG.prefix) &&
          target.startsWith(NODE_TYPES.GENRE.prefix))
      ) {
        graph.setEdgeAttribute(edgeId, "hidden", !newShowGenres);
      }
    });
  };

  // Add spacing control slider - only update local settings
  const handleLocalSettingChange = (
    setting: string,
    value: number | boolean
  ) => {
    setLocalSettings({
      ...localSettings,
      [setting]: value,
    });
  };

  // Apply settings to the layout
  const handleApplySettings = () => {
    setLayoutSettings(localSettings);
    applySettings();
  };

  return (
    <div className="flex flex-col gap-3 w-72">
      <CollapsiblePanel title="Graph Nodes" defaultOpen={true}>
        <div className="flex flex-col gap-3">
          <button
            onClick={toggleArtists}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
          >
            {showArtists ? "Hide Artists" : "Show Artists"}
          </button>
          <button
            onClick={toggleGenres}
            className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
          >
            {showGenres ? "Hide Genres" : "Show Genres"}
          </button>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel title="Layout Options">
        <div className="flex flex-col gap-3">
          <button
            onClick={handleCircularLayout}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
          >
            Circular Layout
          </button>
          <button
            onClick={handleRandomLayout}
            className="bg-pink-600 hover:bg-pink-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
          >
            Random Layout
          </button>
        </div>
      </CollapsiblePanel>

      <CollapsiblePanel title="Force Layout Settings">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium flex justify-between text-white">
              <span>Node Spacing</span>
              <span>{localSettings.nodeSpacing}</span>
            </label>
            <input
              type="range"
              min="50"
              max="300"
              value={localSettings.nodeSpacing}
              onChange={(e) =>
                handleLocalSettingChange(
                  "nodeSpacing",
                  parseInt(e.target.value)
                )
              }
              className="w-full accent-blue-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium flex justify-between text-white">
              <span>Gravity</span>
              <span>{localSettings.gravity}</span>
            </label>
            <input
              type="range"
              min="0"
              max="10"
              step="0.1"
              value={localSettings.gravity}
              onChange={(e) =>
                handleLocalSettingChange("gravity", parseFloat(e.target.value))
              }
              className="w-full accent-blue-500"
            />
          </div>

          <div className="flex flex-col gap-2">
            <label className="text-xs font-medium flex justify-between text-white">
              <span>Scaling Force</span>
              <span>{localSettings.scalingRatio}</span>
            </label>
            <input
              type="range"
              min="1"
              max="40"
              value={localSettings.scalingRatio}
              onChange={(e) =>
                handleLocalSettingChange(
                  "scalingRatio",
                  parseInt(e.target.value)
                )
              }
              className="w-full accent-blue-500"
            />
          </div>

          <button
            onClick={handleApplySettings}
            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-md text-sm mt-2 transition-colors"
          >
            Apply Settings
          </button>
        </div>
      </CollapsiblePanel>
    </div>
  );
};

// Component that loads the graph
const LoadGraph = ({
  playlists,
  artists,
  genres,
  nodeSpacing,
}: {
  playlists: Playlist[];
  artists: Artist[];
  genres: Genre[];
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
    const genreCounts = new Map<string, number>();
    const songGenreMap = new Map<string, Set<string>>();

    // Create a map of artists by ID for quick lookup
    const artistMap = new Map<string, Artist>();
    if (artists && artists.length > 0) {
      console.log(`Building artistMap with ${artists.length} artists`);
      artists.forEach((artist) => {
        if (artist && artist.id) {
          artistMap.set(artist.id, artist);
        }
      });
      console.log(`artistMap contains ${artistMap.size} entries`);
    } else {
      console.log("No artists data available for genre mapping");
    }

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
          x: Math.random() * 2 - 1, // Spread initial positions more (-1 to 1)
          y: Math.random() * 2 - 1,
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
            x: Math.random() * 2 - 1, // Spread initial positions more (-1 to 1)
            y: Math.random() * 2 - 1,
            label: track.name,
            color: NODE_TYPES.SONG.color,
            playlistCount: 0,
          });
          songPlaylistCounts.set(songId, 0);
          songGenreMap.set(songId, new Set()); // Initialize genre set for each song
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
            color: "#333333",
            size: 0.3,
          });
        }

        // Process artists if they exist with IDs
        if (track.artistIds && track.artistIds.length > 0) {
          track.artistIds.forEach((artistId: string) => {
            // Only process artists that we have data for
            const artist = artistMap.get(artistId);
            if (!artist) return;

            const formattedArtistId = NODE_TYPES.ARTIST.prefix + artistId;

            // Add artist node if it doesn't exist
            if (!graph.hasNode(formattedArtistId)) {
              graph.addNode(formattedArtistId, {
                x: Math.random() * 2 - 1, // Spread initial positions more (-1 to 1)
                y: Math.random() * 2 - 1,
                label: artist.name,
                color: NODE_TYPES.ARTIST.color,
                size: NODE_TYPES.ARTIST.baseSize,
                hidden: true, // Hide artists by default
              });
              artistConnections.set(formattedArtistId, 0);
            }

            // Update artist connection count
            const currentArtistCount =
              artistConnections.get(formattedArtistId) || 0;
            artistConnections.set(formattedArtistId, currentArtistCount + 1);

            // Create song-artist edge with unique ID
            const songArtistEdgeId = createEdgeId(
              songId,
              formattedArtistId,
              "song-artist"
            );
            if (!graph.hasEdge(songId, formattedArtistId)) {
              graph.addEdge(songId, formattedArtistId, {
                key: songArtistEdgeId,
                color: "#333333",
                size: 0.3,
                hidden: true, // Hide artist edges by default
              });
            }

            // Process genres for this artist
            if (artist.genres && artist.genres.length > 0) {
              // Store genre references for each song for direct song-genre connections
              const songGenres = songGenreMap.get(songId) || new Set();

              artist.genres.forEach((genreName) => {
                const genreId =
                  NODE_TYPES.GENRE.prefix +
                  genreName.toLowerCase().replace(/[^a-z0-9]/g, "-");

                // Add the genre to the song's genre set
                songGenres.add(genreId);

                // Add genre node if it doesn't exist
                if (!graph.hasNode(genreId)) {
                  graph.addNode(genreId, {
                    x: Math.random() * 2 - 1, // Spread initial positions more (-1 to 1)
                    y: Math.random() * 2 - 1,
                    label: genreName,
                    color: NODE_TYPES.GENRE.color,
                    size: NODE_TYPES.GENRE.baseSize,
                    hidden: true, // Hide genres by default
                  });
                  genreCounts.set(genreId, 0);
                }

                // Update genre count
                const currentGenreCount = genreCounts.get(genreId) || 0;
                genreCounts.set(genreId, currentGenreCount + 1);

                // Create artist-genre edge with unique ID
                const artistGenreEdgeId = createEdgeId(
                  formattedArtistId,
                  genreId,
                  "artist-genre"
                );
                if (!graph.hasEdge(formattedArtistId, genreId)) {
                  graph.addEdge(formattedArtistId, genreId, {
                    key: artistGenreEdgeId,
                    color: "#333333",
                    size: 0.3,
                    hidden: true, // Hide genre edges by default
                  });
                }
              });

              // Update the song's genre set
              songGenreMap.set(songId, songGenres);
            }
          });
        }
        // For legacy support, handle artists as strings
        else if (track.artist) {
          const artists = track.artist.split(", ");
          artists.forEach((artist: string) => {
            const artistId =
              NODE_TYPES.ARTIST.prefix +
              artist.toLowerCase().replace(/[^a-z0-9]/g, "-");

            // Add artist node if it doesn't exist
            if (!graph.hasNode(artistId)) {
              graph.addNode(artistId, {
                x: Math.random() * 2 - 1, // Spread initial positions more (-1 to 1)
                y: Math.random() * 2 - 1,
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
                color: "#333333",
                size: 0.3,
                hidden: true, // Hide artist edges by default
              });
            }
          });
        }
      });
    });

    // Create direct song-genre connections
    songGenreMap.forEach((genres, songId) => {
      genres.forEach((genreId) => {
        // Create song-genre edge with unique ID
        const songGenreEdgeId = createEdgeId(songId, genreId, "song-genre");
        if (!graph.hasEdge(songId, genreId)) {
          graph.addEdge(songId, genreId, {
            key: songGenreEdgeId,
            color: "#333333",
            size: 0.3,
            hidden: true, // Hide genre edges by default
          });
        }
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
      } else if (nodeId.startsWith(NODE_TYPES.GENRE.prefix)) {
        // Scale genre size based on count
        const count = genreCounts.get(nodeId) || 0;
        const size = NODE_TYPES.GENRE.baseSize + Math.sqrt(count) * 1.2;
        const cappedSize = Math.min(size, NODE_TYPES.GENRE.maxSize);
        graph.setNodeAttribute(nodeId, "size", cappedSize);
      }
    });

    loadGraph(graph);
  }, [loadGraph, playlists, artists, genres, nodeSpacing]);

  return null;
};

export default function NetworkGraph({
  playlists,
  artists = [],
  genres = [],
}: {
  playlists: Playlist[];
  artists?: Artist[];
  genres?: Genre[];
}) {
  const [layoutSettings, setLayoutSettings] = useState({
    scalingRatio: 20, // Increased for better spacing
    gravity: 0.5, // Reduced to spread out nodes
    linLogMode: false,
    nodeSpacing: 100, // Increased default node spacing
  });

  // Create custom settings with nodeSpacing applied
  const customSettings: Partial<Settings> = {
    ...SIGMA_SETTINGS,
    labelDensity: 0.8, // Increase label density
    labelGridCellSize: 60, // Larger cell size to show more labels
    labelRenderedSizeThreshold: 6, // Show more labels
    zIndex: true, // Use z-index
    nodeReducer: (node, data) => {
      // Add styling for dark mode
      return {
        ...data,
        zIndex: data.zIndex || 0,
        // Make sure label is visible in dark mode
        labelColor: "#ffffff",
      };
    },
    edgeReducer: (edge, data) => {
      // Add styling for dark mode
      return {
        ...data,
        color: data.color || "#333333", // Use a consistent dark grey for edges
        size: data.size || 0.3, // Keep edges thin by default
      };
    },
  };

  // Handle applying settings without triggering a full reset
  const applySettings = () => {
    // Force layout refresh while keeping node positions
    // This is deliberately empty - it's used to trigger the ForceAtlas2 control
    // to update with new settings without doing a full component rerender
  };

  return (
    <div className="mb-6 relative">
      <SigmaContainer
        style={{
          height: "700px", // Increased height
          width: "100%",
          border: "none",
          borderRadius: "12px",
          backgroundColor: "#1a1c2d", // Richer dark blue background
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
        settings={customSettings}
      >
        <GraphLegend />
        <LoadGraph
          playlists={playlists}
          artists={artists}
          genres={genres}
          nodeSpacing={layoutSettings.nodeSpacing}
        />
        <ControlsContainer position={"bottom-right"}>
          <div className="flex flex-col gap-3 m-3">
            <div className="flex items-center gap-2 bg-gray-800/90 text-white p-3 rounded-lg shadow-lg border border-gray-700">
              <span className="text-xs font-medium">Force layout:</span>
              <div className="flex items-center gap-1">
                <LayoutForceAtlas2Control
                  settings={{
                    settings: {
                      adjustSizes: true, // Prevent node collisions
                      scalingRatio: layoutSettings.scalingRatio, // Control the force intensity
                      gravity: layoutSettings.gravity, // Higher gravity pulls nodes to center
                      slowDown: 3, // Reduces movement speed
                      barnesHutOptimize: true, // Better performance for large graphs
                      barnesHutTheta: 0.5, // Precision of optimization (0.5-1.2)
                      linLogMode: layoutSettings.linLogMode, // Linear-linear mode for cleaner distribution
                      outboundAttractionDistribution: true, // Better spread for connected nodes
                      edgeWeightInfluence: 1, // Consider edge weights
                    },
                  }}
                />
                <span className="text-xs text-gray-300">(optimizes graph)</span>
              </div>
            </div>
            <InteractionControls
              setLayoutSettings={setLayoutSettings}
              layoutSettings={layoutSettings}
              applySettings={applySettings}
            />
          </div>
        </ControlsContainer>
      </SigmaContainer>
    </div>
  );
}
