/// <reference lib="webworker" />
import { forceSimulation, type Simulation } from "d3-force";
import { applyForces, seedPositions, type SimLink, type SimNode } from "./forces";
import type { ForceSettings } from "./settings";
import { seeded } from "./rand";

export type LayoutRequest =
  | {
      type: "init";
      clusters: Int32Array;
      sizes: Float32Array;
      /** Flat [source, target, source, target, ...] node indexes */
      edges: Int32Array;
      weights: Float32Array;
      settings: ForceSettings;
    }
  | { type: "settings"; settings: ForceSettings; alpha: number }
  | { type: "reheat"; alpha: number }
  | { type: "drag"; index: number; x: number; y: number }
  | { type: "release"; index: number }
  | { type: "stop" };

export type LayoutFrame = {
  type: "frame";
  /** Flat [x, y, x, y, ...] */
  positions: Float32Array;
  alpha: number;
  done: boolean;
};

let sim: Simulation<SimNode, SimLink> | null = null;
let nodes: SimNode[] = [];
let links: SimLink[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;
let dragging = 0;

const post = (done: boolean) => {
  const positions = new Float32Array(nodes.length * 2);
  for (let i = 0; i < nodes.length; i++) {
    positions[i * 2] = nodes[i].x!;
    positions[i * 2 + 1] = nodes[i].y!;
  }
  const frame: LayoutFrame = { type: "frame", positions, alpha: sim?.alpha() ?? 0, done };
  (self as unknown as Worker).postMessage(frame, [positions.buffer]);
};

// Tick as fast as the machine allows, but only send ~30 frames a second.
const loop = () => {
  timer = null;
  if (!sim) return;
  const start = performance.now();
  while (performance.now() - start < 30) {
    sim.tick();
    if (sim.alpha() < sim.alphaMin() && !dragging) break;
  }
  const done = sim.alpha() < sim.alphaMin() && !dragging;
  post(done);
  if (!done) timer = setTimeout(loop, 0);
};

const run = (alpha: number) => {
  if (!sim) return;
  sim.alpha(Math.max(sim.alpha(), alpha));
  if (!timer) timer = setTimeout(loop, 0);
};

self.onmessage = (e: MessageEvent<LayoutRequest>) => {
  const msg = e.data;
  if (msg.type === "init") {
    nodes = Array.from(msg.clusters, (cluster, index) => ({ index, cluster, size: msg.sizes[index], degree: 0 }));
    links = [];
    for (let i = 0; i < msg.weights.length; i++) {
      const source = nodes[msg.edges[i * 2]];
      const target = nodes[msg.edges[i * 2 + 1]];
      source.degree++;
      target.degree++;
      links.push({ source, target, w: msg.weights[i] });
    }
    sim = forceSimulation<SimNode, SimLink>(nodes).stop();
    sim.alphaDecay(0.022);
    const anchors = applyForces(sim, nodes, links, msg.settings);
    seedPositions(nodes, links, anchors, seeded(3));
    post(false);
    run(1);
  } else if (msg.type === "settings" && sim) {
    applyForces(sim, nodes, links, msg.settings);
    run(msg.alpha);
  } else if (msg.type === "reheat") {
    run(msg.alpha);
  } else if (msg.type === "drag" && nodes[msg.index]) {
    const n = nodes[msg.index];
    if (n.fx == null) dragging++;
    n.fx = msg.x;
    n.fy = msg.y;
    run(0.15);
  } else if (msg.type === "release" && nodes[msg.index]) {
    const n = nodes[msg.index];
    if (n.fx != null) dragging--;
    n.fx = n.fy = null;
  } else if (msg.type === "stop") {
    if (timer) clearTimeout(timer);
    timer = null;
    sim?.stop();
    sim = null;
  }
};
