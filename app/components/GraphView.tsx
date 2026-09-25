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
  handle?: Ref<GraphHandle>;
}

const BACKGROUND = "#0b0d10";
const DIM_NODE = "#2a2f36";
const DIM_EDGE = "#121419";
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

export default function GraphView({ graph, forces, display, selected, highlight, onSelect, handle }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const layoutRef = useRef<ForceLayout | null>(null);
  const state = useRef({ selected, highlight, hovered: null as string | null, display });
  state.current.display = display;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const forcesRef = useRef(forces);
  forcesRef.current = forces;

  // Freeze the coordinate frame so spreading nodes apart actually looks spread
  // out, instead of sigma rescaling everything back to fit the screen.
  const refit = (animate = true) => {
    const sigma = sigmaRef.current;
    if (!sigma) return;
    sigma.setCustomBBox(null);
    sigma.refresh();
    sigma.setCustomBBox(sigma.getBBox());
    if (animate) sigma.getCamera().animatedReset({ duration: 400 });
    else sigma.getCamera().setState({ x: 0.5, y: 0.5, ratio: 1, angle: 0 });
  };

  useEffect(() => {
    if (!container.current) return;
    const smallGraph = graph.order <= 120;
    fontFamily = getComputedStyle(document.body).fontFamily || fontFamily;

    const layout = new ForceLayout(graph, forcesRef.current);
    layoutRef.current = layout;

    const d = state.current.display;
    const sigma = new Sigma(graph, container.current, {
      labelColor: { color: "#d1d5db" },
      labelFont: fontFamily,
      labelWeight: "500",
      labelSize: d.labelSize,
      labelDensity: 0.6,
      labelRenderedSizeThreshold: labelThreshold(d.textFade),
      zIndex: true,
      defaultDrawNodeHover: drawHover,
      minCameraRatio: 0.02,
      maxCameraRatio: 8,
      stagePadding: 40,
      nodeReducer: (node, data) => {
        const { selected, highlight, hovered, display } = state.current;
        const res: Partial<NodeDisplayData> = { ...data, size: data.size * display.nodeSize };
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
        if (focus && graph.hasNode(focus)) {
          if (graph.hasExtremity(edge, focus)) {
            res.color = "#9aa0a8";
            res.zIndex = 2;
          } else {
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
    sigma.setCustomBBox(sigma.getBBox());
    layout.reheat(0.3);

    // Drag nodes around; the layout follows, like in Obsidian.
    let dragged: string | null = null;
    let moved = false;
    sigma.on("downNode", ({ node }) => {
      dragged = node;
      moved = false;
    });
    sigma.getMouseCaptor().on("mousemovebody", (e) => {
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
    sigma.getMouseCaptor().on("mouseup", release);
    sigma.getMouseCaptor().on("mouseleave", release);

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
    layoutRef.current?.apply(forces);
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
    animate: () => layoutRef.current?.reheat(1),
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
      <div className="absolute bottom-4 left-4 flex flex-col overflow-hidden rounded-xl border border-white/10 bg-panel/90 backdrop-blur">
        {[
          ["+", 0.6, "Zoom in"],
          ["−", 1.6, "Zoom out"],
          ["⤢", null, "Fit to screen"],
        ].map(([label, factor, title]) => (
          <button
            key={title as string}
            title={title as string}
            aria-label={title as string}
            onClick={() => zoom(factor as number | null)}
            className="h-9 w-9 text-lg text-zinc-300 transition hover:bg-white/10 hover:text-white"
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
