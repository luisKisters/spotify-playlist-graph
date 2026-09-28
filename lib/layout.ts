import type Graph from "graphology";
import type { ForceSettings } from "./settings";
import type { LayoutFrame, LayoutRequest } from "./layout.worker";

/**
 * Runs the force layout (see forces.ts) in a web worker and writes the
 * positions back into the graph, so sigma redraws as it settles while the
 * page stays responsive, even with thousands of nodes.
 */
export class ForceLayout {
  private worker: Worker;
  private ids: string[];
  private index = new Map<string, number>();
  private alpha = 1;
  private finished = false;

  constructor(
    private graph: Graph,
    settings: ForceSettings,
    /** Called after each batch of positions has been written. */
    private onFrame: (done: boolean) => void
  ) {
    this.ids = graph.nodes();
    this.ids.forEach((id, i) => this.index.set(id, i));
    const clusters = new Int32Array(this.ids.length);
    const sizes = new Float32Array(this.ids.length);
    this.ids.forEach((id, i) => {
      const a = graph.getNodeAttributes(id);
      clusters[i] = a.cluster ?? -1;
      sizes[i] = a.size ?? 3;
    });
    let max = 1e-6;
    graph.forEachEdge((_, a) => (max = Math.max(max, a.weight ?? 1)));
    const edges = new Int32Array(graph.size * 2);
    const weights = new Float32Array(graph.size);
    let i = 0;
    graph.forEachEdge((_, a, s, t) => {
      edges[i * 2] = this.index.get(s)!;
      edges[i * 2 + 1] = this.index.get(t)!;
      weights[i++] = (a.weight ?? 1) / max;
    });

    this.worker = new Worker(new URL("./layout.worker.ts", import.meta.url), { type: "module" });
    this.worker.onmessage = (e: MessageEvent<LayoutFrame>) => this.write(e.data);
    this.send({ type: "init", clusters, sizes, edges, weights, settings }, [
      clusters.buffer,
      sizes.buffer,
      edges.buffer,
      weights.buffer,
    ]);
  }

  private send(msg: LayoutRequest, transfer: Transferable[] = []) {
    this.worker.postMessage(msg, transfer);
  }

  private write({ positions, alpha, done }: LayoutFrame) {
    this.alpha = alpha;
    this.finished = done;
    const { ids } = this;
    this.graph.updateEachNodeAttributes(
      (id, a) => {
        const i = this.index.get(id);
        if (i !== undefined) {
          a.x = positions[i * 2];
          a.y = positions[i * 2 + 1];
        }
        return a;
      },
      { attributes: ["x", "y"] }
    );
    if (ids.length) this.onFrame(done);
  }

  /** Updates forces and animates to the new balance. */
  apply(settings: ForceSettings) {
    this.send({ type: "settings", settings, alpha: 0.5 });
  }

  reheat(alpha = 1) {
    this.send({ type: "reheat", alpha });
  }

  /** Holds a node under the pointer while dragging. */
  drag(id: string, x: number, y: number) {
    const index = this.index.get(id);
    if (index !== undefined) this.send({ type: "drag", index, x, y });
  }

  release(id: string) {
    const index = this.index.get(id);
    if (index !== undefined) this.send({ type: "release", index });
  }

  get settling() {
    return !this.finished && this.alpha > 0.001;
  }

  stop() {
    this.send({ type: "stop" });
    this.worker.terminate();
  }
}
