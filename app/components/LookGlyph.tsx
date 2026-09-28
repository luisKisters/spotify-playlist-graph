import { PALETTE } from "@/lib/graph";
import { seeded } from "@/lib/rand";

type Dot = [x: number, y: number, r: number, color: string];
type Line = [x1: number, y1: number, x2: number, y2: number, color: string];

const W = 64;
const H = 40;

/** A cloud of small dots around a hub, like a playlist and its songs. */
function cloud(rand: () => number, cx: number, cy: number, radius: number, n: number, color: string, hub = 2.2) {
  const dots: Dot[] = [[cx, cy, hub, color]];
  const lines: Line[] = [];
  for (let i = 0; i < n; i++) {
    const a = rand() * Math.PI * 2;
    const d = Math.sqrt(rand()) * radius;
    const x = cx + Math.cos(a) * d;
    const y = cy + Math.sin(a) * d;
    dots.push([x, y, 0.55 + rand() * 0.5, color]);
    if (i % 2 === 0) lines.push([cx, cy, x, y, color]);
  }
  return { dots, lines };
}

// Tiny hand-tuned sketches of what each look produces.
function sketch(id: string) {
  const rand = seeded(id.length * 7919 + id.charCodeAt(0));
  const dots: Dot[] = [];
  const lines: Line[] = [];
  const add = (c: { dots: Dot[]; lines: Line[] }) => {
    dots.push(...c.dots);
    lines.push(...c.lines);
  };
  const islands: [number, number, number][] = [
    [16, 13, 8],
    [40, 11, 7],
    [53, 27, 7],
    [28, 29, 8],
    [9, 31, 5],
  ];

  if (id === "galaxy" || id === "artists") {
    islands.forEach(([x, y, r], i) => add(cloud(rand, x, y, r, id === "galaxy" ? 26 : 18, PALETTE[i], 1.8)));
  } else if (id === "continent") {
    const centers: [number, number][] = [
      [22, 16], [36, 14], [44, 25], [28, 26], [16, 27],
    ];
    centers.forEach(([x, y], i) => add(cloud(rand, x, y, 8, 24, PALETTE[i], 1.6)));
  } else if (id === "bridges") {
    const hubs: [number, number][] = [
      [12, 12], [52, 10], [32, 32], [10, 30], [54, 30],
    ];
    hubs.forEach(([x, y], i) => dots.push([x, y, 2.4, PALETTE[i]]));
    for (let i = 0; i < 26; i++) {
      const a = hubs[Math.floor(rand() * hubs.length)];
      const b = hubs[Math.floor(rand() * hubs.length)];
      if (a === b) continue;
      const t = 0.3 + rand() * 0.4;
      const x = a[0] + (b[0] - a[0]) * t + (rand() - 0.5) * 5;
      const y = a[1] + (b[1] - a[1]) * t + (rand() - 0.5) * 5;
      const c = PALETTE[hubs.indexOf(a)];
      dots.push([x, y, 0.8, c]);
      lines.push([a[0], a[1], x, y, c], [b[0], b[1], x, y, c]);
    }
  } else if (id === "genres") {
    for (let i = 0; i < 9; i++) {
      const x = 6 + rand() * 52;
      const y = 5 + rand() * 30;
      const c = PALETTE[i % 6];
      dots.push([x, y, 1.2 + rand() * 2.4, c]);
      for (let j = 0; j < 3; j++) {
        const x2 = x + (rand() - 0.5) * 16;
        const y2 = y + (rand() - 0.5) * 12;
        dots.push([x2, y2, 0.7, c]);
        lines.push([x, y, x2, y2, c]);
      }
    }
  } else if (id === "constellation") {
    const pts: [number, number][] = Array.from({ length: 16 }, () => [5 + rand() * 54, 5 + rand() * 30]);
    pts.forEach(([x, y], i) => {
      const [nx, ny] = pts[(i * 5 + 3) % pts.length];
      lines.push([x, y, nx, ny, "#ffffff"]);
      dots.push([x, y, 1 + rand() * 1.6, "#d4d4d8"]);
    });
  } else {
    // Taste islands: a few playlists per island, linked inside it.
    islands.forEach(([x, y, r], i) => {
      const members: [number, number][] = Array.from({ length: 4 }, () => [
        x + (rand() - 0.5) * r * 1.6,
        y + (rand() - 0.5) * r * 1.4,
      ]);
      members.forEach(([mx, my], j) => {
        const [ox, oy] = members[(j + 1) % members.length];
        lines.push([mx, my, ox, oy, PALETTE[i]]);
        dots.push([mx, my, 1.2 + rand() * 1.4, PALETTE[i]]);
      });
    });
  }
  return { dots, lines };
}

export default function LookGlyph({ id, className }: { id: string; className?: string }) {
  const { dots, lines } = sketch(id);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={className} aria-hidden>
      <rect width={W} height={H} fill="#07080a" />
      {lines.map(([x1, y1, x2, y2, c], i) => (
        <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={c} strokeOpacity={0.28} strokeWidth={0.35} />
      ))}
      {dots.map(([x, y, r, c], i) => (
        <circle key={i} cx={x} cy={y} r={r} fill={c} />
      ))}
    </svg>
  );
}
