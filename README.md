# 🎵 Spotify Playlist Graph

[![Vercel](https://vercelbadge.vercel.app/api/luiskisters/spotify-playlist-graph)](https://spotify-playlist-graph.vercel.app)

**Visualize your Spotify playlists as an interactive network graph. Explore how your playlists, tracks, artists, and genres connect!**

---

## ✨ Features

- **Spotify Login:** Securely authenticate with your Spotify account.
- **Playlist Graph:** Visualize playlists, tracks, artists, and genres as a network.
- **Genre & Artist Insights:** See how your music taste connects across genres and artists.
- **Node Distance Control:** Adjust the spacing between nodes in the graph interactively.
- **Caching:** Data is cached locally for fast reloads.

## 🚀 Demo

Check out the live app: [spotify-playlist-graph.vercel.app](https://spotify-playlist-graph.vercel.app)

## 🛠️ Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/luiskisters/spotify-playlist-graph.git
cd spotify-playlist-graph
```

### 2. Install dependencies

```bash
pnpm install # or npm install or yarn install
```

### 3. Set up environment variables

Create a `.env.local` file in the root directory with the following variables:

```env
SPOTIFY_CLIENT_ID=your_spotify_client_id
SPOTIFY_CLIENT_SECRET=your_spotify_client_secret
BASE_URL=http://localhost:3000
```

- Get your Spotify credentials from the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard/applications).
- Set `BASE_URL` to your local dev URL or your deployed URL on Vercel.

### 4. Run the development server

```bash
pnpm dev # or npm run dev or yarn dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## ☁️ Deployment

This app is ready to deploy on [Vercel](https://vercel.com/). Just set the same environment variables in your Vercel project settings.

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new?repo=https://github.com/luiskisters/spotify-playlist-graph)

---

**Short repo description:**  
Visualize your Spotify playlists, tracks, artists, and genres as an interactive network graph.

Let me know if you want this written directly to your README.md or need any more tweaks!
