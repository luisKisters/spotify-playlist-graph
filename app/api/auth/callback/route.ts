import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import {
  COOKIE,
  getRedirectUri,
  requestToken,
  storeTokens,
} from "@/lib/spotify";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const home = new URL("/", getRedirectUri(request.url));
  const fail = (reason: string) => {
    home.searchParams.set("error", reason);
    return NextResponse.redirect(home);
  };

  const error = searchParams.get("error");
  if (error) return fail(error);

  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const store = await cookies();
  if (!code || !state || state !== store.get(COOKIE.state)?.value) {
    return fail("state_mismatch");
  }
  store.delete(COOKIE.state);

  try {
    const token = await requestToken({
      grant_type: "authorization_code",
      code,
      redirect_uri: getRedirectUri(request.url),
    });
    await storeTokens(token);
    return NextResponse.redirect(home);
  } catch (e) {
    console.error("Token exchange failed:", e);
    return fail("token_exchange_failed");
  }
}
