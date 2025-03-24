import { getRefreshToken } from "@/lib/authUtils";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

// TODO: fix this, because server actions cannot set cookies

export async function GET() {
  const refreshTokenData = await getRefreshToken();
  if (refreshTokenData instanceof NextResponse) {
    return refreshTokenData;
  }
  const cookieStore = await cookies();
  cookieStore.set("spotify_access_token", refreshTokenData.access_token);
  if (refreshTokenData.refresh_token) {
    cookieStore.set("spotify_refresh_token", refreshTokenData.refresh_token);
  }
  return NextResponse.json({ success: true });
}
