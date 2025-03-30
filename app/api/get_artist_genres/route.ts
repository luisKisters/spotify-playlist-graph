import { NextRequest, NextResponse } from "next/server";

// Define types for Spotify API responses
interface SpotifyArtist {
  id: string;
  name: string;
  genres: string[];
  images?: Array<{ url: string; height: number; width: number }>;
}

interface SpotifyArtistsResponse {
  artists: SpotifyArtist[];
}

export async function GET(request: NextRequest) {
  const authHeader = request.headers.get("Authorization");
  let token;

  if (authHeader && authHeader.startsWith("Bearer ")) {
    token = authHeader.substring(7);
  } else {
    token = request.nextUrl.searchParams.get("token");
  }

  if (!token) {
    console.error("No access token found");
    return NextResponse.json(
      { error: "No access token found" },
      { status: 401 }
    );
  }

  const artistIds = request.nextUrl.searchParams.get("ids");
  if (!artistIds) {
    console.error("No artist IDs provided");
    return NextResponse.json(
      { error: "Artist IDs are required" },
      { status: 400 }
    );
  }

  // Log and validate the received artist IDs
  const idArray = artistIds.split(",");
  console.log(`API: Received request for ${idArray.length} artist IDs`);
  console.log(`API: First few IDs: ${idArray.slice(0, 3).join(", ")}`);

  // Check for valid artist IDs (Spotify IDs are base62 encoded and typically 22 characters)
  const validIds = idArray.filter(
    (id) => id && id.trim() !== "" && /^[a-zA-Z0-9]{22}$/.test(id)
  );

  if (validIds.length === 0) {
    console.error("No valid artist IDs found");
    return NextResponse.json(
      { error: "No valid artist IDs provided", received: idArray },
      { status: 400 }
    );
  }

  console.log(
    `API: Found ${validIds.length} valid artist IDs out of ${idArray.length} received`
  );

  async function spotify_request(
    url: string,
    currentToken: string,
    retryCount = 0
  ) {
    const MAX_RETRIES = 3;
    const BASE_DELAY = 1000; // 1 second base delay for exponential backoff

    try {
      console.log(
        `API: Sending request to Spotify: ${url.substring(0, 100)}...`
      );
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${currentToken}`,
        },
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      console.log(`API: Spotify responded with status ${response.status}`);

      if (response.status === 429) {
        if (retryCount >= MAX_RETRIES) {
          throw new Error(`Rate limit exceeded after ${MAX_RETRIES} retries`);
        }

        // Get retry delay from header or use exponential backoff
        const retryAfter = parseInt(
          response.headers.get("Retry-After") || "0",
          10
        );
        const delay = retryAfter * 1000 || Math.pow(2, retryCount) * BASE_DELAY;

        console.log(
          `Rate limited. Waiting ${delay / 1000} seconds before retry ${
            retryCount + 1
          }/${MAX_RETRIES}`
        );
        await new Promise((resolve) => setTimeout(resolve, delay));

        return spotify_request(url, currentToken, retryCount + 1);
      }

      if (!response.ok) {
        const errorBody = await response.text();
        console.error(
          `API: Spotify error response (${response.status}):`,
          errorBody
        );

        return NextResponse.json(
          {
            error: `Failed to fetch artists, error: ${response.statusText}`,
            details: errorBody,
            status: response.status,
          },
          { status: response.status }
        );
      }

      // Ensure we got a valid JSON response
      try {
        const data = await response.json();
        return data;
      } catch (jsonError) {
        console.error("Failed to parse JSON response from Spotify:", jsonError);
        return NextResponse.json(
          { error: "Invalid JSON response from Spotify API" },
          { status: 500 }
        );
      }
    } catch (error) {
      if (error instanceof Error && error.name === "TimeoutError") {
        if (retryCount >= MAX_RETRIES) {
          throw new Error(`Request timed out after ${MAX_RETRIES} retries`);
        }
        console.log(
          `Request timed out. Retrying (${retryCount + 1}/${MAX_RETRIES})...`
        );
        return spotify_request(url, currentToken, retryCount + 1);
      }
      console.error("API: spotify_request caught error:", error);
      throw error;
    }
  }

  try {
    // Use only valid IDs for the Spotify API request
    const validIdsParam = validIds.join(",");

    // Spotify API limits to 50 artists per request
    const url = `https://api.spotify.com/v1/artists?ids=${validIdsParam}`;
    console.log(`API: Requesting from Spotify: ${url.substring(0, 100)}...`);

    const response = (await spotify_request(url, token)) as
      | SpotifyArtistsResponse
      | NextResponse;

    if (response instanceof NextResponse) {
      console.error("API: spotify_request returned a NextResponse error");
      return response;
    }

    console.log(`API: Received data from Spotify`);

    // Check if we got a valid response
    if (!response.artists || !Array.isArray(response.artists)) {
      console.error(
        "API: Invalid response from Spotify:",
        JSON.stringify(response).substring(0, 200)
      );
      return NextResponse.json(
        { error: "Invalid response from Spotify API", response },
        { status: 500 }
      );
    }

    console.log(
      `API: Received ${response.artists.length} artists from Spotify`
    );

    // Filter out null artists (could happen if some IDs don't exist)
    const validArtists = response.artists.filter(
      (artist): artist is SpotifyArtist => artist !== null
    );

    if (validArtists.length < response.artists.length) {
      console.log(
        `API: Filtered out ${
          response.artists.length - validArtists.length
        } null artists`
      );
    }

    // Map the response to a simpler format
    const artistGenres = validArtists.map((artist) => ({
      id: artist.id,
      name: artist.name,
      genres: artist.genres || [],
      image: artist.images && artist.images[0] ? artist.images[0].url : null,
    }));

    console.log(`API: Returning ${artistGenres.length} processed artists`);
    return NextResponse.json(artistGenres);
  } catch (error) {
    console.error("Error fetching artist genres:", error);
    return NextResponse.json(
      { error: "Failed to fetch artist genres, error: " + error },
      { status: 500 }
    );
  }
}
