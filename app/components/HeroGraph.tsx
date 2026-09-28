"use client";

import { useEffect, useRef } from "react";
import { forceSimulation } from "d3-force";
import { applyForces, seedPositions, type SimLink, type SimNode } from "@/lib/forces";
import { PALETTE } from "@/lib/graph";
import { seeded } from "@/lib/rand";

interface Node extends SimNode {
  color: string;
  hub: boolean;
  phase: number;
}

// A made-up library: a few scenes, each a handful of playlists with their
// songs around them, plus some songs shared across scenes.
function makeGraph() {
  const rand = seeded(11);
  const nodes: Node[] = [];
  const links: SimLink[] = [];
  const add = (cluster: number, size: number, hub: boolean) => {
    const n: Node = {
      index: nodes.length,
      cluster,
      size,
      degree: 0,
      color: PALETTE[cluster],
      hub,
      phase: rand() * Math.PI * 2,
    };
    nodes.push(n);
    return n;
  };
  const link = (a: Node, b: Node) => {
    a.degree++;
    b.degree++;
    links.push({ source: a, target: b, w: 1 });
  };
  const hubs: Node[][] = [];
  const scenes = [7, 5, 6, 4, 5, 3, 4];
  scenes.forEach((count, c) => {
    const list = Array.from({ length: count }, () => add(c, 6 + rand() * 9, true));
    hubs.push(list);
    list.forEach((h, i) => i > 0 && rand() < 0.7 && link(h, list[Math.floor(rand() * i)]));
    const songs = 30 + Math.floor(rand() * 20) * count;
    for (let i = 0; i < songs; i++) {
      const s = add(c, 1.4 + rand() * 1.4, false);
      link(s, list[Math.floor(rand() * list.length)]);
      if (rand() < 0.12) link(s, list[Math.floor(rand() * list.length)]);
      if (rand() < 0.04) {
        const other = hubs[Math.floor(rand() * hubs.length)];
        link(s, other[Math.floor(rand() * other.length)]);
      }
    }
  });
  return { nodes, links };
}

const SETTINGS = { centerForce: 0.15, repelForce: 8, linkForce: 0.5, linkDistance: 90, clusterForce: 0.85 };

/**
 * The landing page backdrop: a graph that grows into islands as its layout
 * runs, then slowly turns. Pure canvas, so it costs nothing once settled.
 */
export default function HeroGraph({ className }: { className?: string }) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const ctx = el.getContext("2d")!;
    const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const { nodes, links } = makeGraph();
    const sim = forceSimulation<SimNode, SimLink>(nodes).stop().alphaDecay(0.03);
    const anchors = applyForces(sim, nodes, links, SETTINGS);
    seedPositions(nodes, links, anchors, seeded(5));
    if (still) while (sim.alpha() > 0.02) sim.tick();

    let width = 0;
    let height = 0;
    const resize = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = el.clientWidth;
      height = el.clientHeight;
      el.width = width * dpr;
      el.height = height * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener("resize", resize);

    const mouse = { x: 0, y: 0, tx: 0, ty: 0 };
    const move = (e: PointerEvent) => {
      mouse.tx = (e.clientX / window.innerWidth - 0.5) * 2;
      mouse.ty = (e.clientY / window.innerHeight - 0.5) * 2;
    };
    window.addEventListener("pointermove", move);

    let frame = 0;
    let angle = 0;
    let scale = 0;
    let last = performance.now();
    const draw = (now: number) => {
      const dt = Math.min(50, now - last);
      last = now;
      // Grow the layout a few ticks per frame, so the islands form on screen.
      const start = performance.now();
      while (sim.alpha() > 0.02 && performance.now() - start < 8) sim.tick();
      if (!still) angle += dt * 0.000018;
      mouse.x += (mouse.tx - mouse.x) * 0.04;
      mouse.y += (mouse.ty - mouse.y) * 0.04;

      let r = 1;
      for (const n of nodes) r = Math.max(r, Math.hypot(n.x!, n.y!) + n.size);
      const target = (Math.min(width, height) * 0.5) / r;
      scale = scale ? scale + (target - scale) * 0.08 : target;
      const cx = width * (width > 900 ? 0.64 : 0.5) + mouse.x * 12;
      const cy = height * 0.5 + mouse.y * 12;
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      const px = (n: SimNode) => cx + (n.x! * cos - n.y! * sin) * scale;
      const py = (n: SimNode) => cy + (n.x! * sin + n.y! * cos) * scale;
      const dot = Math.max(0.6, Math.min(1.4, scale * 2.5));

      ctx.clearRect(0, 0, width, height);
      ctx.lineWidth = 0.6;
      for (const l of links) {
        const a = l.source as Node;
        ctx.strokeStyle = a.color;
        ctx.globalAlpha = a.cluster === l.target.cluster ? 0.22 : 0.07;
        ctx.beginPath();
        ctx.moveTo(px(a), py(a));
        ctx.lineTo(px(l.target), py(l.target));
        ctx.stroke();
      }
      for (const n of nodes as Node[]) {
        const twinkle = still || n.hub ? 1 : 0.75 + 0.25 * Math.sin(now * 0.0015 + n.phase);
        ctx.globalAlpha = (n.hub ? 1 : 0.85) * twinkle;
        ctx.fillStyle = n.color;
        if (n.hub) {
          ctx.shadowColor = n.color;
          ctx.shadowBlur = 18;
        }
        ctx.beginPath();
        ctx.arc(px(n), py(n), n.size * dot * (n.hub ? 0.9 : 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };
    frame = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointermove", move);
    };
  }, []);

  return <canvas ref={canvas} className={className} aria-hidden />;
}
