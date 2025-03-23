import { getRefreshToken } from "@/lib/authUtils";
import { NextResponse } from "next/server";
import { cookies } from "next/headers";

export async function GET() {
  const refreshToken = await getRefreshToken();
  const cookieStore = await cookies();
  cookieStore.set("spotify_access_token", JSON.stringify(refreshToken));
  return NextResponse.json({ refreshToken });
}
