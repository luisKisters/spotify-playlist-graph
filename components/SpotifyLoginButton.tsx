"use client";

export default function SpotifyLoginButton() {
  const handleLogin = () => {
    window.location.href = "/api/auth/login";
  };

  return (
    <button
      onClick={handleLogin}
      className="bg-[#1DB954] text-white px-6 py-3 rounded-full font-semibold hover:bg-[#1ed760] transition-colors"
    >
      Login with Spotify
    </button>
  );
}
