export interface Track {
  name: string;
  artist: string;
  album: string;
  image?: string;
  url: string;
  uri: string;
  duration: number;
  artistIds?: string[]; // Array of Spotify artist IDs
}

export interface Artist {
  id: string;
  name: string;
  genres: string[];
  image?: string;
}

export interface Genre {
  name: string;
  count: number;
}

export interface Playlist {
  id: string;
  name: string;
  owner: string;
  image?: string;
  description?: string;
  url: string;
  tracks: Track[];
}
