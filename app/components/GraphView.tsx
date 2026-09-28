"use client";

import { useEffect, useImperativeHandle, useRef, type Ref } from "react";
import Sigma from "sigma";
import type Graph from "graphology";
import type { EdgeDisplayData, NodeDisplayData, PartialButFor } from "sigma/types";
import { downloadAsPNG } from "@sigma/export-image";
import { ForceLayout } from "@/lib/layout";
import type { DisplaySettings, ForceSettings } from "@/lib/settings";

export interface GraphHandle {
  /** Re-runs the layout from its current positions, like Obsidian's "Animate". */
  animate: () => void;
  fit: () => void;
  exportPng: (whole: boolean) => Promise<void>;
}

interface Props {
  graph: Graph;
  forces: ForceSettings;
  display: DisplaySettings;
  selected: string | null;
  /** Nodes matching the current search; everything else is dimmed. */
  highlight: Set<string> | null;
  onSelect: (id: string | null) => void;
  /** Called when the layout starts or stops moving. */
  onSettling?: (settling: boolean) => void;
  handle?: Ref<GraphHandle>;
}

const BACKGROUND = "#07080a";
const DIM_NODE = "#1f2228";
const DIM_EDGE = "#0f1114";
let fontFamily = "system-ui, sans-serif";

function drawHover(
  ctx: CanvasRenderingContext2D,
  data: PartialButFor<NodeDisplayData, "x" | "y" | "size" | "label" | "color">
) {
  if (!data.label) return;
  const size = 13;
  ctx.font = `600 ${size}px ${fontFamily}`;
  const width = ctx.measureText(data.label).width;
  const pad = 6;
  const x = data.x + data.size + 4;
  const y = data.y - size / 2 - pad;
  ctx.fillStyle = "rgba(18,20,24,0.95)";
  ctx.strokeStyle = data.color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(x, y, width + pad * 2, size + pad * 2, 6);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(data.x, data.y, data.size + 3, 0, Math.PI * 2);
  ctx.strokeStyle = data.color;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = "#f3f4f6";
  ctx.fillText(data.label, x + pad, data.y + size / 3);
}

/** Obsidian-style text fade: higher values show labels at smaller zoom. */
const labelThreshold = (textFade: number) => Math.max(0, 6 - textFade * 2);

export default function GraphView({ graph, forces, display, selected, highlight, onSelect, onSettling, handle }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const layoutRef = useRef<ForceLayout | null>(null);
  const state = useRef({ selected, highlight, hovered: null as string | null, display });
  state.current.display = display;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const forcesRef = useRef(forces);
  forcesRef.current = forces;
  const onSettlingRef = useRef(onSettling);
  onSettlingRef.current = onSettling;
  const settlingRef = useRef(false);
  const setSettling = (v: boolean) => {
    if (settlingRef.current === v) return;
    settlingRef.current = v;
    onSettlingRef.current?.(v);
  };

  // While the layout unfolds, the view follows it. Once it settles (or the
  // user pans or zooms), the frame is frozen, so spreading nodes apart
  // actually looks spread out instead of sigma rescaling it to fit.
  const autoFit = useRef(true);
  const freeze = () => {
    const sigma = sigmaRef.current;
    if (!sigma || !autoFit.current) return;
    autoFit.current = false;
    sigma.setCustomBBox(sigma.getBBox());
  };
  const refit = (animate = true) => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    autoFit.current = true;
    sigma.setCustomBBox(null);
    sigma.refresh();
    if (animate) sigma.getCamera().animatedReset({ duration: 400 });
    else sigma.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
    if (!layoutRef.current?.settling) freeze();
  };

  useEffect(() => {
    if (!container.current) return;
    const smallGraph = graph.order <= 120;
    const bigGraph = graph.order > 1500;
    // Shrink nodes as the graph grows, so thousands of songs read as a
    // cloud at full view instead of overlapping blobs. Zooming in grows them.
    const autoSize =
      Math.min(1, Math.max(0.45, Math.sqrt(500 / graph.order) * 1.3)) *
      Math.min(1, Math.sqrt(container.current.clientWidth / 1100));
    fontFamily = getComputedStyle(document.body).fontFamily || fontFamily;
    autoFit.current = true;

    // Sigma needs coordinates up front; the worker replaces them right away.
    graph.updateEachNodeAttributes((_, a) => {
      if (typeof a.x !== "number") {
        a.x = Math.random();
        a.y = Math.random();
      }
      return a;
    });

    const d = state.current.display;
    const sigma = new Sigma(graph, container.current, {
      labelColor: { color: "#d4d4d8" },
      labelFont: fontFamily,
      labelWeight: "500",
      labelSize: d.labelSize,
      labelDensity: bigGraph ? 0.35 : 0.6,
      labelGridCellSize: bigGraph ? 140 : 100,
      labelRenderedSizeThreshold: labelThreshold(d.textFade),
      zIndex: true,
      defaultDrawNodeHover: drawHover,
      hideEdgesOnMove: graph.size > 20000,
      minCameraRatio: 0.01,
      maxCameraRatio: 8,
      stagePadding: 88,
      nodeReducer: (node, data) => {
        const { selected, highlight, hovered, display } = state.current;
        const res: Partial<NodeDisplayData> = { ...data, size: data.size * display.nodeSize * autoSize };
        const kind = graph.getNodeAttribute(node, "kind");
        if (kind === "playlist" && smallGraph) res.forceLabel = true;

        const focus = hovered ?? selected;
        if (focus && graph.hasNode(focus)) {
          if (node === focus || graph.areNeighbors(node, focus)) {
            // Forcing dozens of labels makes them overlap; let sigma pick then.
            res.forceLabel = node === focus || graph.degree(focus) <= 20;
            res.zIndex = 3;
          } else {
            res.color = DIM_NODE;
            res.label = "";
            res.zIndex = 0;
          }
        } else if (highlight) {
          if (highlight.has(node)) {
            res.forceLabel = highlight.size <= 60;
            res.zIndex = 3;
          } else {
            res.color = DIM_NODE;
            res.label = "";
          }
        }
        if (node === selected) res.highlighted = true;
        return res;
      },
      edgeReducer: (edge, data) => {
        const { selected, highlight, hovered, display } = state.current;
        const focus = hovered ?? selected;
        const res: Partial<EdgeDisplayData> = { ...data, size: (data.size ?? 1) * display.linkThickness };
        if (display.tintLinks) res.color = graph.getEdgeAttribute(edge, "tint") ?? data.color;
        if (focus && graph.hasNode(focus)) {
          if (graph.hasExtremity(edge, focus)) {
            res.color = "#a1a1aa";
            res.zIndex = 2;
          } else {
            res.hidden = graph.size > 3000;
            res.color = DIM_EDGE;
          }
        } else if (highlight) {
          const [s, t] = graph.extremities(edge);
          if (!highlight.has(s) && !highlight.has(t)) res.color = DIM_EDGE;
        }
        return res;
      },
    });
    sigmaRef.current = sigma;

    setSettling(true);
    const layout = new ForceLayout(graph, forcesRef.current, (done) => {
      setSettling(!done);
      if (done) freeze();
    });
    layoutRef.current = layout;

    // Any manual pan or zoom stops the view from following the layout.
    const captor = sigma.getMouseCaptor();
    captor.on("wheel", freeze);
    sigma.getTouchCaptor().on("touchmove", freeze);

    // Drag nodes around; the layout follows, like in Obsidian.
    let dragged: string | null = null;
    let moved = false;
    sigma.on("downNode", ({ node }) => {
      dragged = node;
      moved = false;
    });
    captor.on("mousedown", () => !dragged && freeze());
    captor.on("mousemovebody", (e) => {
      if (!dragged) return;
      moved = true;
      const pos = sigma.viewportToGraph(e);
      layout.drag(dragged, pos.x, pos.y);
      e.preventSigmaDefault();
      e.original.preventDefault();
      e.original.stopPropagation();
    });
    const release = () => {
      if (dragged) layout.release(dragged);
      dragged = null;
    };
    captor.on("mouseup", release);
    captor.on("mouseleave", release);

    sigma.on("clickNode", ({ node }) => {
      if (!moved) onSelectRef.current(node);
    });
    sigma.on("clickStage", () => onSelectRef.current(null));
    sigma.on("enterNode", ({ node }) => {
      state.current.hovered = node;
      container.current!.style.cursor = "pointer";
      sigma.refresh({ skipIndexation: true });
    });
    sigma.on("leaveNode", () => {
      state.current.hovered = null;
      container.current!.style.cursor = "";
      sigma.refresh({ skipIndexation: true });
    });

    return () => {
      layout.stop();
      sigma.kill();
      sigmaRef.current = null;
      layoutRef.current = null;
    };
  }, [graph]);

  useEffect(() => {
    if (!layoutRef.current) return;
    layoutRef.current.apply(forces);
    setSettling(true);
  }, [forces]);

  useEffect(() => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    sigma.setSetting("labelSize", display.labelSize);
    sigma.setSetting("labelRenderedSizeThreshold", labelThreshold(display.textFade));
    sigma.refresh();
  }, [display]);

  useEffect(() => {
    state.current.selected = selected;
    state.current.highlight = highlight;
    const sigma = sigmaRef.current;
    if (!sigma) return;
    sigma.refresh({ skipIndexation: true });

    if (selected && graph.hasNode(selected)) {
      // Only pan when the node is off screen, so clicking doesn't jump around.
      const pos = sigma.getNodeDisplayData(selected);
      if (pos) {
        const vp = sigma.framedGraphToViewport(pos);
        const { width, height } = sigma.getDimensions();
        const margin = 40;
        if (vp.x < margin || vp.y < margin || vp.x > width - margin || vp.y > height - margin) {
          sigma.getCamera().animate({ x: pos.x, y: pos.y }, { duration: 500 });
        }
      }
    }
  }, [selected, highlight, graph]);

  useImperativeHandle(handle, () => ({
    animate: () => {
      layoutRef.current?.reheat(1);
      setSettling(true);
      refit();
    },
    fit: () => refit(),
    exportPng: async (whole) => {
      const sigma = sigmaRef.current;
      if (!sigma) return;
      const bbox = sigma.getCustomBBox();
      const { width, height } = sigma.getDimensions();
      const scale = whole ? Math.max(1, 4000 / Math.max(width, height)) : 2;
      await downloadAsPNG(sigma, {
        fileName: whole ? "playlist-graph-full" : "playlist-graph-view",
        backgroundColor: BACKGROUND,
        width: Math.round(width * scale),
        height: Math.round(height * scale),
        cameraState: whole ? { x: 0.5, y: 0.5, ratio: 1, angle: 0 } : sigma.getCamera().getState(),
        sigmaSettings: { labelSize: display.labelSize * scale, labelRenderedSizeThreshold: labelThreshold(display.textFade) },
        withTempRenderer: (tmp) => {
          if (!whole && bbox) tmp.setCustomBBox(bbox);
        },
      });
    },
  }));

  const zoom = (factor: number | null) => {
    const camera = sigmaRef.current?.getCamera();
    if (!camera) return;
    if (factor === null) refit();
    else if (factor > 1) camera.animatedUnzoom({ duration: 250, factor });
    else camera.animatedZoom({ duration: 250, factor: 1 / factor });
  };

  return (
    <div className="relative h-full w-full">
      <div ref={container} className="absolute inset-0" />
      <div className="glass absolute bottom-3 left-3 hidden flex-col overflow-hidden rounded-xl md:flex">
        {(
          [
            ["Zoom in", 0.6, <path key="p" d="M12 6v12M6 12h12" />],
            ["Zoom out", 1.6, <path key="p" d="M6 12h12" />],
            ["Fit to screen", null, <path key="p" d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />],
          ] as const
        ).map(([title, factor, icon]) => (
          <button
            key={title}
            title={title}
            aria-label={title}
            onClick={() => zoom(factor)}
            className="grid h-9 w-9 place-items-center text-zinc-400 transition hover:bg-white/10 hover:text-white"
          >
            <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              {icon}
            </svg>
          </button>
        ))}
      </div>
    </div>
  );
}
