import { NextResponse } from "next/server";
import { generateRandomString } from "@/lib/authUtils";

// const redirectURI = process.env.BASE_URL! + "/api/auth/callback";

export async function GET() {
  const state = generateRandomString(16);
  const scope =
    "user-read-private user-read-email playlist-modify-public playlist-read-private";

  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is not set");
  }

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: scope,
    redirect_uri: "http://localhost:3000/api/auth/callback",
    // redirect_uri: redirectURI,
    state: state,
    show_dialog: "true",
  });
  console.log(params.toString());

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
}
