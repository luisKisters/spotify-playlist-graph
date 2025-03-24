import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export function generateRandomString(length: number): string {
  const possible =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  const values = crypto.getRandomValues(new Uint8Array(length));
  return values.reduce((acc, x) => acc + possible[x % possible.length], "");
}

export async function getSpotifyAccessToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("spotify_access_token")?.value;
}

export async function getSpotifyRefreshToken(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get("spotify_refresh_token")?.value;
}

export async function refreshSpotifyToken(): Promise<string | null> {
  const refreshToken = await getSpotifyRefreshToken();
  if (!refreshToken) return null;

  try {
    const response = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
        ).toString("base64")}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Failed to refresh token");

    return data.access_token;
  } catch (error) {
    console.error("Error refreshing token:", error);
    return null;
  }
}

export const getRefreshToken = async () => {
  const cookieStore = await cookies();
  // refresh token that has been previously stored
  const refreshToken = cookieStore.get("spotify_refresh_token")?.value;
  if (!refreshToken) {
    console.error("No refresh token found");
    console.log("redirecting to login");
    return NextResponse.redirect(
      new URL("/api/auth/login", process.env.BASE_URL!)
    );
  }
  const url = "https://accounts.spotify.com/api/token";

  const payload = {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(
        `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
      ).toString("base64")}`,
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.SPOTIFY_CLIENT_ID || "",
    }),
  };
  const body = await fetch(url, payload);

  if (!body.ok) {
    throw new Error("Failed to refresh token");
  }
  const response = await body.json();
  console.log("responsee", response);

  return {
    access_token: response.access_token,
    refresh_token: response.refresh_token,
    response: response,
  };
};
