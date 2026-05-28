'use client';

import type { QaConfig } from '../qa-config';
import { Badge } from '@components/ui/badge';
import { buttonVariants } from '@components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@components/ui/card';
import {
  AlertTriangle,
  Database,
  ExternalLink,
  FileJson,
  KeyRound,
  MousePointerClick,
  Network,
  Plug,
  ShieldCheck,
} from 'lucide-react';
import { ArchDiagram } from './ArchDiagram';
import { AuthMethods } from './AuthMethods';
import { AgentCodeBlock, CodeBlock } from './CodeBlock';
import { EnvSetup } from './EnvSetup';
import { Toc } from './Toc';
import { TwoWayTabs } from './TwoWayTabs';

// ---------------------------------------------------------------------------
// Section accent system. Literal class maps per hue so Tailwind's JIT keeps them.
// ---------------------------------------------------------------------------
const ACCENT = {
  amber: { border: 'border-amber-500', icon: 'text-amber-600 dark:text-amber-400' },
  slate: { border: 'border-slate-500', icon: 'text-slate-600 dark:text-slate-400' },
  cyan: { border: 'border-cyan-500', icon: 'text-cyan-600 dark:text-cyan-400' },
  emerald: { border: 'border-emerald-500', icon: 'text-emerald-600 dark:text-emerald-400' },
  violet: { border: 'border-violet-500', icon: 'text-violet-600 dark:text-violet-400' },
  pink: { border: 'border-pink-500', icon: 'text-pink-600 dark:text-pink-400' },
  blue: { border: 'border-blue-500', icon: 'text-blue-600 dark:text-blue-400' },
} as const;

type Accent = keyof typeof ACCENT;

function Section({ id, testid, icon, title, desc, accent, children }: {
  id: string
  testid: string
  icon?: React.ReactNode
  title: string
  desc?: string
  accent: Accent
  children: React.ReactNode
}) {
  return (
    <Card id={id} data-testid={testid} className={`scroll-mt-20 border-l-4 ${ACCENT[accent].border}`}>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {icon && <span className={ACCENT[accent].icon}>{icon}</span>}
          {title}
        </CardTitle>
        {desc && <CardDescription>{desc}</CardDescription>}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

// Callout box with a hue accent — literal class maps so JIT keeps them.
const CALLOUT = {
  amber: 'border-amber-500 bg-amber-50 dark:bg-amber-950/30',
  emerald: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/30',
  violet: 'border-violet-500 bg-violet-50 dark:bg-violet-950/30',
  pink: 'border-pink-500 bg-pink-50 dark:bg-pink-950/30',
} as const;

function Callout({ hue, title, children }: {
  hue: keyof typeof CALLOUT
  title?: string
  children: React.ReactNode
}) {
  return (
    <div className={`rounded-2 border-l-4 p-3 text-sm ${CALLOUT[hue]}`}>
      {title && <p className="mb-1 font-semibold text-fg-0">{title}</p>}
      <div className="text-fg-2">{children}</div>
    </div>
  );
}

function TrinityCards() {
  const cards = [
    { hue: 'emerald' as const, icon: <Database className="h-5 w-5" />, title: 'DB · DBHub', anchor: '#db', text: 'Verificá datos directo en la base: DBHub MCP (read-only) o una URI en tu cliente SQL.' },
    { hue: 'violet' as const, icon: <Plug className="h-5 w-5" />, title: 'API · OpenAPI / Postman', anchor: '#api', text: 'Invocá endpoints desde el agente con OpenAPI MCP, o armá suites formales con Postman.' },
    { hue: 'pink' as const, icon: <MousePointerClick className="h-5 w-5" />, title: 'UI · Playwright', anchor: '#ui', text: 'Manejá el browser: regresión scripteada + exploración agéntica con el /playwright-cli.' },
  ];
  const ring = {
    emerald: 'hover:border-emerald-500',
    violet: 'hover:border-violet-500',
    pink: 'hover:border-pink-500',
  } as const;
  const tint = {
    emerald: 'text-emerald-600 dark:text-emerald-400',
    violet: 'text-violet-600 dark:text-violet-400',
    pink: 'text-pink-600 dark:text-pink-400',
  } as const;
  return (
    <div className="grid gap-3 md:grid-cols-3">
      {cards.map(c => (
        <a
          key={c.title}
          href={c.anchor}
          className={`block rounded-2 border border-stroke-2 bg-surface-1 p-4 transition-colors duration-token ease-token ${ring[c.hue]}`}
        >
          <p className="flex items-center gap-2 text-sm font-semibold text-fg-0">
            <span className={tint[c.hue]}>{c.icon}</span>
            {c.title}
          </p>
          <p className="mt-2 text-sm text-fg-2">{c.text}</p>
        </a>
      ))}
    </div>
  );
}

const es = {
  subtitle:
    'Todo lo que podés ejercitar contra Bunkai ahora mismo — UI, API REST y base Supabase. Para QA manual y testers asistidos por IA, en las tres capas: DB, API y UI.',
  credsTitle: '¿Necesitás las credenciales para hacer testing?',
  credsDesc: 'Los valores reales (demo users, strings de conexión, secretos) viven en el destino de credenciales — nunca en esta página pública.',
  credsCta: 'Abrir credenciales',
  credsGap: 'No hay fuente de credenciales detectada — preguntá a tu lead.',
  credsAsk: 'Si no tenés acceso, pedilo a tu instructor / lead / canal de Slack.',
  archTitle: 'Arquitectura + Repos',
  archDesc: 'Frontend → API → Database, con la capa de MCP debajo. Multi-tenant: cada fila scopeada por workspace está gateada por RLS de Postgres.',
  trinityTitle: 'La Trifuerza del Testing + Setup de Env',
  trinityDesc: 'UI (Playwright) + API (OpenAPI / Postman) + DB (DBHub) = Testing Completo.',
  dbTitle: 'Backend testing: Database (dos caminos)',
  dbDesc: 'Inspeccioná o mutá estado directo en la base con dos roles read-only/rw que tienen BYPASSRLS.',
  apiTitle: 'Backend testing: API (dos caminos) + auth + docs',
  apiDesc: 'Tres métodos de auth detectados, dos caminos de testing (OpenAPI MCP / Postman) y las docs interactivas.',
  uiTitle: 'Frontend testing: Playwright (scripted + agéntico)',
  uiDesc: 'magic-link es passwordless: la regresión maneja la UI; el puente UI→API es el camino híbrido (cookie → PAT).',
  refTitle: 'Referencia rápida',
  docsCta: 'Abrir docs',
};

export function QaShell({ config }: { config: QaConfig }) {
  const t = es; // config.lang === 'es' — Spanish is the locked language.

  return (
    <div data-testid="qa-page" className="mx-auto max-w-7xl px-4 py-10">
      {/* Hero */}
      <header className="mb-10 text-center">
        <div className="mb-2 font-mono text-xs font-semibold uppercase tracking-widest text-accent">
          QA reference
        </div>
        <h1 data-testid="qa-title" className="text-2xl font-bold tracking-tight text-fg-0 md:text-3xl">
          Software Testability Guide for QA
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-md leading-relaxed text-fg-2">
          {t.subtitle}
        </p>
      </header>

      <div className="lg:grid lg:grid-cols-[15rem_1fr] lg:gap-10">
        {/* Sticky TOC rail (desktop) */}
        <aside className="hidden lg:block">
          <Toc className="sticky top-20" />
        </aside>

        <main className="min-w-0 space-y-8">
          {/* §1 — Credentials CTA */}
          <Card
            id="credenciales"
            data-testid="qa-credentials-card"
            className="scroll-mt-20 border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30"
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                {t.credsTitle}
              </CardTitle>
              <CardDescription>{t.credsDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {config.credentialsSource
                ? (
                    <a
                      href={config.credentialsSource.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      data-testid="qa-credentials-button"
                      className={buttonVariants({ variant: 'primary', size: 'lg' })}
                    >
                      <KeyRound className="h-5 w-5" />
                      {t.credsCta}
                      {' '}
                      (
                      {config.credentialsSource.label}
                      )
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )
                : <p className="text-sm text-fg-3">{t.credsGap}</p>}
              <p className="mt-3 text-xs text-fg-4">{t.credsAsk}</p>
            </CardContent>
          </Card>

          {/* §2 — Architecture + Repos */}
          <Section
            id="arquitectura"
            testid="qa-architecture-card"
            icon={<Network className="h-5 w-5" />}
            title={t.archTitle}
            desc={t.archDesc}
            accent="slate"
          >
            <ArchDiagram config={config} />
          </Section>

          {/* §3 — Trinity + Env setup */}
          <Section
            id="trifuerza"
            testid="qa-section-trinity"
            title={t.trinityTitle}
            desc={t.trinityDesc}
            accent="cyan"
          >
            <TrinityCards />
            <EnvSetup config={config} />
          </Section>

          {/* §4 — DB testing */}
          <Section
            id="db"
            testid="qa-section-database"
            icon={<Database className="h-5 w-5" />}
            title={t.dbTitle}
            desc={t.dbDesc}
            accent="emerald"
          >
            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">Roles de QA (BYPASSRLS)</p>
              <ul className="grid gap-1 text-sm text-fg-2">
                {config.db.roles.map(r => (
                  <li key={r.name}>
                    <code className="rounded bg-surface-2 px-1 text-fg-1">{r.name}</code>
                    {' '}
                    —
                    {' '}
                    {r.access}
                  </li>
                ))}
              </ul>
            </div>

            <Callout hue="emerald" title="Material secreto sigue opaco">
              <p>
                Ambos roles tienen REVOKE a nivel columna sobre
                {' '}
                {config.db.revokedColumns.map((c, i) => (
                  <span key={c}>
                    <code className="rounded bg-surface-2 px-1 text-fg-1">{c}</code>
                    {i < config.db.revokedColumns.length - 1 ? ', ' : ''}
                  </span>
                ))}
                {' '}
                — los hashes no se ven ni con BYPASSRLS.
              </p>
            </Callout>

            <TwoWayTabs config={config} domain="db" />

            <Callout hue="emerald" title="Session Pooler — qué puerto usar">
              <p>{config.db.poolerNote}</p>
            </Callout>

            <Callout hue="emerald" title="Sonda de aislamiento (RLS)">
              <p>{config.db.rlsProbe}</p>
            </Callout>
          </Section>

          {/* §5 — API testing + auth + docs */}
          <Section
            id="api"
            testid="qa-section-api"
            icon={<Plug className="h-5 w-5" />}
            title={t.apiTitle}
            desc={t.apiDesc}
            accent="violet"
          >
            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">Métodos de auth detectados</p>
              <AuthMethods config={config} />
            </div>

            <Callout hue="amber" title="magic-link es passwordless">
              <p>
                Los usuarios creados por la UI de
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">/login</code>
                {' '}
                no tienen password en
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">auth.users.encrypted_password</code>
                , así que no pueden usar
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">/auth/signin</code>
                . Provisioná un QA bot dedicado vía
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">/auth/signup</code>
                {' '}
                (que sí setea password) antes de correr flujos headless. La forma del token es:
                {' '}
                <code className="break-all rounded bg-surface-2 px-1 text-fg-1">
                  {config.api.tokenShape ?? '— preguntá a tu lead —'}
                </code>
                .
              </p>
            </Callout>

            {config.api.cookieMintSnippet && (
              <div className="space-y-2">
                <p className="flex items-center gap-2 text-sm font-semibold text-fg-1">
                  <ShieldCheck className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                  Camino híbrido — extraer un PAT de una sesión de browser
                </p>
                <CodeBlock language="bash" code={config.api.cookieMintSnippet} />
              </div>
            )}

            <Callout hue="violet" title="Higiene de tokens">
              <p>
                El token crudo se devuelve UNA vez. La DB guarda solo
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">sha256(secret)</code>
                {' '}
                + los primeros 12 chars como
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">token_prefix</code>
                {' '}
                (lookup O(1) por índice). Si lo perdés, revocá con
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">
                  DELETE /tokens/
                  {'{id}'}
                </code>
                {' '}
                y minteá uno nuevo — no hay recuperación.
              </p>
            </Callout>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">Scopes del PAT (inmutables por token)</p>
              <ul className="grid gap-1 text-sm text-fg-2">
                {config.api.patScopes.map(s => (
                  <li key={s.scope}>
                    <code className="rounded bg-surface-2 px-1 text-fg-1">{s.scope}</code>
                    {' '}
                    —
                    {' '}
                    {s.purpose}
                  </li>
                ))}
              </ul>
            </div>

            <TwoWayTabs config={config} domain="api" />

            {config.docs.route && (
              <a
                href={config.docs.route}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="qa-docs-button"
                className={buttonVariants({ variant: 'default' })}
              >
                <FileJson className="h-4 w-4" />
                {t.docsCta}
                {' '}
                (
                {config.docs.ui ?? 'API docs'}
                )
                <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </Section>

          {/* §6 — UI testing (Playwright) */}
          <Section
            id="ui"
            testid="qa-section-ui"
            icon={<MousePointerClick className="h-5 w-5" />}
            title={t.uiTitle}
            desc={t.uiDesc}
            accent="pink"
          >
            <Callout hue="pink" title="El puente UI → API (headline)">
              <p>
                magic-link no devuelve token al navegador de forma síncrona. El puente real
                entre testing de UI y de API es
                {' '}
                <strong className="text-fg-0">híbrido</strong>
                : reusás la cookie de sesión del browser para mintear un PAT vía
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">POST /tokens</code>
                , y después corrés los tests de API con Bearer.
              </p>
            </Callout>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">(a) Fixture híbrido — cookie → PAT → Bearer</p>
              <CodeBlock language="typescript" code={config.playwright.hybridBridge} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">Regresión scripteada — UI de magic-link (passwordless)</p>
              <CodeBlock language="typescript" code={config.playwright.scriptedFixture} />
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">
                <code className="rounded bg-surface-2 px-1 text-fg-1">data-testid</code>
                {' '}
                del login
              </p>
              <div className="overflow-x-auto rounded-2 border border-stroke-2">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-2 text-fg-2">
                    <tr>
                      <th className="px-3 py-2 font-medium">data-testid</th>
                      <th className="px-3 py-2 font-medium">Propósito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.playwright.loginTestIds.map(s => (
                      <tr key={s.id} className="border-t border-stroke-2">
                        <td className="px-3 py-2">
                          <code className="rounded bg-surface-2 px-1 text-fg-1">{s.id}</code>
                        </td>
                        <td className="px-3 py-2 text-fg-2">{s.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">(b) Agéntico — Playwright MCP + /playwright-cli</p>
              <p className="text-sm text-fg-2">
                Instalá los browsers:
                {' '}
                <code className="rounded bg-surface-2 px-1 text-fg-1">bunx playwright install</code>
                . Bloque de config del MCP por agente:
              </p>
              <AgentCodeBlock agents={config.mcp.agents} blocks={config.mcp.playwright} />
              <p className="mt-2 text-sm text-fg-2">Prompts de ejemplo que un agente puede correr:</p>
              <ul className="grid gap-1 text-sm text-fg-2">
                {config.playwright.agenticPrompts.map(p => (
                  <li key={p} className="rounded-2 bg-surface-2 px-3 py-1.5 font-mono text-xs text-fg-1">
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <Callout hue="pink" title="Regla de decisión">
              <p>
                <strong className="text-fg-0">Scripted</strong>
                {' '}
                Playwright para regresión / CI;
                {' '}
                <strong className="text-fg-0">agéntico</strong>
                {' '}
                (CLI / MCP) para exploración, caza de bugs y onboarding.
              </p>
            </Callout>
          </Section>

          {/* §7 — Quick reference */}
          <Section
            id="referencia"
            testid="qa-section-reference"
            title={t.refTitle}
            accent="blue"
          >
            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">Demo users</p>
              <ul className="grid gap-1 text-sm text-fg-2">
                {config.demoUsers.map(u => (
                  <li key={u.email}>
                    <code className="rounded bg-surface-2 px-1 text-fg-1">{u.email}</code>
                    {' '}
                    —
                    {' '}
                    {u.note}
                  </li>
                ))}
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-sm font-semibold text-fg-1">Endpoints</p>
              <div className="overflow-x-auto rounded-2 border border-stroke-2">
                <table className="w-full text-left text-sm">
                  <thead className="bg-surface-2 text-fg-2">
                    <tr>
                      <th className="px-3 py-2 font-medium">Método</th>
                      <th className="px-3 py-2 font-medium">Path</th>
                      <th className="px-3 py-2 font-medium">Propósito</th>
                    </tr>
                  </thead>
                  <tbody>
                    {config.api.endpoints.map(e => (
                      <tr key={`${e.method} ${e.path}`} className="border-t border-stroke-2">
                        <td className="px-3 py-2">
                          <Badge variant="outline" className="font-mono">{e.method}</Badge>
                        </td>
                        <td className="px-3 py-2">
                          <code className="whitespace-nowrap font-mono text-fg-1">{e.path}</code>
                        </td>
                        <td className="px-3 py-2 text-fg-2">{e.purpose}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <Callout hue="amber" title="Troubleshooting">
              <ul className="ml-5 list-disc">
                <li>
                  <strong className="text-fg-0">401 / 403</strong>
                  {' '}
                  en un MCP → una var de
                  {' '}
                  <code className="rounded bg-surface-2 px-1 text-fg-1">.env</code>
                  {' '}
                  no cargó. Salí del agente, corregí, reentrá (las vars se leen al spawnear).
                </li>
                <li>
                  <strong className="text-fg-0">401</strong>
                  {' '}
                  en
                  {' '}
                  <code className="rounded bg-surface-2 px-1 text-fg-1">/auth/signin</code>
                  {' '}
                  → usuario solo-magic-link sin password. Usá
                  {' '}
                  <code className="rounded bg-surface-2 px-1 text-fg-1">/auth/signup</code>
                  {' '}
                  o el camino híbrido.
                </li>
                <li>
                  <strong className="text-fg-0">DBHub auth críptico</strong>
                  {' '}
                  → un slot
                  {' '}
                  <code className="rounded bg-surface-2 px-1 text-fg-1">DBHUB_*</code>
                  {' '}
                  falta (sustituye el literal). Verificá:
                  {' '}
                  <code className="rounded bg-surface-2 px-1 text-fg-1">env | grep DBHUB</code>
                  .
                </li>
              </ul>
            </Callout>
          </Section>
        </main>
      </div>

      <footer className="mt-12 flex items-center gap-2 border-t border-stroke-2 pt-4 text-xs text-fg-4">
        <AlertTriangle className="h-3.5 w-3.5" />
        Esta página es pública — nunca printeamos credenciales reales acá. Los valores
        sensibles viven en el destino de credenciales.
      </footer>
    </div>
  );
}
