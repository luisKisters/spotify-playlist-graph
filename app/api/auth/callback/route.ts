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

    // Store the tokens in cookies
    const response = NextResponse.redirect(
      new URL("/api/playlists", redirectURI)
    );

    response.cookies.set("spotify_access_token", data.access_token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: data.expires_in,
    });

    if (data.refresh_token) {
      response.cookies.set("spotify_refresh_token", data.refresh_token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 30 * 24 * 60 * 60, // 30 days
      });
    }

    return response;
  } catch (error) {
    console.error("Error during token exchange:", error);
    return NextResponse.redirect(
      new URL("/?error=token_exchange_failed", request.url)
    );
  }
}
