"use client";

import { useEffect, useRef, useState } from "react";
import { Network, Options } from "vis-network";
import { DataSet } from "vis-data";
import { Playlist, Track, Artist, Genre } from "../types/spotify";

// Define node types and colors
const NODE_TYPES = {
  PLAYLIST: {
    color: "#5865F2", // Discord blue
    prefix: "playlist-",
    baseSize: 5,
    maxSize: 15,
  },
  SONG: {
    color: "#4CA3FD", // Light blue
    prefix: "song-",
    baseSize: 3,
    maxSize: 10,
  },
  ARTIST: {
    color: "#EB459E", // Pink
    prefix: "artist-",
    baseSize: 4,
    maxSize: 12,
  },
  GENRE: {
    color: "#9B59B6", // Purple
    prefix: "genre-",
    baseSize: 4,
    maxSize: 14,
  },
} as const;

// Define vis.js network options
const NETWORK_OPTIONS: Options = {
  nodes: {
    shape: "dot",
    font: {
      color: "#ffffff",
      size: 14,
    },
    borderWidth: 0,
    shadow: true,
  },
  edges: {
    color: {
      color: "#4a4a4a",
      highlight: "#666666",
    },
    width: 0.3,
    smooth: {
      enabled: true,
      type: "continuous",
      roundness: 0.5,
    },
  },
  physics: {
    enabled: true,
    stabilization: {
      enabled: true,
      iterations: 1000,
      updateInterval: 25,
      onlyDynamicEdges: false,
      fit: true,
    },
    barnesHut: {
      gravitationalConstant: -10000,
      centralGravity: 0.1,
      springLength: 400,
      springConstant: 0.01,
      damping: 0.5,
      avoidOverlap: 1,
    },
    minVelocity: 0.1,
    maxVelocity: 10,
    solver: "barnesHut",
  },
  interaction: {
    hover: true,
    tooltipDelay: 200,
    hideEdgesOnDrag: true,
    multiselect: true,
  },
};

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

// Interaction Controls Component
const InteractionControls = ({
  network,
  showArtists,
  setShowArtists,
  showGenres,
  setShowGenres,
}: {
  network: Network | null;
  showArtists: boolean;
  setShowArtists: (show: boolean) => void;
  showGenres: boolean;
  setShowGenres: (show: boolean) => void;
}) => {
  const toggleArtists = () => {
    const newShowArtists = !showArtists;
    setShowArtists(newShowArtists);

    if (network) {
      const nodes = network.getPositions();
      Object.keys(nodes).forEach((nodeId) => {
        if (nodeId.startsWith(NODE_TYPES.ARTIST.prefix)) {
          network.updateClusteredNode(nodeId, { hidden: !newShowArtists });
        }
      });
      network.redraw();
    }
  };

  const toggleGenres = () => {
    const newShowGenres = !showGenres;
    setShowGenres(newShowGenres);

    if (network) {
      const nodes = network.getPositions();
      Object.keys(nodes).forEach((nodeId) => {
        if (nodeId.startsWith(NODE_TYPES.GENRE.prefix)) {
          network.updateClusteredNode(nodeId, { hidden: !newShowGenres });
        }
      });
      network.redraw();
    }
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
            onClick={() => network?.stabilize()}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-md text-sm transition-colors"
          >
            Force Layout
          </button>
        </div>
      </CollapsiblePanel>
    </div>
  );
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
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [showArtists, setShowArtists] = useState(false);
  const [showGenres, setShowGenres] = useState(false);

  useEffect(() => {
    if (!containerRef.current) return;

    // Create nodes and edges datasets
    const nodes = new DataSet<any>();
    const edges = new DataSet<any>();

    // Maps to track node connections
    const playlistSongCounts = new Map<string, number>();
    const songPlaylistCounts = new Map<string, number>();
    const artistConnections = new Map<string, number>();
    const genreCounts = new Map<string, number>();
    const songGenreMap = new Map<string, Set<string>>();

    // Create a map of artists by ID for quick lookup
    const artistMap = new Map<string, Artist>();
    artists.forEach((artist) => {
      if (artist && artist.id) {
        artistMap.set(artist.id, artist);
      }
    });

    // Helper function to create a unique edge ID
    const createEdgeId = (source: string, target: string, type: string) => {
      return `${source}-${target}-${type}`;
    };

    // First pass: Create all nodes and track connections
    playlists.forEach((playlist) => {
      const playlistId = NODE_TYPES.PLAYLIST.prefix + playlist.id;
      const songCount = playlist.tracks.length;

      // Add playlist node
      if (!nodes.get(playlistId)) {
        nodes.add({
          id: playlistId,
          label: playlist.name,
          color: NODE_TYPES.PLAYLIST.color,
          size: NODE_TYPES.PLAYLIST.baseSize,
          x: Math.random() * 1000,
          y: Math.random() * 1000,
        });
      }
      playlistSongCounts.set(playlistId, songCount);

      // Process tracks
      playlist.tracks.forEach((track: Track) => {
        const songId = NODE_TYPES.SONG.prefix + track.uri;

        // Add song node
        if (!nodes.get(songId)) {
          nodes.add({
            id: songId,
            label: track.name,
            color: NODE_TYPES.SONG.color,
            size: NODE_TYPES.SONG.baseSize,
            x: Math.random() * 1000,
            y: Math.random() * 1000,
          });
        }
        songPlaylistCounts.set(songId, 0);
        songGenreMap.set(songId, new Set());

        // Create playlist-song edge
        const playlistSongEdgeId = createEdgeId(
          playlistId,
          songId,
          "playlist-song"
        );
        if (!edges.get(playlistSongEdgeId)) {
          edges.add({
            id: playlistSongEdgeId,
            from: playlistId,
            to: songId,
            color: "#333333",
            width: 0.3,
          });
        }

        // Process artists
        if (track.artistIds && track.artistIds.length > 0) {
          track.artistIds.forEach((artistId: string) => {
            const artist = artistMap.get(artistId);
            if (!artist) return;

            const formattedArtistId = NODE_TYPES.ARTIST.prefix + artistId;

            // Add artist node
            if (!nodes.get(formattedArtistId)) {
              nodes.add({
                id: formattedArtistId,
                label: artist.name,
                color: NODE_TYPES.ARTIST.color,
                size: NODE_TYPES.ARTIST.baseSize,
                x: Math.random() * 1000,
                y: Math.random() * 1000,
                hidden: true,
              });
            }
            artistConnections.set(formattedArtistId, 0);

            // Create song-artist edge
            const songArtistEdgeId = createEdgeId(
              songId,
              formattedArtistId,
              "song-artist"
            );
            if (!edges.get(songArtistEdgeId)) {
              edges.add({
                id: songArtistEdgeId,
                from: songId,
                to: formattedArtistId,
                color: "#333333",
                width: 0.3,
                hidden: true,
              });
            }

            // Process genres
            if (artist.genres && artist.genres.length > 0) {
              const songGenres = songGenreMap.get(songId) || new Set();

              artist.genres.forEach((genreName) => {
                const genreId =
                  NODE_TYPES.GENRE.prefix +
                  genreName.toLowerCase().replace(/[^a-z0-9]/g, "-");

                songGenres.add(genreId);

                // Add genre node
                if (!nodes.get(genreId)) {
                  nodes.add({
                    id: genreId,
                    label: genreName,
                    color: NODE_TYPES.GENRE.color,
                    size: NODE_TYPES.GENRE.baseSize,
                    x: Math.random() * 1000,
                    y: Math.random() * 1000,
                    hidden: true,
                  });
                }
                genreCounts.set(genreId, 0);

                // Create artist-genre edge
                const artistGenreEdgeId = createEdgeId(
                  formattedArtistId,
                  genreId,
                  "artist-genre"
                );
                if (!edges.get(artistGenreEdgeId)) {
                  edges.add({
                    id: artistGenreEdgeId,
                    from: formattedArtistId,
                    to: genreId,
                    color: "#333333",
                    width: 0.3,
                    hidden: true,
                  });
                }
              });

              songGenreMap.set(songId, songGenres);
            }
          });
        }
      });
    });

    // Create direct song-genre connections
    songGenreMap.forEach((genres, songId) => {
      genres.forEach((genreId) => {
        edges.add({
          id: createEdgeId(songId, genreId, "song-genre"),
          from: songId,
          to: genreId,
          color: "#333333",
          width: 0.3,
          hidden: true,
        });
      });
    });

    // Update node sizes based on connections
    nodes.forEach((node: { id: string; size: number }) => {
      if (node.id.startsWith(NODE_TYPES.PLAYLIST.prefix)) {
        const songCount = playlistSongCounts.get(node.id) || 0;
        const size = NODE_TYPES.PLAYLIST.baseSize + Math.sqrt(songCount) * 1.5;
        nodes.update({
          ...node,
          size: Math.min(size, NODE_TYPES.PLAYLIST.maxSize),
        });
      } else if (node.id.startsWith(NODE_TYPES.SONG.prefix)) {
        const playlistCount = songPlaylistCounts.get(node.id) || 0;
        const size =
          NODE_TYPES.SONG.baseSize +
          (playlistCount > 1 ? Math.sqrt(playlistCount) : 0);
        nodes.update({
          ...node,
          size: Math.min(size, NODE_TYPES.SONG.maxSize),
        });
      } else if (node.id.startsWith(NODE_TYPES.ARTIST.prefix)) {
        const connections = artistConnections.get(node.id) || 0;
        const size = NODE_TYPES.ARTIST.baseSize + Math.sqrt(connections) * 0.8;
        nodes.update({
          ...node,
          size: Math.min(size, NODE_TYPES.ARTIST.maxSize),
        });
      } else if (node.id.startsWith(NODE_TYPES.GENRE.prefix)) {
        const count = genreCounts.get(node.id) || 0;
        const size = NODE_TYPES.GENRE.baseSize + Math.sqrt(count) * 1.2;
        nodes.update({
          ...node,
          size: Math.min(size, NODE_TYPES.GENRE.maxSize),
        });
      }
    });

    // Initialize the network
    const network = new Network(
      containerRef.current,
      { nodes, edges },
      NETWORK_OPTIONS
    );

    networkRef.current = network;

    // Stabilize the network and then disable physics
    network.once("stabilizationIterationsDone", () => {
      network.setOptions({ physics: false });
    });

    // Cleanup
    return () => {
      network.destroy();
    };
  }, [playlists, artists, genres]);

  return (
    <div className="mb-6 relative">
      <div
        ref={containerRef}
        style={{
          height: "700px",
          width: "100%",
          border: "none",
          borderRadius: "12px",
          backgroundColor: "#1a1c2d",
          overflow: "hidden",
          boxShadow: "0 4px 20px rgba(0, 0, 0, 0.3)",
        }}
      />
      <GraphLegend />
      <div className="absolute bottom-4 right-4">
        <InteractionControls
          network={networkRef.current}
          showArtists={showArtists}
          setShowArtists={setShowArtists}
          showGenres={showGenres}
          setShowGenres={setShowGenres}
        />
      </div>
    </div>
  );
}
