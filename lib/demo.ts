import type { Playlist, Track, User } from "./types";

// A made-up library so the app can be explored without a Spotify login.
// Artists are grouped into "scenes"; playlists mix scenes so they overlap.

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const SCENES: Record<string, string[]> = {
  indie: ["Paper Lanterns", "The Quiet Coast", "Juniper Hall", "Lowlight", "Marble Arch Club", "Sofia Wren"],
  electronic: ["Kilowatt Garden", "NOVA/9", "Subtle Machines", "Mira Voss", "Deep Harbor", "Tessellate"],
  hiphop: ["Kid Meridian", "Block Theory", "Ayo Lane", "Northside Choir", "Dre Castillo"],
  jazz: ["The Blue Hour Trio", "Esther Coleman", "Late Tram Quartet", "Ravi Anand"],
  rock: ["Iron Orchard", "The Static Kings", "Wildfire Radio", "Cold Mountain"],
  pop: ["Lia Moreno", "Summer Static", "Jonah Bright", "Neon Hearts", "Cleo Sky"],
  ambient: ["Field Notes", "Slow Weather", "Halden", "Glass Pavilion"],
};

const WORDS = [
  "Midnight", "Glass", "River", "Paper", "Echo", "Golden", "Static", "Violet",
  "Northern", "Satellite", "Winter", "Honey", "Signal", "Ocean", "Velvet",
  "Hollow", "Ember", "Silver", "Wild", "Neon", "Quiet", "Lost", "Sunday",
  "Parallel", "Summer", "Distant", "Afterglow", "Motel", "Orbit", "Tide",
];
const NOUNS = [
  "Lights", "Hearts", "Drive", "Rooms", "Dreams", "Lines", "City", "Waves",
  "Garden", "Hours", "Letters", "Skies", "Roads", "Fever", "Mirrors", "Youth",
];

const PLAYLISTS: [string, Record<string, number>, number][] = [
  ["Late Night Drive", { electronic: 0.5, indie: 0.3, ambient: 0.2 }, 60],
  ["Focus Flow", { ambient: 0.5, electronic: 0.35, jazz: 0.15 }, 70],
  ["Sunday Morning", { jazz: 0.5, indie: 0.3, ambient: 0.2 }, 45],
  ["Gym Bangers", { hiphop: 0.5, electronic: 0.25, rock: 0.25 }, 55],
  ["Indie Discoveries", { indie: 0.8, pop: 0.2 }, 80],
  ["Summer 2025", { pop: 0.5, hiphop: 0.25, indie: 0.25 }, 65],
  ["Roadtrip", { rock: 0.4, indie: 0.3, pop: 0.3 }, 75],
  ["Deep Work", { ambient: 0.6, electronic: 0.4 }, 50],
  ["Throwbacks", { rock: 0.5, pop: 0.3, hiphop: 0.2 }, 70],
  ["Jazz Café", { jazz: 0.9, ambient: 0.1 }, 40],
  ["Party Starters", { pop: 0.4, hiphop: 0.4, electronic: 0.2 }, 60],
  ["Rainy Days", { indie: 0.4, ambient: 0.3, jazz: 0.3 }, 50],
  ["Running 170bpm", { electronic: 0.6, hiphop: 0.4 }, 45],
  ["Liked Mix", { indie: 0.2, pop: 0.2, electronic: 0.2, hiphop: 0.2, rock: 0.2 }, 90],
];

// Extra playlists so the demo is closer to a real library in size.
const MOODS = ["Chill", "Night", "Morning", "Workout", "Study", "Commute", "Cooking", "Weekend", "Vibes", "Mix"];
function extraPlaylists(): [string, Record<string, number>, number][] {
  const rand = rng(99);
  const scenes = Object.keys(SCENES);
  const out: [string, Record<string, number>, number][] = [];
  for (let i = 0; i < 26; i++) {
    const main = scenes[Math.floor(rand() * scenes.length)];
    const side = scenes[Math.floor(rand() * scenes.length)];
    const mix = main === side ? { [main]: 1 } : { [main]: 0.7, [side]: 0.3 };
    const name = `${main[0].toUpperCase()}${main.slice(1)} ${MOODS[i % MOODS.length]}${i >= MOODS.length ? ` ${Math.floor(i / MOODS.length) + 1}` : ""}`;
    out.push([name, mix, 20 + Math.floor(rand() * 60)]);
  }
  return out;
}

export function makeDemoLibrary(): { user: User; playlists: Playlist[] } {
  const rand = rng(42);
  const pick = <T,>(arr: T[]) => arr[Math.floor(rand() * arr.length)];

  // Build a catalogue of tracks per scene.
  const catalogue: Record<string, Track[]> = {};
  let n = 0;
  for (const [scene, artists] of Object.entries(SCENES)) {
    catalogue[scene] = [];
    artists.forEach((artist) => {
      const count = 10 + Math.floor(rand() * 10);
      for (let i = 0; i < count; i++) {
        const feat = rand() < 0.12 ? pick(artists.filter((a) => a !== artist)) : null;
        const names = feat ? [artist, feat] : [artist];
        n++;
        catalogue[scene].push({
          id: `demo-track-${n}`,
          name: `${pick(WORDS)} ${pick(NOUNS)}`,
          artists: names.map((a) => ({ id: `demo-artist-${slug(a)}`, name: a })),
          album: `${pick(WORDS)} ${pick(NOUNS)}`,
          image: null,
          url: "https://open.spotify.com",
          duration: 150_000 + Math.floor(rand() * 150_000),
        });
      }
    });
  }

  // Popularity skew: early tracks in each scene are "hits" that show up often.
  const weightedPick = (tracks: Track[]) =>
    tracks[Math.floor(Math.pow(rand(), 1.4) * tracks.length)];

  const playlists: Playlist[] = [...PLAYLISTS, ...extraPlaylists()].map(([name, mix, size], i) => {
    const tracks: Track[] = [];
    const seen = new Set<string>();
    const scenes = Object.entries(mix);
    let guard = 0;
    while (tracks.length < size && guard++ < size * 20) {
      let r = rand();
      let scene = scenes[0][0];
      for (const [s, w] of scenes) {
        if ((r -= w) <= 0) {
          scene = s;
          break;
        }
      }
      const t = weightedPick(catalogue[scene]);
      if (seen.has(t.id)) continue;
      seen.add(t.id);
      tracks.push(t);
    }
    // A couple of accidental duplicates to show off duplicate detection.
    if (i % 4 === 1) tracks.push(tracks[3], tracks[7]);
    return {
      id: `demo-${i}`,
      name,
      owner: "Demo listener",
      image: null,
      url: "https://open.spotify.com",
      snapshot: "demo",
      total: tracks.length,
      tracks,
    };
  });

  return {
    user: { id: "demo", name: "Demo listener", image: null },
    playlists,
  };
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

const SCENE_GENRES: Record<string, string[][]> = {
  indie: [["indie rock", "indie pop"], ["indie pop", "dream pop"], ["indie rock"]],
  electronic: [["electronic", "house"], ["techno", "electronic"], ["electronic", "downtempo"]],
  hiphop: [["hip hop", "rap"], ["hip hop", "trap"], ["rap"]],
  jazz: [["jazz", "soul jazz"], ["jazz"], ["jazz", "bossa nova"]],
  rock: [["rock", "classic rock"], ["alternative rock", "rock"], ["hard rock"]],
  pop: [["pop", "dance pop"], ["pop", "synthpop"], ["pop"]],
  ambient: [["ambient", "downtempo"], ["ambient", "neoclassical"], ["ambient"]],
};

/** Genres for the demo artists, shaped like the real genre lookup. */
export function demoGenres(): Map<string, string[]> {
  const out = new Map<string, string[]>();
  for (const [scene, artists] of Object.entries(SCENES)) {
    artists.forEach((a, i) => {
      out.set(`demo-artist-${slug(a)}`, SCENE_GENRES[scene][i % SCENE_GENRES[scene].length]);
    });
  }
  return out;
}
