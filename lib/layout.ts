import type Graph from "graphology";
import {
  forceCollide,
  forceLink,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationLinkDatum,
  type SimulationNodeDatum,
} from "d3-force";
import type { ForceSettings } from "./settings";
import { seeded } from "./graph";

interface SimNode extends SimulationNodeDatum {
  id: string;
  cluster: number;
  size: number;
}
interface SimLink extends SimulationLinkDatum<SimNode> {
  /** weight relative to the strongest link, 0..1 */
  w: number;
}

/**
 * A live d3-force layout that writes positions back into the graph, so sigma
 * redraws as it settles. Forces mirror Obsidian's graph settings, plus a
 * cluster force that pulls each cluster towards its own spot on a ring.
 */
export class ForceLayout {
  private sim: Simulation<SimNode, SimLink>;
  private nodes: SimNode[];
  private links: SimLink[];
  private anchors = new Map<number, { x: number; y: number }>();

  constructor(
    private graph: Graph,
    settings: ForceSettings
  ) {
    const rand = seeded(3);
    const sizes = new Map<number, number>();
    graph.forEachNode((_, a) => sizes.set(a.cluster, (sizes.get(a.cluster) ?? 0) + 1));
    this.placeAnchors(sizes, settings.linkDistance);

    this.nodes = graph.mapNodes((id, a) => {
      // Start near the cluster's anchor so it settles quickly.
      const anchor = this.anchors.get(a.cluster) ?? { x: 0, y: 0 };
      const spread = settings.linkDistance * 2;
      return {
        id,
        cluster: a.cluster,
        size: a.size,
        x: anchor.x + (rand() - 0.5) * spread,
        y: anchor.y + (rand() - 0.5) * spread,
      };
    });
    let max = 1e-6;
    graph.forEachEdge((_, a) => (max = Math.max(max, a.weight ?? 1)));
    this.links = graph.mapEdges((_, a, s, t) => ({ source: s, target: t, w: (a.weight ?? 1) / max }));

    this.sim = forceSimulation(this.nodes).stop();
    this.apply(settings, false);

    // Settle most of the way before the first frame, within a time budget.
    const start = performance.now();
    while (this.sim.alpha() > 0.05 && performance.now() - start < 350) this.sim.tick();
    this.write();
  }

  private placeAnchors(sizes: Map<number, number>, distance: number) {
    const clusters = [...sizes.keys()].filter((c) => c >= 0).sort((a, b) => a - b);
    const total = [...sizes.values()].reduce((a, b) => a + b, 0);
    const radius = distance * Math.max(1.5, Math.sqrt(total) * 0.6);
    clusters.forEach((c, i) => {
      const angle = (i / clusters.length) * Math.PI * 2;
      this.anchors.set(c, { x: Math.cos(angle) * radius, y: Math.sin(angle) * radius });
    });
    this.anchors.set(-1, { x: 0, y: 0 });
  }

  /** Updates forces; `reheat` restarts the animation so the change is visible. */
  apply(s: ForceSettings, reheat = true) {
    const degree = new Map<string, number>();
    for (const l of this.links)
      for (const end of [l.source, l.target]) {
        const id = typeof end === "object" ? (end as SimNode).id : String(end);
        degree.set(id, (degree.get(id) ?? 0) + 1);
      }
    const idOf = (end: SimLink["source"]) => (typeof end === "object" ? (end as SimNode).id : String(end));

    const sizes = new Map<number, number>();
    for (const n of this.nodes) sizes.set(n.cluster, (sizes.get(n.cluster) ?? 0) + 1);
    this.anchors.clear();
    this.placeAnchors(sizes, s.linkDistance);
    const anchor = (n: SimNode) => this.anchors.get(n.cluster) ?? { x: 0, y: 0 };
    const pull = s.clusterForce * 0.12;

    this.sim
      .force(
        "charge",
        forceManyBody<SimNode>()
          .strength((n) => -s.repelForce * 6 * Math.sqrt(n.size))
          .theta(0.9)
      )
      .force(
        "link",
        forceLink<SimNode, SimLink>(this.links)
          .id((n) => n.id)
          .distance((l) => s.linkDistance * (1.2 - 0.6 * l.w))
          .strength(
            (l) =>
              Math.min(1, s.linkForce * (0.4 + l.w)) /
              Math.min(degree.get(idOf(l.source)) ?? 1, degree.get(idOf(l.target)) ?? 1)
          )
      )
      .force("collide", forceCollide<SimNode>((n) => n.size * 4).strength(0.7))
      .force("centerX", forceX<SimNode>(0).strength(s.centerForce * 0.05))
      .force("centerY", forceY<SimNode>(0).strength(s.centerForce * 0.05))
      .force("clusterX", pull ? forceX<SimNode>((n) => anchor(n).x).strength(pull) : null)
      .force("clusterY", pull ? forceY<SimNode>((n) => anchor(n).y).strength(pull) : null);

    if (reheat) this.reheat(0.6);
  }

  reheat(alpha = 1) {
    this.sim.on("tick", () => this.write());
    this.sim.alpha(alpha).restart();
  }

  /** Holds a node under the pointer while dragging. */
  drag(id: string, x: number, y: number) {
    const n = this.nodes.find((n) => n.id === id);
    if (!n) return;
    n.fx = x;
    n.fy = y;
    if (this.sim.alpha() < 0.2) this.reheat(0.2);
  }

  release(id: string) {
    const n = this.nodes.find((n) => n.id === id);
    if (n) n.fx = n.fy = null;
  }

  get settling() {
    return this.sim.alpha() > this.sim.alphaMin();
  }

  stop() {
    this.sim.on("tick", null).stop();
  }

  private write() {
    const byId = new Map(this.nodes.map((n) => [n.id, n]));
    this.graph.updateEachNodeAttributes((id, a) => {
      const n = byId.get(id);
      if (n) {
        a.x = n.x;
        a.y = n.y;
      }
      return a;
    });
  }
}
