import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  type ForceX,
  type ForceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { ForceSettings } from "./settings";

export interface SimNode extends SimulationNodeDatum {
  index: number;
  cluster: number;
  size: number;
  degree: number;
}
export interface SimLink extends SimulationLinkDatum<SimNode> {
  source: SimNode;
  target: SimNode;
  /** weight relative to the strongest link, 0..1 */
  w: number;
}

export interface Anchor {
  x: number;
  y: number;
  r: number;
}

/**
 * The typical distance between two neighbouring nodes. Everything else
 * (island sizes, gaps, repulsion range) is expressed in this unit, so the
 * same slider values look alike for 50 nodes or 5000.
 */
const spacing = (s: ForceSettings) => s.linkDistance * 0.3 * Math.sqrt(Math.max(0.5, s.repelForce) / 8);

/** Room an island of n nodes needs at the current spacing. */
const islandRadius = (n: number, unit: number) => unit * (0.75 * Math.sqrt(n) + 1);

/**
 * Packs one circle per cluster, biggest first, spiralling outwards so every
 * island gets room in proportion to its size and none overlap. A ring (the
 * old approach) put a 900-node cluster next to a 3-node one at the same
 * distance, which is what made "Islands" fall apart on big libraries.
 */
export function packClusters(sizes: Map<number, number>, s: ForceSettings): Map<number, Anchor> {
  const unit = spacing(s);
  const gap = unit * (1 + 4 * s.clusterForce);
  const clusters = [...sizes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0]);
  const placed: Anchor[] = [];
  const out = new Map<number, Anchor>();
  for (const [c, n] of clusters) {
    const r = islandRadius(n, unit);
    let spot = { x: 0, y: 0, r };
    if (placed.length) {
      // Walk a spiral until the circle fits next to everything placed so far.
      for (let t = 0; ; t += 0.2) {
        const d = unit * 0.8 * t;
        const x = Math.cos(t) * d;
        const y = Math.sin(t) * d;
        if (placed.every((p) => Math.hypot(p.x - x, p.y - y) >= p.r + r + gap)) {
          spot = { x, y, r };
          break;
        }
      }
    }
    placed.push(spot);
    out.set(c, spot);
  }
  return out;
}

/** Places nodes near their island, and leaves next to the node they hang off. */
export function seedPositions(nodes: SimNode[], links: SimLink[], anchors: Map<number, Anchor>, rand: () => number) {
  const neighbours = nodes.map(() => [] as SimNode[]);
  for (const l of links) {
    neighbours[l.source.index].push(l.target);
    neighbours[l.target.index].push(l.source);
  }
  const done = new Set<number>();
  // Hubs first, so everything that hangs off them has a place to go.
  const order = [...nodes].sort((a, b) => b.degree - a.degree);
  for (const n of order) {
    const placedNb = neighbours[n.index].filter((m) => done.has(m.index) && m.cluster === n.cluster);
    const a = anchors.get(n.cluster) ?? { x: 0, y: 0, r: 100 };
    if (placedNb.length && n.degree <= 3) {
      const cx = placedNb.reduce((s, m) => s + m.x!, 0) / placedNb.length;
      const cy = placedNb.reduce((s, m) => s + m.y!, 0) / placedNb.length;
      const angle = rand() * Math.PI * 2;
      const d = (0.2 + rand() * 0.3) * a.r;
      n.x = cx + Math.cos(angle) * d;
      n.y = cy + Math.sin(angle) * d;
    } else {
      const angle = rand() * Math.PI * 2;
      const d = Math.sqrt(rand()) * a.r * 0.8;
      n.x = a.x + Math.cos(angle) * d;
      n.y = a.y + Math.sin(angle) * d;
    }
    done.add(n.index);
  }
}

/**
 * Obsidian-style forces, adjusted so they behave the same at any scale:
 * - repulsion only reaches a few neighbourhoods (`distanceMax`), so a big
 *   graph doesn't blow itself apart and islands stay compact;
 * - links between clusters are weakened as "cluster pull" rises, otherwise
 *   a handful of shared songs drags every island back into one hairball;
 * - leaves (songs in one playlist) sit on short links around their hub.
 */
export function applyForces(sim: Simulation<SimNode, SimLink>, nodes: SimNode[], links: SimLink[], s: ForceSettings) {
  const unit = spacing(s);
  const anchors = packClusters(clusterSizes(nodes), s);
  const pull = s.clusterForce * 0.008;
  const cross = Math.max(0, 1 - s.clusterForce * 1.25) ** 2;
  const reach = unit * 4;

  sim
    .force(
      "charge",
      forceManyBody<SimNode>()
        .strength((n) => -s.repelForce * 2.2 * unit * 0.12 * Math.sqrt(Math.max(1, n.size)))
        .distanceMax(reach)
        // Coarser approximation on big graphs: nobody can see the difference.
        .theta(nodes.length > 1500 ? 1.3 : 0.9)
    )
    .force(
      "link",
      forceLink<SimNode, SimLink>(links)
        .distance((l) => {
          const pad = (l.source.size + l.target.size) * 0.5;
          // Leaves fan out around their hub; the more of them, the wider.
          const hub = Math.max(l.source.degree, l.target.degree);
          if (Math.min(l.source.degree, l.target.degree) === 1)
            return unit * (0.5 + 0.12 * Math.sqrt(hub)) + pad;
          return s.linkDistance * (1.2 - 0.6 * l.w) + pad;
        })
        .strength((l) => {
          const k = Math.min(1, s.linkForce * (0.4 + l.w)) / Math.min(l.source.degree, l.target.degree);
          return l.source.cluster === l.target.cluster ? k : k * cross;
        })
    )
    .force("collide", forceCollide<SimNode>((n) => n.size * 0.9 + unit * 0.05).strength(0.5).iterations(1))
    // With islands on, the centre force acts on the islands (through their
    // anchors) rather than on every node, or it would squash them together.
    .force("centerX", forceX<SimNode>(0).strength(s.centerForce * 0.02 * (1 - s.clusterForce)))
    .force("centerY", forceY<SimNode>(0).strength(s.centerForce * 0.02 * (1 - s.clusterForce)))
    .force("clusterX", pull ? forceX<SimNode>(0).strength(pull) : null)
    .force("clusterY", pull ? forceY<SimNode>(0).strength(pull) : null)
    .force("contain", s.clusterForce > 0.05 ? forceContain(anchors, s.clusterForce) : null);
  setAnchors(sim, anchors);
  return anchors;
}

function clusterSizes(nodes: SimNode[]) {
  const sizes = new Map<number, number>();
  for (const n of nodes) sizes.set(n.cluster, (sizes.get(n.cluster) ?? 0) + 1);
  return sizes;
}

/**
 * Keeps each node inside its island's circle: free to move within it, pulled
 * back in once it strays past the edge. Since the circles are packed without
 * overlap, strong cluster pull means clearly separate islands at any size.
 */
function forceContain(anchors: Map<number, Anchor>, strength: number) {
  let nodes: SimNode[] = [];
  const force = (alpha: number) => {
    for (const n of nodes) {
      const a = anchors.get(n.cluster);
      if (!a) continue;
      const dx = n.x! - a.x;
      const dy = n.y! - a.y;
      const d = Math.hypot(dx, dy);
      if (d <= a.r || d === 0) continue;
      const k = Math.min(0.5, ((d - a.r) / d) * strength * alpha * 3);
      n.vx! -= dx * k;
      n.vy! -= dy * k;
    }
  };
  force.initialize = (ns: SimNode[]) => (nodes = ns);
  force.anchors = anchors;
  return force;
}

function setAnchors(sim: Simulation<SimNode, SimLink>, anchors: Map<number, Anchor>) {
  const contain = sim.force("contain") as ReturnType<typeof forceContain> | undefined;
  if (contain && contain.anchors !== anchors) {
    contain.anchors.clear();
    anchors.forEach((a, c) => contain.anchors.set(c, a));
  }
  const fx = sim.force("clusterX") as ForceX<SimNode> | undefined;
  const fy = sim.force("clusterY") as ForceY<SimNode> | undefined;
  fx?.x((n) => anchors.get(n.cluster)?.x ?? 0);
  fy?.y((n) => anchors.get(n.cluster)?.y ?? 0);
}
