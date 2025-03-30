export interface Track {
  name: string;
  artist: string;
  album: string;
  image?: string;
  url: string;
  uri: string;
  duration: number;
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
