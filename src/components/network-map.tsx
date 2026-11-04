"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph2D from "react-force-graph-2d";
import { TIER_SIZE } from "@/lib/config";
import { buildGraph, type GLink, type GNode } from "@/lib/graph";
import type { Person } from "@/lib/types";

type Pal = { w: string[]; other: string; ink: string; ink2: string; ink3: string; line: string; bg: string; clay: string };

function readPalette(): Pal {
  const s = getComputedStyle(document.documentElement);
  const v = (n: string) => s.getPropertyValue(n).trim();
  return {
    w: [v("--w1"), v("--w2"), v("--w3")], other: v("--w-other"),
    ink: v("--ink"), ink2: v("--ink-2"), ink3: v("--ink-3"), line: v("--line"), bg: v("--bg"), clay: v("--clay-strong"),
  };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** The 3 biggest worlds get a colour. Everything else is grey. */
export function topWorlds(people: Person[]): { name: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of people) counts.set(p.world, (counts.get(p.world) || 0) + 1);
  return Array.from(counts, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
}

export default function NetworkMap({
  people, world, selectedId, onSelect,
}: { people: Person[]; world: string; selectedId: string | null; onSelect: (id: string | null) => void }) {
  const wrap = useRef<HTMLDivElement>(null);
  const fg = useRef<any>(null);
  const [size, setSize] = useState({ w: 800, h: 520 });
  const [pal, setPal] = useState<Pal | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const fitted = useRef(false);

  const graph = useMemo(() => buildGraph(people), [people]);
  const few = graph.nodes.length <= 14; // small map: name every dot
  const ranked = useMemo(() => topWorlds(people).slice(0, 3).map((x) => x.name), [people]);

  useEffect(() => {
    const update = () => setPal(readPalette());
    update();
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", update);
    return () => { mo.disconnect(); mq.removeEventListener("change", update); };
  }, []);

  useEffect(() => {
    if (!wrap.current) return;
    const ro = new ResizeObserver(([e]) => setSize({ w: Math.floor(e.contentRect.width), h: Math.max(420, Math.min(680, Math.floor(window.innerHeight * 0.66))) }));
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const g = fg.current;
    if (!g) return;
    g.d3Force("charge")?.strength(-70);
    g.d3Force("link")?.distance((l: any) => (l.kind === "you" ? 95 : 38)).strength((l: any) => (l.kind === "you" ? 0.15 : 0.6));
    g.d3ReheatSimulation?.();
  }, [graph, pal]);

  const colorOf = (n: GNode) => {
    if (!pal) return "#888";
    if (n.me) return pal.ink;
    const i = ranked.indexOf(n.person!.world);
    return i >= 0 ? pal.w[i] : pal.other;
  };

  if (!pal) return <div ref={wrap} className="card" style={{ height: 420 }} />;

  return (
    <div ref={wrap} className="card overflow-hidden !p-0" style={{ height: size.h }}>
      <ForceGraph2D
        ref={fg}
        graphData={graph as { nodes: GNode[]; links: GLink[] }}
        width={size.w}
        height={size.h}
        backgroundColor="rgba(0,0,0,0)"
        cooldownTicks={120}
        onEngineStop={() => {
          if (!fitted.current) { fitted.current = true; fg.current?.zoomToFit(400, few ? 40 : 24); }
        }}
        nodeRelSize={4}
        nodeLabel={(n: any) => (n.me ? "You" : esc(`${n.person.name}${n.person.company ? " · " + n.person.company : ""}`))}
        onNodeHover={(n: any) => setHover(n ? n.id : null)}
        onNodeClick={(n: any) => onSelect(n.me ? null : n.id)}
        onBackgroundClick={() => onSelect(null)}
        linkColor={(l: any) => (l.kind === "you" ? pal.ink3 : l.kind === "company" ? pal.ink3 : pal.ink2)}
        linkWidth={(l: any) => (l.kind === "you" ? 0.4 : 1.4)}
        linkLineDash={(l: any) => (l.kind === "company" ? [3, 3] : null)}
        nodeCanvasObject={(node: any, ctx, scale) => {
          const n = node as GNode & { x: number; y: number };
          const r = n.me ? 10 : TIER_SIZE[n.person!.tier] ?? 5;
          const dim = !!world && !n.me && n.person!.world !== world;
          const picked = n.id === selectedId;
          ctx.globalAlpha = dim ? 0.18 : 1;
          ctx.beginPath();
          ctx.arc(n.x, n.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = colorOf(n);
          ctx.fill();
          ctx.lineWidth = 2 / scale;
          ctx.strokeStyle = pal.bg;
          ctx.stroke();
          if (picked) {
            ctx.beginPath();
            ctx.arc(n.x, n.y, r + 3 / scale + 1, 0, 2 * Math.PI);
            ctx.lineWidth = 2 / scale;
            ctx.strokeStyle = pal.clay;
            ctx.stroke();
          }
          const big = n.me || few || ["Ally", "Inner circle"].includes(n.person!.tier);
          if (!dim && (big || picked || hover === n.id || scale > 1.6)) {
            const fs = Math.max(11 / scale, 3);
            ctx.font = `${fs}px ui-sans-serif, system-ui, sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            const ty = n.y + r + 3 / scale;
            ctx.lineJoin = "round";
            ctx.lineWidth = 3 / scale;
            ctx.strokeStyle = pal.bg; // halo so the name stays readable over lines
            const label = n.name.length > 18 ? n.name.slice(0, 17) + "…" : n.name;
            ctx.strokeText(label, n.x, ty);
            ctx.fillStyle = pal.ink;
            ctx.fillText(label, n.x, ty);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(node.x, node.y, (node.me ? 10 : TIER_SIZE[node.person.tier] ?? 5) + 4, 0, 2 * Math.PI);
          ctx.fill();
        }}
      />
    </div>
  );
}
