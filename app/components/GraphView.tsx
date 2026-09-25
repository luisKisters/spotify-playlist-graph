"use client";

import { useEffect, useRef } from "react";
import Sigma from "sigma";
import type Graph from "graphology";
import type { NodeDisplayData, PartialButFor } from "sigma/types";

interface Props {
  graph: Graph;
  selected: string | null;
  /** Nodes matching the current search; everything else is dimmed. */
  highlight: Set<string> | null;
  onSelect: (id: string | null) => void;
}

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

export default function GraphView({ graph, selected, highlight, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const sigmaRef = useRef<Sigma | null>(null);
  const state = useRef({ selected, highlight, hovered: null as string | null });
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;

  useEffect(() => {
    if (!container.current) return;
    const smallGraph = graph.order <= 120;
    fontFamily = getComputedStyle(document.body).fontFamily || fontFamily;

    const sigma = new Sigma(graph, container.current, {
      labelColor: { color: "#d1d5db" },
      labelFont: fontFamily,
      labelWeight: "500",
      labelSize: 12,
      labelDensity: 0.6,
      labelRenderedSizeThreshold: 6,
      zIndex: true,
      defaultDrawNodeHover: drawHover,
      minCameraRatio: 0.05,
      maxCameraRatio: 3,
      stagePadding: 40,
      nodeReducer: (node, data) => {
        const { selected, highlight, hovered } = state.current;
        const res: Partial<NodeDisplayData> = { ...data };
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
            res.forceLabel = true;
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
        const { selected, highlight, hovered } = state.current;
        const focus = hovered ?? selected;
        const res = { ...data };
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

    sigma.on("clickNode", ({ node }) => onSelectRef.current(node));
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
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [graph]);

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

  const zoom = (factor: number | null) => {
    const camera = sigmaRef.current?.getCamera();
    if (!camera) return;
    if (factor === null) camera.animatedReset({ duration: 400 });
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
