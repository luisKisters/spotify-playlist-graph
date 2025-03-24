import { cookies } from "next/headers";
import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const body = await request.json();
  console.log("get_playlists route");
  console.log("playlists from set_playlists route: ", body);

  const cookieStore = await cookies();
  //   cookieStore.set("playlists", JSON.stringify(request.body));
  cookieStore.set("playlists", JSON.stringify(body));

  return NextResponse.json({ message: "Playlists set" });
}
