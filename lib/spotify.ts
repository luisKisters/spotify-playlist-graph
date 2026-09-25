import { cookies } from "next/headers";
import { NextResponse } from "next/server";

export const SPOTIFY_API = "https://api.spotify.com/v1";
const TOKEN_URL = "https://accounts.spotify.com/api/token";

export const COOKIE = {
  access: "sp_at",
  refresh: "sp_rt",
  expires: "sp_exp",
  state: "sp_state",
} as const;

export class SpotifyAuthError extends Error {}

export function getRedirectUri(requestUrl: string) {
  const base = process.env.BASE_URL || new URL(requestUrl).origin;
  return base.replace(/\/$/, "") + "/api/auth/callback";
}

export function assertEnv() {
  if (!process.env.SPOTIFY_CLIENT_ID || !process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error("SPOTIFY_CLIENT_ID or SPOTIFY_CLIENT_SECRET is not set");
  }
}

function basicAuth() {
  return (
    "Basic " +
    Buffer.from(
      `${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`
    ).toString("base64")
  );
}

export async function requestToken(params: Record<string, string>) {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: basicAuth(),
    },
    body: new URLSearchParams(params),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new SpotifyAuthError(data.error_description || data.error);
  }
  return data as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
  };
}

const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  path: "/",
};

export async function storeTokens(token: {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
}) {
  const store = await cookies();
  store.set(COOKIE.access, token.access_token, {
    ...cookieOptions,
    maxAge: token.expires_in,
  });
  store.set(COOKIE.expires, String(Date.now() + token.expires_in * 1000), {
    ...cookieOptions,
    maxAge: 60 * 60 * 24 * 30,
  });
  if (token.refresh_token) {
    store.set(COOKIE.refresh, token.refresh_token, {
      ...cookieOptions,
      maxAge: 60 * 60 * 24 * 30,
    });
  }
}

export async function clearTokens() {
  const store = await cookies();
  for (const name of Object.values(COOKIE)) store.delete(name);
}

/** Returns a valid access token, refreshing it when it is about to expire. */
export async function getAccessToken(): Promise<string> {
  const store = await cookies();
  const access = store.get(COOKIE.access)?.value;
  const expires = Number(store.get(COOKIE.expires)?.value || 0);
  if (access && expires - Date.now() > 60_000) return access;

  const refresh = store.get(COOKIE.refresh)?.value;
  if (!refresh) throw new SpotifyAuthError("Not logged in");

  const token = await requestToken({
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  await storeTokens(token);
  return token.access_token;
}

/** GET a Spotify API path (or absolute URL) with retries for rate limits. */
export async function spotifyGet<T>(pathOrUrl: string, attempt = 0): Promise<T> {
  const token = await getAccessToken();
  const url = pathOrUrl.startsWith("http") ? pathOrUrl : SPOTIFY_API + pathOrUrl;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
    cache: "no-store",
  });

  if (res.status === 429 && attempt < 4) {
    const retryAfter = Number(res.headers.get("Retry-After")) || 2 ** attempt;
    await new Promise((r) => setTimeout(r, Math.min(retryAfter, 30) * 1000));
    return spotifyGet(pathOrUrl, attempt + 1);
  }
  if (res.status === 401) throw new SpotifyAuthError("Session expired");
  if (!res.ok) {
    throw new Error(`Spotify ${res.status}: ${await res.text()}`);
  }
  return res.json();
}

export function errorResponse(error: unknown) {
  if (error instanceof SpotifyAuthError) {
    return NextResponse.json({ error: error.message }, { status: 401 });
  }
  console.error(error);
  const message = error instanceof Error ? error.message : String(error);
  return NextResponse.json({ error: message }, { status: 502 });
}

export function pickImage(
  images: { url: string; width?: number | null }[] | null | undefined,
  target = 300
) {
  if (!images?.length) return null;
  const sorted = [...images].sort((a, b) => (a.width ?? 0) - (b.width ?? 0));
  return (sorted.find((i) => (i.width ?? target) >= target) ?? sorted.at(-1))!
    .url;
}
