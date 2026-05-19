import { Wordmark } from '@components/layout/Wordmark';

const surfaces = [
  { token: '--bg-0', hex: '#0a0b0d', role: 'Page background' },
  { token: '--bg-1', hex: '#101216', role: 'Sidebar / chrome' },
  { token: '--bg-2', hex: '#14171c', role: 'Surface panels' },
  { token: '--bg-3', hex: '#1a1e25', role: 'Elevated / focused' },
  { token: '--bg-4', hex: '#232830', role: 'Hover' },
  { token: '--bg-5', hex: '#2d333c', role: 'Active / pressed' },
];

const foregrounds = [
  { token: '--fg-0', hex: '#f1f3f5', role: 'Strongest' },
  { token: '--fg-1', hex: '#d4d8de', role: 'Default body' },
  { token: '--fg-2', hex: '#9aa1ab', role: 'Secondary' },
  { token: '--fg-3', hex: '#6b727c', role: 'Tertiary / muted' },
  { token: '--fg-4', hex: '#4a5057', role: 'Disabled / placeholder' },
];

const accents = [
  { token: '--accent', hex: '#d9543f', role: 'Primary action / focus' },
  { token: '--accent-hi', hex: '#e87060', role: 'Hover' },
  { token: '--accent-glow', hex: 'rgba(217,84,63,.18)', role: 'Focus glow' },
  { token: '--accent-soft', hex: 'rgba(217,84,63,.10)', role: 'Pressed / tag' },
];

const signals = [
  { token: '--pass', hex: '#2fb673', role: 'Pass' },
  { token: '--fail', hex: '#e5484d', role: 'Fail' },
  { token: '--blocked', hex: '#e8a838', role: 'Blocked' },
  { token: '--skipped', hex: '#8a91a0', role: 'Skipped' },
  { token: '--running', hex: '#4f8cf7', role: 'Running' },
];

const layers = [
  { token: '--layer-ui', hex: '#8b6df0', role: 'UI' },
  { token: '--layer-api', hex: '#4f8cf7', role: 'API' },
  { token: '--layer-unit', hex: '#2fb673', role: 'Unit' },
];

const radii = [
  { token: '--r-1', value: '3px', role: 'Chips, kbd, tags' },
  { token: '--r-2', value: '5px', role: 'Buttons, inputs' },
  { token: '--r-3', value: '7px', role: 'Cards' },
  { token: '--r-4', value: '10px', role: 'Modals' },
];

const typeRamp = [
  { size: '10.5px', sample: 'FIELD LABEL', cls: 'text-2xs uppercase tracking-wider font-medium' },
  { size: '11px', sample: 'tag · chip · kbd', cls: 'text-xs font-medium font-mono' },
  { size: '12px', sample: 'Button text · input · table cell', cls: 'text-sm' },
  { size: '13px', sample: 'Body text — the default reading size in Bunkai.', cls: 'text-base' },
  { size: '16px', sample: 'Section heading', cls: 'text-lg font-semibold' },
  { size: '22px', sample: 'Page title', cls: 'text-2xl font-bold' },
];

function Swatch({
  bg,
  token,
  hex,
  role,
}: {
  bg: string
  token: string
  hex: string
  role: string
}) {
  return (
    <div className="overflow-hidden rounded-3 border border-stroke-2 shadow-card">
      <div
        className="h-20 w-full"
        style={{ background: bg }}
      />
      <div className="space-y-1 bg-surface-1 p-3">
        <div className="font-mono text-xs text-fg-0">{token}</div>
        <div className="font-mono text-2xs text-fg-3">{hex}</div>
        <div className="text-xs text-fg-2">{role}</div>
      </div>
    </div>
  );
}

export default function DesignTokensPage() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <header className="mb-10 flex items-end justify-between border-b border-stroke-2 pb-6">
        <div>
          <Wordmark size="lg" />
          <h1 className="mt-3 text-xl font-bold text-fg-0">Design tokens</h1>
          <p className="mt-1 text-sm text-fg-2">
            Canonical token surface. Compare side-by-side with
            {' '}
            <code className="font-mono text-fg-1">
              .context/designs/bunkai-test-management-tool/project/screens/
            </code>
            .
          </p>
        </div>
        <span className="status-chip" data-status="pass">
          Phase A · scaffold OK
        </span>
      </header>

      {/* Surfaces */}
      <section className="mb-12">
        <h2 className="mb-1 text-md font-semibold text-fg-0">Surfaces</h2>
        <p className="mb-4 text-sm text-fg-2">Warm-cool neutral, six steps. Dark-first.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          {surfaces.map(s => (
            <Swatch key={s.token} bg={`var(${s.token})`} {...s} />
          ))}
        </div>
      </section>

      {/* Foreground */}
      <section className="mb-12">
        <h2 className="mb-1 text-md font-semibold text-fg-0">Foreground tiers</h2>
        <p className="mb-4 text-sm text-fg-2">Text on bg-0. Five tiers.</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {foregrounds.map(f => (
            <div
              key={f.token}
              className="overflow-hidden rounded-3 border border-stroke-2 shadow-card"
            >
              <div className="bg-surface-0 p-4">
                <div className="text-md font-semibold" style={{ color: `var(${f.token})` }}>
                  Aa 123
                </div>
              </div>
              <div className="space-y-1 bg-surface-1 p-3">
                <div className="font-mono text-xs text-fg-0">{f.token}</div>
                <div className="font-mono text-2xs text-fg-3">{f.hex}</div>
                <div className="text-xs text-fg-2">{f.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Accent */}
      <section className="mb-12">
        <h2 className="mb-1 text-md font-semibold text-fg-0">Accent — vermillion</h2>
        <p className="mb-4 text-sm text-fg-2">
          Hanko-stamp nod. Primary actions + focus rings only.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {accents.map(a => (
            <Swatch key={a.token} bg={`var(${a.token})`} {...a} />
          ))}
        </div>
      </section>

      {/* Signal */}
      <section className="mb-12">
        <h2 className="mb-1 text-md font-semibold text-fg-0">Signal palette</h2>
        <p className="mb-4 text-sm text-fg-2">Status carries color; nothing else does.</p>
        <div className="flex flex-wrap gap-3">
          {signals.map(s => (
            <div
              key={s.token}
              className="flex items-center gap-3 rounded-3 border border-stroke-2 bg-surface-1 px-4 py-3"
            >
              <span
                className="dot"
                data-status={s.role.toLowerCase()}
                aria-hidden
              />
              <div>
                <div className="font-mono text-xs text-fg-0">{s.token}</div>
                <div className="font-mono text-2xs text-fg-3">{s.hex}</div>
              </div>
              <span className="status-chip" data-status={s.role.toLowerCase()}>
                {s.role}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Layer chips */}
      <section className="mb-12">
        <h2 className="mb-1 text-md font-semibold text-fg-0">Layer chips</h2>
        <p className="mb-4 text-sm text-fg-2">ATC layer identification.</p>
        <div className="flex flex-wrap gap-3">
          {layers.map(l => (
            <div
              key={l.token}
              className="flex items-center gap-3 rounded-3 border border-stroke-2 bg-surface-1 px-4 py-3"
            >
              <span className="layer-chip" data-layer={l.role.toLowerCase()}>
                {l.role}
              </span>
              <div className="font-mono text-xs text-fg-3">
                {l.token}
                {' '}
                ·
                {l.hex}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Type ramp */}
      <section className="mb-12">
        <h2 className="mb-1 text-md font-semibold text-fg-0">Typography ramp</h2>
        <p className="mb-4 text-sm text-fg-2">
          Inter sans-serif. Body 13px. JetBrains Mono for IDs.
        </p>
        <div className="overflow-hidden rounded-3 border border-stroke-2 bg-surface-1">
          {typeRamp.map((row, i) => (
            <div
              key={row.size}
              className={`flex items-baseline gap-6 px-5 py-4 ${
                i < typeRamp.length - 1 ? 'border-b border-stroke-2' : ''
              }`}
            >
              <span className="w-16 shrink-0 font-mono text-xs text-fg-3">
                {row.size}
              </span>
              <span className={`text-fg-0 ${row.cls}`}>{row.sample}</span>
            </div>
          ))}
        </div>
      </section>

      {/* Radii */}
      <section className="mb-12">
        <h2 className="mb-1 text-md font-semibold text-fg-0">Radii</h2>
        <p className="mb-4 text-sm text-fg-2">Sharp by default. Max 10px.</p>
        <div className="flex flex-wrap gap-4">
          {radii.map(r => (
            <div key={r.token} className="flex items-center gap-3">
              <div
                className="size-14 border border-stroke-3 bg-surface-3"
                style={{ borderRadius: `var(${r.token})` }}
              />
              <div>
                <div className="font-mono text-xs text-fg-0">{r.token}</div>
                <div className="font-mono text-2xs text-fg-3">{r.value}</div>
                <div className="text-xs text-fg-2">{r.role}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Mono samples */}
      <section className="mb-12">
        <h2 className="mb-1 text-md font-semibold text-fg-0">Monospace samples</h2>
        <p className="mb-4 text-sm text-fg-2">IDs live in mono. Always.</p>
        <div className="flex flex-wrap gap-3">
          {['ATC-001', 'RUN-451', 'MOD-014', 'BUG-027', 'TEST-082'].map(id => (
            <span
              key={id}
              className="rounded-2 border border-stroke-2 bg-surface-2 px-2 py-1 font-mono text-sm text-fg-0"
            >
              {id}
            </span>
          ))}
        </div>
      </section>

      <footer className="mt-16 border-t border-stroke-2 pt-6 text-xs text-fg-3">
        Bunkai is the real Japanese martial-arts term (分解 · BOON-kai) — not the
        anime word. Wordmark uses Noto Serif JP weight 700; Latin uses Inter.
      </footer>
    </main>
  );
}
