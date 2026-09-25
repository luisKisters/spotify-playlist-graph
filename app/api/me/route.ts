import { NextResponse } from "next/server";
import { errorResponse, pickImage, spotifyGet } from "@/lib/spotify";
import type { User } from "@/lib/types";

export async function GET() {
  try {
    const me = await spotifyGet<any>("/me");
    const user: User = {
      id: me.id,
      name: me.display_name || me.id,
      image: pickImage(me.images, 64),
    };
    return NextResponse.json(user);
  } catch (e) {
    return errorResponse(e);
  }
}
