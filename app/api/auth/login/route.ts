import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { COOKIE, assertEnv, getRedirectUri } from "@/lib/spotify";

const SCOPES = "playlist-read-private playlist-read-collaborative";

export async function GET(request: Request) {
  assertEnv();
  const state = crypto.randomUUID();
  (await cookies()).set(COOKIE.state, state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 600,
  });

  const params = new URLSearchParams({
    response_type: "code",
    client_id: process.env.SPOTIFY_CLIENT_ID!,
    scope: SCOPES,
    redirect_uri: getRedirectUri(request.url),
    state,
  });
  return NextResponse.redirect(
    `https://accounts.spotify.com/authorize?${params}`
  );
}
