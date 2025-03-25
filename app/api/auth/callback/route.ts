import { NextResponse } from "next/server";

const redirectURI = process.env.BASE_URL! + "/api/auth/callback";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(new URL(`/?error=${error}`, request.url));
  }

  if (!code || !state) {
    return NextResponse.redirect(
      new URL("/?error=missing_params", request.url)
    );
  }

  try {
    const tokenResponse = await fetch(
      "https://accounts.spotify.com/api/token",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Authorization: `Basic ${Buffer.from(
            `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
          ).toString("base64")}`,
        },
        body: new URLSearchParams({
          grant_type: "authorization_code",
          code,
          redirect_uri: redirectURI,
        }),
      }
    );

    const data = await tokenResponse.json();

    if (!tokenResponse.ok) {
      throw new Error(data.error || "Failed to get access token");
    }

    // For client-side auth, include the token in the URL
    // The AuthProvider will extract it and store in localStorage
    return NextResponse.redirect(
      new URL(`/?token=${data.access_token}`, redirectURI)
    );
  } catch (error) {
    console.error("Error during token exchange:", error);
    return NextResponse.redirect(
      new URL("/?error=token_exchange_failed", request.url)
    );
  }
}
