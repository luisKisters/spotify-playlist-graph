import { NextResponse } from "next/server";
import { generateRandomString } from "@/lib/authUtils";

const redirectURI = process.env.BASE_URL! + "/api/auth/callback";

export async function GET() {
  const state = generateRandomString(16);
  const scope =
    "user-read-private user-read-email playlist-modify-public playlist-read-private";

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: scope,
    redirect_uri: redirectURI,
    state: state,
    show_dialog: "true",
  });
  console.log(encodeURIComponent(params.toString()));

  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params.toString()}`
  );
}
