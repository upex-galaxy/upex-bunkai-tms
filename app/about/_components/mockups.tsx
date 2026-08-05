import { MockFrame, MockRail } from './MockFrame';

// Eight mini-mockups, one per walkthrough step. They are illustrations, not
// live app code: no data fetching, no interactivity, fixed sample content. What
// they DO share with the real screens is the token vocabulary — status-chip,
// layer-chip, dot, mono IDs, surface/stroke tiers — so the shapes read as the
// product rather than as generic marketing art.

function Field({ label, value, mono }: { label: string, value: string, mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-mono text-2xs uppercase tracking-wider text-fg-4">{label}</span>
      <span
        className={`rounded-2 border border-stroke-2 bg-surface-2 px-2 py-1.5 text-xs text-fg-1 ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </span>
    </div>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="flex items-center gap-2 border-b border-stroke-1 py-1.5 last:border-b-0">{children}</div>;
}

// ── 1 · Módulos ────────────────────────────────────────────────────────────
export function ModulesMock() {
  return (
    <MockFrame rail={<MockRail active="Checkout" />} tabs={['Explorador', 'Vista tabla']} activeTab="Explorador">
      <div className="flex items-center gap-2 pb-3">
        <span className="rounded-2 border border-stroke-2 bg-surface-2 px-2 py-1 text-xs text-fg-0">Árbol</span>
        <span className="rounded-2 px-2 py-1 text-xs text-fg-3">Tabla</span>
        <span className="rounded-2 px-2 py-1 text-xs text-fg-3">Mapa mental</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-2 bg-accent px-2 py-1 text-xs font-medium text-white">
          + Nuevo módulo
        </span>
      </div>
      <div className="rounded-3 border border-stroke-2 bg-surface-2 p-3">
        <p className="pb-2 text-xs text-fg-3">
          Todo cuelga de un módulo. Hasta seis niveles de profundidad, y cada nivel agrega para cobertura y defectos.
        </p>
        <div className="grid grid-cols-3 gap-2">
          {[
            { n: 'Checkout', s: '3 submódulos · 12 ATC' },
            { n: 'Facturación', s: '1 submódulo · 4 ATC' },
            { n: 'Cuenta', s: '2 submódulos · 9 ATC' },
          ].map(m => (
            <div key={m.n} className="rounded-2 border border-stroke-2 bg-surface-3 p-2">
              <p className="text-xs font-semibold text-fg-0">{m.n}</p>
              <p className="pt-0.5 font-mono text-2xs text-fg-3">{m.s}</p>
            </div>
          ))}
        </div>
      </div>
    </MockFrame>
  );
}

// ── 2 · Historia + criterios ───────────────────────────────────────────────
export function StoryMock() {
  return (
    <MockFrame rail={<MockRail active="BK-166 · Login" />} tabs={['BK-166', 'ATC-014']} activeTab="BK-166">
      <div className="flex items-center gap-2 pb-3">
        <span className="font-mono text-xs text-accent">BK-166</span>
        <span className="text-sm font-semibold text-fg-0">Iniciar sesión con email y contraseña</span>
        <span className="ml-auto inline-flex items-center gap-1.5 rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-3">
          importado de Jira
        </span>
      </div>
      <p className="pb-2 font-mono text-2xs uppercase tracking-wider text-fg-4">Criterios de aceptación</p>
      <div className="rounded-3 border border-stroke-2 bg-surface-2 px-3">
        {[
          { id: 'AC-1', t: 'Con credenciales válidas, el usuario entra a su workspace', c: '1 ATC' },
          { id: 'AC-2', t: 'Con contraseña incorrecta, se muestra un error y no hay sesión', c: '1 ATC' },
          { id: 'AC-3', t: 'Tras cinco intentos fallidos, la cuenta queda bloqueada 15 minutos', c: 'sin cubrir' },
        ].map(ac => (
          <Row key={ac.id}>
            <span className="w-12 shrink-0 font-mono text-2xs text-fg-3">{ac.id}</span>
            <span className="min-w-0 flex-1 text-xs text-fg-1">{ac.t}</span>
            <span
              className="status-chip shrink-0"
              data-status={ac.c === 'sin cubrir' ? 'fail' : 'pass'}
            >
              {ac.c}
            </span>
          </Row>
        ))}
      </div>
      <p className="pt-2 text-2xs text-fg-4">
        El hueco de AC-3 no es un olvido silencioso: aparece acá y en el reporte de cobertura.
      </p>
    </MockFrame>
  );
}

// ── 3 · Builder de ATC ─────────────────────────────────────────────────────
export function AtcBuilderMock() {
  return (
    <MockFrame rail={<MockRail active="ATC-014" />} tabs={['BK-166', 'ATC-014']} activeTab="ATC-014">
      <div className="grid gap-3 lg:grid-cols-[1.35fr_1fr]">
        <div className="flex flex-col gap-2.5">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-accent">ATC-014</span>
            <span className="layer-chip" data-layer="ui">UI</span>
            <span className="text-sm font-semibold text-fg-0">Login con credenciales válidas</span>
          </div>
          <div>
            <p className="pb-1 font-mono text-2xs uppercase tracking-wider text-fg-4">Pasos</p>
            <ol className="m-0 flex list-none flex-col overflow-hidden rounded-2 border border-stroke-2 bg-surface-2 p-0">
              {['Abrir /login', 'Completar email y contraseña', 'Enviar el formulario'].map((s, i) => (
                <li key={s} className="flex gap-2 border-b border-stroke-1 px-2 py-1.5 last:border-b-0">
                  <span className="font-mono text-2xs text-fg-4">{i + 1}</span>
                  <span className="text-xs text-fg-1">{s}</span>
                </li>
              ))}
            </ol>
          </div>
          <div>
            <p className="pb-1 font-mono text-2xs uppercase tracking-wider text-fg-4">Aserciones</p>
            <ol className="m-0 flex list-none flex-col overflow-hidden rounded-2 border border-stroke-2 bg-surface-2 p-0">
              {['Redirige al home del workspace', 'Queda seteada la cookie de sesión'].map(a => (
                <li key={a} className="flex items-center gap-2 border-b border-stroke-1 px-2 py-1.5 last:border-b-0">
                  <span className="dot" data-status="pass" />
                  <span className="text-xs text-fg-1">{a}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>

        <div className="flex flex-col gap-2.5 rounded-3 border border-accent/30 bg-accent-soft p-2.5">
          <p className="font-mono text-2xs uppercase tracking-wider text-accent">Anclaje obligatorio</p>
          <Field label="User Story" value="BK-166 · Iniciar sesión" mono />
          <div className="flex flex-col gap-1">
            <span className="font-mono text-2xs uppercase tracking-wider text-fg-4">Criterios</span>
            <span className="inline-flex flex-wrap gap-1">
              <span className="status-chip" data-status="pass">AC-1</span>
              <span className="status-chip" data-status="pass">AC-2</span>
            </span>
          </div>
          <p className="text-2xs leading-relaxed text-fg-2">
            Sin al menos un criterio marcado, el botón de guardar no se habilita. La regla vive en el esquema, no en el
            formulario.
          </p>
        </div>
      </div>
    </MockFrame>
  );
}

// ── 4 · Builder de Test ────────────────────────────────────────────────────
export function TestBuilderMock() {
  const chain = [
    { id: 'ATC-014', t: 'Login con credenciales válidas', l: 'ui' },
    { id: 'ATC-031', t: 'Buscar un producto por nombre', l: 'ui' },
    { id: 'ATC-044', t: 'Agregar producto al carrito', l: 'api' },
    { id: 'ATC-052', t: 'Pagar con tarjeta válida', l: 'ui' },
  ];
  return (
    <MockFrame rail={<MockRail active="TEST-07" />} tabs={['TEST-07', 'Biblioteca ATC']} activeTab="TEST-07">
      <div className="flex items-center gap-2 pb-2.5">
        <span className="font-mono text-xs text-accent">TEST-07</span>
        <span className="text-sm font-semibold text-fg-0">Checkout — camino feliz</span>
        <span className="ml-auto inline-flex gap-1">
          <span className="status-chip" data-status="skipped">e2e</span>
          <span className="status-chip" data-status="skipped">regresión</span>
        </span>
      </div>
      <div className="flex flex-col gap-1.5">
        {chain.map((c, i) => (
          <div key={c.id} className="flex items-center gap-2.5 rounded-3 border border-stroke-2 bg-surface-2 p-2">
            <span className="inline-flex size-5 shrink-0 items-center justify-center rounded-1 border border-stroke-2 bg-surface-3 font-mono text-2xs text-fg-3">
              {i + 1}
            </span>
            <span className="shrink-0 font-mono text-xs text-fg-3">{c.id}</span>
            <span className="layer-chip shrink-0" data-layer={c.l}>{c.l.toUpperCase()}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-fg-1">{c.t}</span>
            <span className="shrink-0 font-mono text-2xs text-fg-4">⇅</span>
          </div>
        ))}
      </div>
      <p className="pt-2 text-2xs text-fg-4">
        La cadena guarda referencias.
        {' '}
        <span className="font-mono text-fg-3">ATC-014</span>
        {' '}
        ya se usa en 6 tests: editarlo
        una vez los corrige a todos.
      </p>
    </MockFrame>
  );
}

// ── 5 · Runner ─────────────────────────────────────────────────────────────
export function RunnerMock() {
  return (
    <MockFrame tabs={['TEST-07', 'RUN-451']} activeTab="RUN-451">
      <div className="flex items-center gap-2 pb-2">
        <span className="font-mono text-xs text-accent">RUN-451</span>
        <span className="text-sm font-semibold text-fg-0">Checkout — camino feliz</span>
        <span className="status-chip ml-auto" data-status="running">
          <span className="dot" data-status="running" />
          en curso
        </span>
        <span className="inline-flex items-center rounded-1 border border-stroke-2 bg-surface-2 px-1.5 py-0.5 font-mono text-2xs text-fg-3">
          Staging
        </span>
      </div>
      <div className="flex items-center gap-3 pb-3">
        <div className="h-2 flex-1 overflow-hidden rounded-2 border border-stroke-2 bg-surface-2">
          <div className="h-full w-3/4 rounded-2 bg-accent" />
        </div>
        <span className="font-mono text-2xs text-fg-2">3 / 4</span>
      </div>
      <div className="overflow-hidden rounded-3 border border-stroke-2 bg-surface-2">
        {[
          { id: 'ATC-014', t: 'Login con credenciales válidas', s: 'pass', l: 'Pass' },
          { id: 'ATC-031', t: 'Buscar un producto por nombre', s: 'pass', l: 'Pass' },
          { id: 'ATC-044', t: 'Agregar producto al carrito', s: 'fail', l: 'Fail' },
          { id: 'ATC-052', t: 'Pagar con tarjeta válida', s: 'skipped', l: 'Sin correr' },
        ].map(r => (
          <div key={r.id} className="flex items-center gap-2 border-b border-stroke-1 px-2.5 py-2 last:border-b-0">
            <span className="dot shrink-0" data-status={r.s} />
            <span className="shrink-0 font-mono text-2xs text-fg-3">{r.id}</span>
            <span className="min-w-0 flex-1 truncate text-xs text-fg-1">{r.t}</span>
            <span className="status-chip shrink-0" data-status={r.s}>{r.l}</span>
          </div>
        ))}
      </div>
      <div className="flex items-center gap-1.5 pt-2.5">
        <span className="rounded-2 bg-signal-pass-bg px-2 py-1 text-xs text-signal-pass">Pass</span>
        <span className="rounded-2 bg-signal-fail-bg px-2 py-1 text-xs text-signal-fail">Fail</span>
        <span className="rounded-2 bg-signal-blocked-bg px-2 py-1 text-xs text-signal-blocked">Blocked</span>
        <span className="ml-auto inline-flex items-center gap-1 text-2xs text-fg-4">
          atajos
          {' '}
          <span className="kbd">1</span>
          <span className="kbd">2</span>
          <span className="kbd">3</span>
        </span>
      </div>
    </MockFrame>
  );
}

// ── 6 · Bug en contexto ────────────────────────────────────────────────────
export function BugMock() {
  return (
    <MockFrame tabs={['RUN-451', 'Nuevo defecto']} activeTab="Nuevo defecto">
      <div className="grid gap-3 lg:grid-cols-[1fr_0.85fr]">
        <div className="flex flex-col gap-2.5">
          <p className="font-mono text-2xs uppercase tracking-wider text-fg-4">Cargar defecto</p>
          <Field label="Título" value="El carrito pierde el ítem al refrescar" />
          <div className="grid grid-cols-2 gap-2">
            <Field label="Severidad" value="Alta" />
            <Field label="Estado" value="Abierto" />
          </div>
          <Field label="Módulo" value="Checkout › Carrito" />
        </div>
        <div className="flex flex-col gap-2 rounded-3 border border-stroke-2 bg-surface-2 p-2.5">
          <p className="font-mono text-2xs uppercase tracking-wider text-fg-4">Contexto autocompletado</p>
          {[
            ['Run', 'RUN-451'],
            ['Paso', 'ATC-044 · posición 3'],
            ['Ambiente', 'Staging'],
            ['Historia', 'BK-166'],
            ['Ejecutor', 'Elena V. · manual'],
          ].map(([k, v]) => (
            <div key={k} className="flex items-baseline justify-between gap-2 border-b border-stroke-1 pb-1.5 last:border-b-0 last:pb-0">
              <span className="text-2xs text-fg-3">{k}</span>
              <span className="font-mono text-2xs text-fg-1">{v}</span>
            </div>
          ))}
          <p className="pt-1 text-2xs leading-relaxed text-fg-2">
            Nada de esto se tipea. Sale del paso que falló.
          </p>
        </div>
      </div>
    </MockFrame>
  );
}

// ── 7 · Heatmap de defectos ────────────────────────────────────────────────
export function HeatmapMock() {
  const rows = [
    { m: 'Checkout', n: 14, d: '▲ 6', w: 100, c: 'fail' },
    { m: 'Cuenta', n: 6, d: '▲ 1', w: 43, c: 'blocked' },
    { m: 'Búsqueda', n: 3, d: '▬', w: 21, c: 'skipped' },
    { m: 'Facturación', n: 1, d: '▼ 2', w: 7, c: 'pass' },
  ];
  const barColor: Record<string, string> = {
    fail: 'bg-signal-fail',
    blocked: 'bg-signal-blocked',
    skipped: 'bg-fg-3',
    pass: 'bg-signal-pass',
  };
  return (
    <MockFrame tabs={['Defectos', 'Heatmap']} activeTab="Heatmap">
      <div className="flex items-center gap-2 pb-3">
        <span className="text-sm font-semibold text-fg-0">Defectos por módulo</span>
        <span className="ml-auto font-mono text-2xs text-fg-4">últimos 7 días</span>
      </div>
      <div className="flex flex-col gap-2.5">
        {rows.map(r => (
          <div key={r.m}>
            <div className="flex items-baseline justify-between pb-1">
              <span className="text-xs text-fg-1">{r.m}</span>
              <span className="font-mono text-2xs text-fg-2">
                {r.n}
                {' '}
                {r.d}
              </span>
            </div>
            <div className="h-1.5 overflow-hidden rounded-2 bg-surface-3">
              <div className={`h-full rounded-2 ${barColor[r.c]}`} style={{ width: `${r.w}%` }} />
            </div>
          </div>
        ))}
      </div>
      <p className="pt-3 text-2xs text-fg-4">
        Ningún defecto se carga sin módulo, así que el mapa no depende de que alguien se acuerde de etiquetar.
      </p>
    </MockFrame>
  );
}

// ── 8 · Cobertura y trazabilidad ───────────────────────────────────────────
export function CoverageMock() {
  return (
    <MockFrame tabs={['Cobertura', 'Trazabilidad']} activeTab="Trazabilidad">
      <div className="flex items-center gap-2 pb-3">
        <span className="font-mono text-xs text-accent">BK-166</span>
        <span className="text-sm font-semibold text-fg-0">Cadena completa</span>
        <span className="status-chip ml-auto" data-status="blocked">1 defecto abierto</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[
          ['Historia', 'BK-166'],
          ['Criterio', 'AC-1'],
          ['ATC', 'ATC-044'],
          ['Test', 'TEST-07'],
          ['Run', 'RUN-451'],
          ['Defecto', 'BUG-88'],
        ].map(([k, v], i, arr) => (
          <span key={v} className="inline-flex items-center gap-1.5">
            <span className="rounded-2 border border-stroke-2 bg-surface-2 px-2 py-1">
              <span className="block text-[9px] uppercase tracking-wider text-fg-4">{k}</span>
              <span className="block font-mono text-2xs text-fg-1">{v}</span>
            </span>
            {i < arr.length - 1 && <span className="font-mono text-2xs text-fg-4">→</span>}
          </span>
        ))}
      </div>
      <div className="grid grid-cols-3 gap-2 pt-3">
        {[
          { k: 'Criterios cubiertos', v: '18 / 21' },
          { k: 'Sin ejecutar nunca', v: '4 tests' },
          { k: 'Tiempo hasta verde', v: '3.2 días' },
        ].map(s => (
          <div key={s.k} className="rounded-2 border border-stroke-2 bg-surface-2 p-2">
            <p className="font-mono text-md font-bold text-fg-0">{s.v}</p>
            <p className="pt-0.5 text-2xs text-fg-3">{s.k}</p>
          </div>
        ))}
      </div>
    </MockFrame>
  );
}
