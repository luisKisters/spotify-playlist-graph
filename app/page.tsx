"use client";

const TOKEN = process.env.SPOTIFY_TOKEN;

export default function Home() {
  return (
    <div>
      <h1>Hello World</h1>
      <button
        onClick={() => {
          fetch("https://api.spotify.com/v1/me/playlists", {
            headers: {
              Authorization: `Bearer ${TOKEN}`,
            },
          })
            .then((res) => res.json())
            .then((data) => console.log(data));
        }}
      >
        Get Playlists
      </button>
    </div>
  );
}
