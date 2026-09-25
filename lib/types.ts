export interface ArtistRef {
  id: string;
  name: string;
}

export interface Track {
  id: string;
  name: string;
  artists: ArtistRef[];
  album: string;
  image: string | null;
  url: string;
  duration: number;
}

export interface PlaylistSummary {
  id: string;
  name: string;
  owner: string;
  image: string | null;
  url: string;
  snapshot: string;
  total: number;
}

export interface Playlist extends PlaylistSummary {
  tracks: Track[];
}

export interface User {
  id: string;
  name: string;
  image: string | null;
}
