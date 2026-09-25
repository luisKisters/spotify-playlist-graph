# Playlist Graph

[![Vercel](https://vercelbadge.vercel.app/api/luiskisters/spotify-playlist-graph)](https://spotify-playlist-graph.vercel.app)

See how your Spotify playlists connect: which ones overlap, which artists and
songs tie them together, and where you've added the same song twice.

Live: [spotify-playlist-graph.vercel.app](https://spotify-playlist-graph.vercel.app) ·
no Spotify account needed for the demo (`/?demo`).

## Features

- **Playlist map**: playlists are linked by shared songs and artists and
  grouped into clusters, coloured either by overlap or by dominant genre.
- **Artists / Songs / Genres views**: see which artists, tracks and genres
  bridge your playlists.
- **Density control** from sparse to dense for every view.
- **Details panel**: closest playlists with the exact songs they share, top
  artists, how much of a playlist is unique, duplicates and alternate versions.
- **Search** across playlists, artists and songs.
- **Fast reloads**: playlists are cached in IndexedDB and only re-fetched when
  Spotify reports a change (snapshot id).
- **Demo mode** with generated data.

## How it works

- Spotify login uses the authorization code flow. Tokens live in httpOnly
  cookies and are refreshed automatically on the server.
- Scopes: `playlist-read-private playlist-read-collaborative` (read-only).
- Uses the post-February-2026 Web API (`/playlists/{id}/items`). Spotify only
  lets Development Mode apps read playlists the user owns or collaborates on,
  and no longer returns artist genres. Genres are looked up from Last.fm tags
  when `LASTFM_API_KEY` is set (free key at https://www.last.fm/api/account/create,
  fast), otherwise from MusicBrainz (no key, about one artist per second).
  Results are cached in the browser for 30 days.
- Graph rendering: [sigma.js](https://www.sigmajs.org/) (WebGL) + graphology
  (ForceAtlas2 layout, Louvain clustering).

## Development

1. Create an app in the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard)
   and add the redirect URI `http://127.0.0.1:3000/api/auth/callback`
   (Spotify doesn't accept `localhost`). In Development Mode, add every
   account that should be able to log in under **User Management**.
2. Create `.env.local`:

   ```env
   SPOTIFY_CLIENT_ID=your_client_id
   SPOTIFY_CLIENT_SECRET=your_client_secret
   BASE_URL=http://127.0.0.1:3000
   # optional, makes genre lookup much faster
   LASTFM_API_KEY=your_lastfm_key
   ```

3. Run it:

   ```bash
   pnpm install
   pnpm dev
   ```

   Open http://127.0.0.1:3000.

## Deployment (Vercel)

Set the same three environment variables in the Vercel project, with
`BASE_URL` set to the production URL (e.g. `https://spotify-playlist-graph.vercel.app`),
and register `${BASE_URL}/api/auth/callback` as a redirect URI in the Spotify
dashboard. If `BASE_URL` is unset, the request origin is used.
