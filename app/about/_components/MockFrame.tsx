import type { ReactNode } from 'react';

// Shared chrome for every mini-mockup on /about. Reproduces the real app shell
// at a reduced scale: window bar, collapsed explorer rail, tab strip. The goal
// is recognition — a reader who later opens Bunkai should feel they have
// already seen the screen. Every surface/stroke/radius comes from the same
// tokens the live UI uses (DESIGN.md §3-§5), never a one-off colour.

export function MockFrame({
  rail,
  tabs,
  activeTab,
  children,
}: {
  rail?: ReactNode
  tabs?: string[]
  activeTab?: string
  children: ReactNode
}) {
  return (
    <div className="overflow-hidden rounded-3 border border-stroke-2 bg-surface-1 shadow-pop">
      {/* window bar */}
      <div className="flex items-center gap-2 border-b border-stroke-1 bg-surface-0 px-3 py-2">
        <span className="flex gap-1.5">
          <i className="size-2 rounded-full bg-surface-5" />
          <i className="size-2 rounded-full bg-surface-5" />
          <i className="size-2 rounded-full bg-surface-5" />
        </span>
        <span className="ml-2 inline-flex items-center gap-1.5">
          <span className="inline-flex size-4 items-center justify-center rounded-1 bg-accent font-jp text-[9px] font-bold leading-none text-white">
            分
          </span>
          <span className="font-mono text-2xs text-fg-4">bunkai.io</span>
        </span>
      </div>

      <div className="flex min-h-[268px]">
        {rail && (
          <aside className="w-[178px] shrink-0 border-r border-stroke-1 bg-surface-1 p-2">
            {rail}
          </aside>
        )}

        <div className="min-w-0 flex-1 bg-surface-1">
          {tabs && tabs.length > 0 && (
            <div className="flex items-stretch border-b border-stroke-1 bg-surface-0">
              {tabs.map(t => (
                <span
                  key={t}
                  className={
                    t === activeTab
                      ? 'border-r border-stroke-1 border-t-2 border-t-accent bg-surface-1 px-3 py-1.5 font-mono text-2xs text-fg-0'
                      : 'border-r border-stroke-1 px-3 py-1.5 font-mono text-2xs text-fg-4'
                  }
                >
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="p-3">{children}</div>
        </div>
      </div>
    </div>
  );
}

// Explorer rail contents shared by most mockups. `active` highlights one node
// so each step of the walkthrough shows where in the tree the user is standing.
export function MockRail({ active }: { active?: string }) {
  const nodes: { label: string, depth: number, kind: 'folder' | 'story' | 'atc' | 'test' }[] = [
    { label: 'Checkout', depth: 0, kind: 'folder' },
    { label: 'Carrito', depth: 1, kind: 'folder' },
    { label: 'Pago', depth: 1, kind: 'folder' },
    { label: 'BK-166 · Login', depth: 2, kind: 'story' },
    { label: 'ATC-014', depth: 2, kind: 'atc' },
    { label: 'TEST-07', depth: 2, kind: 'test' },
    { label: 'Facturación', depth: 0, kind: 'folder' },
  ];
  return (
    <div className="flex flex-col gap-1">
      <p className="px-1 pb-1 font-mono text-2xs uppercase tracking-widest text-fg-4">Explorador</p>
      {nodes.map(n => (
        <span
          key={n.label}
          style={{ paddingLeft: 4 + n.depth * 11 }}
          className={
            n.label === active
              ? 'flex items-center gap-1.5 rounded-2 bg-surface-3 py-1 pr-2 text-xs text-fg-0'
              : 'flex items-center gap-1.5 rounded-2 py-1 pr-2 text-xs text-fg-2'
          }
        >
          <i
            className={
              n.kind === 'folder'
                ? 'size-1.5 rounded-[1px] bg-fg-4'
                : n.kind === 'story'
                  ? 'size-1.5 rounded-full bg-accent'
                  : n.kind === 'atc'
                    ? 'size-1.5 rounded-full bg-layer-ui'
                    : 'size-1.5 rounded-full bg-fg-3'
            }
          />
          <span className={n.kind === 'folder' ? '' : 'font-mono'}>{n.label}</span>
        </span>
      ))}
    </div>
  );
}
