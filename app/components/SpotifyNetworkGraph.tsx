"use client";

import { useEffect, useRef, useState } from "react";
import { Playlist, Artist, Genre } from "../types/spotify";
import { DataSet, Network, IdType, Options } from "vis-network/standalone";

interface SpotifyNetworkGraphProps {
  playlists: Playlist[];
  artists: Artist[];
  genres: Genre[];
}

// Define node types and colors
const NODE_TYPES = {
  PLAYLIST: {
    color: "#FF6384",
    prefix: "p_",
    baseSize: 10,
    maxSize: 30,
  },
  SONG: {
    color: "#4CA3FD",
    prefix: "s_",
    baseSize: 5,
    maxSize: 15,
  },
  ARTIST: {
    color: "#36A2EB",
    prefix: "a_",
    baseSize: 8,
    maxSize: 20,
  },
  GENRE: {
    color: "#FFCE56",
    prefix: "g_",
    baseSize: 8,
    maxSize: 25,
  },
};

export default function SpotifyNetworkGraph({
  playlists,
  artists,
  genres,
}: SpotifyNetworkGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<Network | null>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [isStabilizing, setIsStabilizing] = useState(false);

  useEffect(() => {
    // Skip if no data or no container
    if (!containerRef.current) return;

    // Don't recreate if already initialized, just update data
    if (networkRef.current) {
      networkRef.current.destroy();
      networkRef.current = null;
    }

    if (!playlists.length) {
      return;
    }

    // Create nodes and edges datasets
    const nodes = new DataSet<any>();
    const edges = new DataSet<any>();
    let allNodes: Record<string, any> = {};
    let highlightActive = false;

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
      if (!playlist?.id) return;

      const playlistId = NODE_TYPES.PLAYLIST.prefix + playlist.id;
      const songCount = playlist.tracks?.length || 0;

      // Add playlist node
      if (!nodes.get(playlistId)) {
        nodes.add({
          id: playlistId,
          label: playlist.name || "Unnamed Playlist",
          group: "playlist",
          value: (playlist.tracks?.length || 1) * 2,
          title: `${playlist.name}: ${playlist.tracks?.length || 0} tracks`,
          color: NODE_TYPES.PLAYLIST.color,
        });
      }
      playlistSongCounts.set(playlistId, songCount);
      allNodes[playlistId] = nodes.get(playlistId);

      // Process tracks
      playlist.tracks?.forEach((track) => {
        if (!track.uri) return;

        const songId = NODE_TYPES.SONG.prefix + track.uri;

        // Add song node
        if (!nodes.get(songId)) {
          nodes.add({
            id: songId,
            label: track.name || "Unknown Track",
            group: "song",
            value: 3,
            title: track.name,
            color: NODE_TYPES.SONG.color,
          });
        }
        songPlaylistCounts.set(
          songId,
          (songPlaylistCounts.get(songId) || 0) + 1
        );
        songGenreMap.set(songId, new Set());
        allNodes[songId] = nodes.get(songId);

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
          });
        }

        // Process artists
        if (track.artistIds && track.artistIds.length > 0) {
          track.artistIds.forEach((artistId) => {
            const artist = artistMap.get(artistId);
            if (!artist) return;

            const formattedArtistId = NODE_TYPES.ARTIST.prefix + artistId;

            // Add artist node
            if (!nodes.get(formattedArtistId)) {
              nodes.add({
                id: formattedArtistId,
                label: artist.name || "Unknown Artist",
                group: "artist",
                value: 5,
                title: `${artist.name}: ${artist.genres?.length || 0} genres`,
                color: NODE_TYPES.ARTIST.color,
              });
            }
            artistConnections.set(
              formattedArtistId,
              (artistConnections.get(formattedArtistId) || 0) + 1
            );
            allNodes[formattedArtistId] = nodes.get(formattedArtistId);

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
              });
            }

            // Process genres
            if (artist.genres && artist.genres.length > 0) {
              const songGenres = songGenreMap.get(songId) || new Set();

              artist.genres.forEach((genreName) => {
                if (!genreName) return;

                const genreId = NODE_TYPES.GENRE.prefix + genreName;

                songGenres.add(genreId);

                // Add genre node
                if (!nodes.get(genreId)) {
                  nodes.add({
                    id: genreId,
                    label: genreName,
                    group: "genre",
                    value: Math.min(
                      genres.find((g) => g.name === genreName)?.count || 1,
                      10
                    ),
                    title: `${genreName}: ${
                      genres.find((g) => g.name === genreName)?.count || 0
                    } artists`,
                    color: NODE_TYPES.GENRE.color,
                  });
                }
                genreCounts.set(genreId, (genreCounts.get(genreId) || 0) + 1);
                allNodes[genreId] = nodes.get(genreId);

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
        const songGenreEdgeId = createEdgeId(songId, genreId, "song-genre");
        if (!edges.get(songGenreEdgeId)) {
          edges.add({
            id: songGenreEdgeId,
            from: songId,
            to: genreId,
          });
        }
      });
    });

    // Update node sizes based on connections
    nodes.forEach((node) => {
      if (node.id.startsWith(NODE_TYPES.PLAYLIST.prefix)) {
        const songCount = playlistSongCounts.get(node.id) || 0;
        const size = NODE_TYPES.PLAYLIST.baseSize + Math.sqrt(songCount) * 1.5;
        nodes.update({
          id: node.id,
          value: Math.min(size, NODE_TYPES.PLAYLIST.maxSize),
        });
      } else if (node.id.startsWith(NODE_TYPES.SONG.prefix)) {
        const playlistCount = songPlaylistCounts.get(node.id) || 0;
        const size =
          NODE_TYPES.SONG.baseSize +
          (playlistCount > 1 ? Math.sqrt(playlistCount) : 0);
        nodes.update({
          id: node.id,
          value: Math.min(size, NODE_TYPES.SONG.maxSize),
        });
      } else if (node.id.startsWith(NODE_TYPES.ARTIST.prefix)) {
        const connections = artistConnections.get(node.id) || 0;
        const size = NODE_TYPES.ARTIST.baseSize + Math.sqrt(connections) * 0.8;
        nodes.update({
          id: node.id,
          value: Math.min(size, NODE_TYPES.ARTIST.maxSize),
        });
      } else if (node.id.startsWith(NODE_TYPES.GENRE.prefix)) {
        const count = genreCounts.get(node.id) || 0;
        const size = NODE_TYPES.GENRE.baseSize + Math.sqrt(count) * 1.2;
        nodes.update({
          id: node.id,
          value: Math.min(size, NODE_TYPES.GENRE.maxSize),
        });
      }
    });

    const options: Options = {
      nodes: {
        shape: "dot",
        scaling: {
          min: 10,
          max: 30,
          label: {
            min: 14, // Increased from 8
            max: 40, // Increased from 30
            drawThreshold: 8, // Decreased from 12 to show labels earlier
            maxVisible: 30, // Increased from 20
          },
        },
        font: {
          size: 16, // Increased from 12
          face: "Tahoma",
        },
      },
      edges: {
        width: 0.15,
        color: { inherit: "from" },
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
          iterations: 200, // Increased for better initial layout
          updateInterval: 25,
          onlyDynamicEdges: false,
          fit: true,
        },
        barnesHut: {
          gravitationalConstant: -10000,
          springConstant: 0.001,
          springLength: 200,
        },
      },
      interaction: {
        tooltipDelay: 200,
        hideEdgesOnDrag: false,
        hideEdgesOnZoom: false,
        multiselect: false,
        navigationButtons: true,
        zoomView: true,
      },
      groups: {
        playlist: { color: { background: "#FF6384", border: "#FF6384" } },
        artist: { color: { background: "#36A2EB", border: "#36A2EB" } },
        genre: { color: { background: "#FFCE56", border: "#FFCE56" } },
        song: { color: { background: "#4CA3FD", border: "#4CA3FD" } },
      },
    };

    // Create network
    const network = new Network(
      containerRef.current,
      { nodes, edges },
      options
    );

    networkRef.current = network;
    setIsInitialized(true);
    setIsStabilizing(true);

    // Update allNodes ref with the latest nodes
    allNodes = nodes.get({ returnType: "Object" });

    // Disable physics after stabilization to prevent node movement
    network.once("stabilizationIterationsDone", () => {
      // Fit the network to view
      network.fit();

      // Disable physics to prevent further movement
      network.setOptions({ physics: { enabled: false } });
      setIsStabilizing(false);
    });

    // Neighborhood highlight function
    function neighbourhoodHighlight(params: any) {
      // if something is selected:
      if (params.nodes.length > 0) {
        highlightActive = true;
        const selectedNode = params.nodes[0] as IdType;
        const degrees = 2;

        // mark all nodes as hard to read.
        for (const nodeId in allNodes) {
          allNodes[nodeId].color = "rgba(200,200,200,0.5)";
          if (allNodes[nodeId].hiddenLabel === undefined) {
            allNodes[nodeId].hiddenLabel = allNodes[nodeId].label;
            allNodes[nodeId].label = undefined;
          }
        }

        const connectedNodes = network.getConnectedNodes(
          selectedNode
        ) as IdType[];
        let allConnectedNodes: IdType[] = [];

        // get the second degree nodes
        for (let i = 1; i < degrees; i++) {
          for (let j = 0; j < connectedNodes.length; j++) {
            const connections = network.getConnectedNodes(
              connectedNodes[j]
            ) as IdType[];
            allConnectedNodes = allConnectedNodes.concat(connections);
          }
        }

        // all second degree nodes get a different color and their label back
        for (let i = 0; i < allConnectedNodes.length; i++) {
          const nodeId = allConnectedNodes[i] as string;
          allNodes[nodeId].color = "rgba(150,150,150,0.75)";
          if (allNodes[nodeId].hiddenLabel !== undefined) {
            allNodes[nodeId].label = allNodes[nodeId].hiddenLabel;
            allNodes[nodeId].hiddenLabel = undefined;
          }
        }

        // all first degree nodes get their own color and their label back
        for (let i = 0; i < connectedNodes.length; i++) {
          const nodeId = connectedNodes[i] as string;
          allNodes[nodeId].color = undefined;
          if (allNodes[nodeId].hiddenLabel !== undefined) {
            allNodes[nodeId].label = allNodes[nodeId].hiddenLabel;
            allNodes[nodeId].hiddenLabel = undefined;
          }
        }

        // the main node gets its own color and its label back.
        const mainNodeId = selectedNode as string;
        allNodes[mainNodeId].color = undefined;
        if (allNodes[mainNodeId].hiddenLabel !== undefined) {
          allNodes[mainNodeId].label = allNodes[mainNodeId].hiddenLabel;
          allNodes[mainNodeId].hiddenLabel = undefined;
        }
      } else if (highlightActive === true) {
        // reset all nodes
        for (const nodeId in allNodes) {
          allNodes[nodeId].color = undefined;
          if (allNodes[nodeId].hiddenLabel !== undefined) {
            allNodes[nodeId].label = allNodes[nodeId].hiddenLabel;
            allNodes[nodeId].hiddenLabel = undefined;
          }
        }
        highlightActive = false;
      }

      // transform the object into an array
      const updateArray = [];
      for (const nodeId in allNodes) {
        if (allNodes.hasOwnProperty(nodeId)) {
          updateArray.push(allNodes[nodeId]);
        }
      }
      nodes.update(updateArray);
    }

    // Register click event
    network.on("click", neighbourhoodHighlight);

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
        networkRef.current = null;
        setIsInitialized(false);
      }
    };
  }, [playlists, artists, genres]);

  return (
    <div className="w-full">
      <div
        className="border rounded-lg bg-white"
        style={{ height: "500px" }}
        ref={containerRef}
        id="mynetwork"
      >
        {!isInitialized && playlists.length === 0 && (
          <div className="flex h-full items-center justify-center text-gray-500">
            No playlist data available to display
          </div>
        )}
        {isStabilizing && (
          <div className="absolute inset-0 flex items-center justify-center bg-white bg-opacity-70">
            <div className="text-gray-700">Stabilizing network...</div>
          </div>
        )}
      </div>
    </div>
  );
}
