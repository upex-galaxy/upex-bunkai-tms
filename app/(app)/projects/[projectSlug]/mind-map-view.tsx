'use client';

import type { ModuleTreeNode } from '@lib/types';
import { cn, shortSlug } from '@lib/utils';
import { Minus, Plus } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

// Topology mind-map: a left-to-right node-link graph of the real tree
// (module → user story → ATC). The mockup's Coverage / Bug-density modes need
// run + bug data that doesn't exist yet (§7 data gates), so they render disabled
// ("soon"). Pan via scroll, zoom via the +/−/Fit controls.

type NodeKind = 'module' | 'story' | 'atc';

interface GraphNode {
  id: string
  atcId?: string
  label: string
  sub?: string
  kind: NodeKind
  status?: string
  layer?: string
  x: number
  y: number
}

interface GraphEdge {
  from: string
  to: string
}

const COL = 250; // horizontal gap between depth levels
const ROW = 34; // vertical gap between sibling leaves
const PAD = 36;
const NODE_W = 200;
const NODE_H = 26;

const STATUS_VAR: Record<string, string> = {
  pass: 'var(--pass)',
  fail: 'var(--fail)',
  blocked: 'var(--blocked)',
  skipped: 'var(--skipped)',
  running: 'var(--running)',
  unrun: 'var(--skipped)',
};

function buildGraph(roots: ModuleTreeNode[]) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const yById = new Map<string, number>();
  let cursor = 0;
  let maxDepth = 0;

  const place = (
    node: Omit<GraphNode, 'x' | 'y'>,
    depth: number,
    childIds: string[],
  ): string => {
    let y: number;
    if (childIds.length > 0) {
      const first = yById.get(childIds[0]) ?? 0;
      const last = yById.get(childIds[childIds.length - 1]) ?? first;
      y = (first + last) / 2;
    }
    else {
      y = cursor * ROW + PAD;
      cursor += 1;
    }
    yById.set(node.id, y);
    maxDepth = Math.max(maxDepth, depth);
    nodes.push({ ...node, x: depth * COL + PAD, y });
    for (const c of childIds) { edges.push({ from: node.id, to: c }); }
    return node.id;
  };

  const placeAtc = (atc: ModuleTreeNode['atcs'][number], depth: number): string =>
    place(
      { id: `a:${atc.id}`, atcId: atc.id, label: shortSlug(atc.slug), sub: atc.title, kind: 'atc', status: atc.status, layer: atc.layer },
      depth,
      [],
    );

  const placeStory = (story: ModuleTreeNode['user_stories'][number], depth: number): string => {
    const kids = story.atcs.map(a => placeAtc(a, depth + 1));
    return place(
      { id: `s:${story.id}`, label: story.external_id ?? 'US', sub: story.title, kind: 'story' },
      depth,
      kids,
    );
  };

  const placeModule = (mod: ModuleTreeNode, depth: number): string => {
    const kids: string[] = [];
    for (const child of mod.children) { kids.push(placeModule(child, depth + 1)); }
    for (const story of mod.user_stories) { kids.push(placeStory(story, depth + 1)); }
    const storyIds = new Set(mod.user_stories.map(s => s.id));
    for (const atc of mod.atcs.filter(a => !storyIds.has(a.user_story_id))) {
      kids.push(placeAtc(atc, depth + 1));
    }
    return place(
      { id: `m:${mod.id}`, label: mod.name, kind: 'module' },
      depth,
      kids,
    );
  };

  for (const root of roots) { placeModule(root, 0); }

  const width = (maxDepth + 1) * COL + PAD;
  const height = Math.max(cursor, 1) * ROW + PAD;
  return { nodes, edges, width, height };
}

const MODES = [
  { key: 'topology', label: 'Topology', soon: false },
  { key: 'coverage', label: 'Coverage', soon: true },
  { key: 'bug-density', label: 'Bug density', soon: true },
];

const LEGEND: [string, string][] = [
  ['Module', 'var(--fg-3)'],
  ['User story', 'var(--accent)'],
  ['Pass', 'var(--pass)'],
  ['Fail', 'var(--fail)'],
  ['Blocked', 'var(--blocked)'],
  ['Unrun', 'var(--skipped)'],
];

export function MindMapView({ tree, projectSlug }: { tree: ModuleTreeNode[], projectSlug: string }) {
  const router = useRouter();
  const { nodes, edges, width, height } = useMemo(() => buildGraph(tree), [tree]);
  const [scale, setScale] = useState(1);
  const nodeById = useMemo(() => new Map(nodes.map(n => [n.id, n])), [nodes]);

  const empty = nodes.length === 0;

  return (
    <main className="relative flex flex-1 overflow-hidden bg-surface-0">
      {/* Mode switcher */}
      <div className="absolute left-3 top-3 z-10 flex items-center gap-2">
        <div className="inline-flex items-center gap-0.5 rounded-2 border border-stroke-1 bg-surface-1 p-0.5">
          {MODES.map(m => (
            <button
              key={m.key}
              type="button"
              disabled={m.soon}
              aria-pressed={m.key === 'topology'}
              title={m.soon ? 'Needs run / bug data — coming soon' : undefined}
              className={cn(
                'inline-flex items-center gap-1 rounded-1 px-2.5 py-1 text-xs font-medium',
                m.key === 'topology'
                  ? 'bg-surface-3 text-fg-0'
                  : 'text-fg-3',
                m.soon && 'cursor-not-allowed opacity-50',
              )}
            >
              {m.label}
              {m.soon && <span className="ml-1 font-mono text-[9px] uppercase text-fg-4">soon</span>}
            </button>
          ))}
        </div>
      </div>

      {/* Zoom controls */}
      <div className="absolute right-3 top-3 z-10 flex items-center gap-1">
        <button
          type="button"
          onClick={() => setScale(s => Math.min(1.8, +(s + 0.2).toFixed(2)))}
          title="Zoom in"
          aria-label="Zoom in"
          className="flex size-6 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 text-fg-2 hover:text-fg-0 active:scale-95"
        >
          <Plus size={13} />
        </button>
        <button
          type="button"
          onClick={() => setScale(s => Math.max(0.5, +(s - 0.2).toFixed(2)))}
          title="Zoom out"
          aria-label="Zoom out"
          className="flex size-6 items-center justify-center rounded-1 border border-stroke-2 bg-surface-2 text-fg-2 hover:text-fg-0 active:scale-95"
        >
          <Minus size={13} />
        </button>
        <button
          type="button"
          onClick={() => setScale(1)}
          title="Reset zoom"
          className="flex h-6 items-center rounded-1 border border-stroke-2 bg-surface-2 px-2 text-xs text-fg-2 hover:text-fg-0 active:scale-95"
        >
          Fit
        </button>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex items-center gap-3 rounded-3 border border-stroke-2 bg-surface-2/90 px-3 py-2 text-xs backdrop-blur">
        {LEGEND.map(([label, color]) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-fg-2">
            <span className="inline-block size-2 rounded-[2px]" style={{ background: color }} />
            {label}
          </span>
        ))}
      </div>

      {empty
        ? (
            <div className="flex flex-1 items-center justify-center text-sm text-fg-4">
              Nothing to map yet — add modules, stories and ATCs to see the topology.
            </div>
          )
        : (
            <div
              className="flex-1 overflow-auto"
              style={{
                backgroundImage: 'radial-gradient(rgba(255,255,255,0.04) 1px, transparent 1px)',
                backgroundSize: '22px 22px',
              }}
            >
              <svg
                width={width * scale}
                height={height * scale}
                viewBox={`0 0 ${width} ${height}`}
                className="block"
              >
                {edges.map((e, i) => {
                  const a = nodeById.get(e.from);
                  const b = nodeById.get(e.to);
                  if (!a || !b) { return null; }
                  const x1 = a.x + NODE_W;
                  const y1 = a.y;
                  const x2 = b.x;
                  const y2 = b.y;
                  const mid = (x1 + x2) / 2;
                  return (
                    <path
                      key={i}
                      d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
                      fill="none"
                      stroke="var(--stroke-3)"
                      strokeWidth={1}
                    />
                  );
                })}
                {nodes.map((n) => {
                  const top = n.y - NODE_H / 2;
                  const accent
                    = n.kind === 'module'
                      ? 'var(--fg-3)'
                      : n.kind === 'story'
                        ? 'var(--accent)'
                        : STATUS_VAR[n.status ?? 'unrun'] ?? 'var(--skipped)';
                  const inner = (
                    <g>
                      <rect
                        x={n.x}
                        y={top}
                        width={NODE_W}
                        height={NODE_H}
                        rx={5}
                        fill="var(--bg-2)"
                        stroke="var(--stroke-2)"
                        strokeWidth={1}
                      />
                      <rect x={n.x} y={top} width={3} height={NODE_H} rx={1.5} fill={accent} />
                      <text
                        x={n.x + 12}
                        y={n.y + 4}
                        fontSize={11.5}
                        fill="var(--fg-1)"
                        className="font-sans"
                      >
                        <tspan fontFamily="var(--font-mono)" fill={n.kind === 'story' ? 'var(--accent)' : 'var(--fg-3)'}>
                          {n.label}
                        </tspan>
                        {n.sub ? <tspan fill="var(--fg-2)">{`  ${truncate(n.sub, 22)}`}</tspan> : null}
                      </text>
                      {n.layer
                        ? (
                            <text x={n.x + NODE_W - 10} y={n.y + 4} fontSize={9.5} textAnchor="end" fill="var(--fg-4)" fontFamily="var(--font-mono)">
                              {n.layer}
                            </text>
                          )
                        : null}
                    </g>
                  );
                  return n.atcId
                    ? (
                        <g
                          key={n.id}
                          role="link"
                          tabIndex={0}
                          className="cursor-pointer"
                          onClick={() => router.push(`/projects/${projectSlug}/atcs/${n.atcId}`)}
                          onKeyDown={(ev) => {
                            if (ev.key === 'Enter') { router.push(`/projects/${projectSlug}/atcs/${n.atcId}`); }
                          }}
                        >
                          {inner}
                        </g>
                      )
                    : <g key={n.id}>{inner}</g>;
                })}
              </svg>
            </div>
          )}
    </main>
  );
}

function truncate(s: string, n: number): string {
  return s.length > n ? `${s.slice(0, n - 1)}…` : s;
}
