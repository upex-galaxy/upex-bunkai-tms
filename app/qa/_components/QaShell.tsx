import type { ReactNode } from 'react';
import type { CredentialRow, QaConfig } from '../qa-config';
import { Badge } from '@components/ui/badge';
import { buttonVariants } from '@components/ui/button';
import { cn } from '@lib/utils';
import { BookOpen, Check, Download, ExternalLink, Info, KeyRound, OctagonAlert, TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { qaSections } from '../_lib/sections';
import { CodeBlock } from './CodeBlock';
import { CopyButton } from './CopyButton';
import { HarnessTabs } from './HarnessTabs';
import { Toc } from './Toc';

function Section({ id, index, title, lede, children }: { id: string, index: number, title: string, lede?: string, children: ReactNode }) {
  return (
    <section id={id} data-testid={`qa-section-${id}`} className="scroll-mt-20 border-t border-stroke-1 pt-8">
      <p className="font-mono text-2xs uppercase tracking-widest text-accent">
        {String(index).padStart(2, '0')}
        {' · '}
        {qaSections.find(s => s.id === id)?.label}
      </p>
      <h2 className="mt-1.5 text-xl font-bold tracking-tight text-fg-0">{title}</h2>
      {lede && <p className="mt-1.5 max-w-[68ch] text-md text-fg-2"><Rich text={lede} /></p>}
      <div className="mt-5 space-y-4">{children}</div>
    </section>
  );
}

const CALLOUT = {
  info: { box: 'border-accent/30 bg-accent-soft', icon: Info, iconClass: 'text-accent' },
  warn: { box: 'border-signal-blocked/30 bg-signal-blocked-bg', icon: TriangleAlert, iconClass: 'text-signal-blocked' },
  danger: { box: 'border-signal-fail/30 bg-signal-fail-bg', icon: OctagonAlert, iconClass: 'text-signal-fail' },
} as const;

function Callout({ tone, children, testid }: { tone: keyof typeof CALLOUT, children: ReactNode, testid?: string }) {
  const c = CALLOUT[tone];
  const Icon = c.icon;
  return (
    <div data-testid={testid} className={cn('flex gap-2.5 rounded-3 border p-3 text-base text-fg-1', c.box)}>
      <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', c.iconClass)} aria-hidden />
      <div className="min-w-0 space-y-1">{children}</div>
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return <code className="rounded-1 bg-surface-3 px-1 py-px font-mono text-sm text-fg-0">{children}</code>;
}

function Rich({ text }: { text: string }) {
  return <>{text.split('`').map((part, i) => (i % 2 === 1 ? <Code key={i}>{part}</Code> : part))}</>;
}

function Bk29Link({ config, size = 'lg', testid }: { config: QaConfig, size?: 'sm' | 'lg', testid: string }) {
  return (
    <a
      href={config.credentialsSource.url}
      target="_blank"
      rel="noopener noreferrer"
      data-testid={testid}
      className={buttonVariants({ variant: 'primary', size })}
    >
      <KeyRound className="h-3.5 w-3.5" aria-hidden />
      Valores en BK-29
      <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
    </a>
  );
}

const SOURCE_LABEL: Record<CredentialRow['source'], string> = {
  bk29: 'Valor en BK-29',
  own: 'Tu cuenta',
  public: 'Público',
  generated: 'Lo genera api:login',
};

function CredentialCard({ row, config }: { row: CredentialRow, config: QaConfig }) {
  return (
    <li data-testid={`qa-credential-${row.source}`} className="rounded-3 border border-stroke-2 bg-surface-2 p-3.5 shadow-card">
      <div className="flex flex-wrap items-center gap-1.5">
        {row.names.map(n => (
          <span key={n} className="rounded-1 border border-stroke-2 bg-surface-1 px-1.5 py-0.5 font-mono text-sm text-fg-0">{n}</span>
        ))}
        <span className="flex-1" />
        {row.source === 'bk29'
          ? (
              <a href={config.credentialsSource.url} target="_blank" rel="noopener noreferrer" data-testid="qa-credential-bk29-link" className="inline-flex items-center gap-1 font-mono text-2xs uppercase tracking-wider text-accent hover:text-accent-hi">
                {SOURCE_LABEL.bk29}
                <ExternalLink className="h-3 w-3" aria-hidden />
              </a>
            )
          : <Badge variant="outline" className="font-mono text-2xs uppercase tracking-wider">{SOURCE_LABEL[row.source]}</Badge>}
      </div>
      <p className="mt-2 text-base text-fg-2"><Rich text={row.purpose} /></p>
      {row.value && (
        <div className="mt-2 flex items-center gap-2 rounded-2 border border-stroke-1 bg-surface-1 py-0.5 pl-2.5 pr-1">
          <span className="min-w-0 flex-1 break-all font-mono text-sm text-fg-1">{row.value}</span>
          <CopyButton code={row.value} />
        </div>
      )}
    </li>
  );
}

function Fact({ label, value, href }: { label: string, value: string, href?: string }) {
  return (
    <div className="flex items-center gap-3 border-b border-stroke-1 py-2 last:border-b-0">
      <dt className="w-20 shrink-0 font-mono text-2xs uppercase tracking-wider text-fg-3">{label}</dt>
      <dd className="min-w-0 flex-1 break-all font-mono text-sm text-fg-1">
        {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="hover:text-fg-0 hover:underline">{value}</a> : value}
      </dd>
      <CopyButton code={value} />
    </div>
  );
}

function Table({ head, rows, testid }: { head: string[], rows: ReactNode[][], testid?: string }) {
  return (
    <div className="overflow-x-auto rounded-3 border border-stroke-2" data-testid={testid}>
      <table className="w-full min-w-[520px] text-left text-base">
        <thead className="bg-surface-2">
          <tr>
            {head.map(h => <th key={h} className="px-3 py-2 font-mono text-2xs font-medium uppercase tracking-wider text-fg-3">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-t border-stroke-1 align-top">
              {r.map((c, j) => <td key={j} className="px-3 py-2 text-fg-1">{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export async function QaShell({ config }: { config: QaConfig }) {
  const { urls, reference, db } = config;
  const harnessItems = config.harnesses.map(h => ({
    id: h.id,
    label: h.label,
    content: (
      <div className="space-y-3 rounded-3 border border-stroke-2 bg-surface-2 p-4">
        <dl className="grid gap-x-4 gap-y-2 text-base sm:grid-cols-[8rem_1fr]">
          <dt className="font-mono text-2xs uppercase tracking-wider text-fg-3 sm:pt-0.5">Archivo</dt>
          <dd><Code>{h.file}</Code></dd>
          <dt className="font-mono text-2xs uppercase tracking-wider text-fg-3 sm:pt-0.5">Abrir</dt>
          <dd><Code>{h.open}</Code></dd>
          <dt className="font-mono text-2xs uppercase tracking-wider text-fg-3 sm:pt-0.5">Estado MCP</dt>
          <dd className="text-fg-1"><Rich text={h.status} /></dd>
          <dt className="font-mono text-2xs uppercase tracking-wider text-fg-3 sm:pt-0.5">Tras cambiar .env</dt>
          <dd className="text-fg-1"><Rich text={h.reload} /></dd>
        </dl>
        <ul className="space-y-1.5 border-t border-stroke-1 pt-3">
          {h.notes.map(n => (
            <li key={n} className="flex gap-2 text-base text-fg-2">
              <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-fg-3" aria-hidden />
              <span className="min-w-0"><Rich text={n} /></span>
            </li>
          ))}
        </ul>
      </div>
    ),
  }));

  return (
    <div data-testid="qa-page" className="min-h-screen bg-surface-0">
      <header className="sticky top-0 z-20 border-b border-stroke-1 bg-surface-0/85 backdrop-blur">
        <div className="mx-auto flex h-12 max-w-[1180px] items-center gap-3 px-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2 text-fg-0">
            <span className="flex h-6 w-6 items-center justify-center rounded-2 bg-accent font-jp text-sm text-white">分</span>
            <span className="text-md font-semibold">Bunkai</span>
          </Link>
          <span className="font-mono text-2xs uppercase tracking-widest text-fg-3">Guía QA</span>
          <span className="flex-1" />
          <a href={urls.docs} target="_blank" rel="noopener noreferrer" data-testid="qa-docs-button" className={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'hidden sm:inline-flex')}>
            <BookOpen className="h-3.5 w-3.5" aria-hidden />
            API docs
          </a>
          <Bk29Link config={config} size="sm" testid="qa-header-bk29" />
        </div>
      </header>

      <div className="mx-auto max-w-[1180px] px-4 pb-16 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="hidden lg:block">
            <Toc className="sticky top-20 pt-10" />
          </aside>

          <main className="min-w-0 max-w-[820px] space-y-10">
            <div className="pt-10" data-testid="qa-hero">
              <p className="font-mono text-2xs uppercase tracking-widest text-accent">Testing en staging · UI, API y base de datos</p>
              <h1 data-testid="qa-title" className="mt-2 text-2xl font-bold tracking-tight text-fg-0">Cómo testear Bunkai con un agente de IA</h1>
              <p className="mt-2 max-w-[68ch] text-md text-fg-2">
                Del cero a tu primer chequeo en las tres capas, con Claude Code, Codex, OpenCode o Pi. Esta página es pública: los valores de las credenciales viven solo en la épica BK-29 de Jira.
              </p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Bk29Link config={config} testid="qa-credentials-button" />
                <a href={urls.login} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: 'default', size: 'lg' })}>
                  Abrir staging
                  <ExternalLink className="h-3 w-3 opacity-70" aria-hidden />
                </a>
              </div>
              <dl data-testid="qa-facts" className="mt-6 rounded-3 border border-stroke-2 bg-surface-2 px-3.5 py-1 shadow-card">
                <Fact label="Web" value={urls.web} href={urls.web} />
                <Fact label="API" value={urls.api} />
                <Fact label="OpenAPI" value={urls.spec} href={urls.spec} />
                <Fact label="Docs" value={urls.docs} href={urls.docs} />
              </dl>
              <nav aria-label="En esta guía" className="mt-6 flex flex-wrap gap-1.5 lg:hidden" data-testid="qa-mobile-toc">
                {qaSections.map((s, i) => (
                  <a key={s.id} href={`#${s.id}`} className="rounded-1 border border-stroke-2 bg-surface-2 px-2 py-1 font-mono text-2xs text-fg-2 hover:text-fg-0">
                    {String(i + 1).padStart(2, '0')}
                    {' '}
                    {s.label}
                  </a>
                ))}
              </nav>
            </div>

            <Section id="antes" index={1} title="Antes de empezar">
              <ul className="space-y-2" data-testid="qa-prerequisites">
                {config.prerequisites.map(p => (
                  <li key={p} className="flex gap-2.5 text-md text-fg-1">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-signal-pass" aria-hidden />
                    <span className="min-w-0"><Rich text={p} /></span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section id="credenciales" index={2} title="Qué credenciales necesitás" lede="Por nombre. Los valores de la base están en BK-29; el resto lo creás vos o es público.">
              <ul className="space-y-2.5">
                {config.credentials.map(row => <CredentialCard key={row.names[0]} row={row} config={config} />)}
              </ul>
              <Callout tone="warn">
                <p><Rich text="Nunca copies un valor de BK-29 fuera de tu `.env`: ni en un commit, ni en un chat, ni en una captura. El token de API es personal: no lo compartas." /></p>
              </Callout>
            </Section>

            <Section id="pasos" index={3} title="Paso a paso" lede="Hacelo en orden. Cada paso dice cómo sabés que salió bien.">
              <ol className="space-y-6" data-testid="qa-steps">
                {config.steps.map((step, i) => (
                  <li key={step.id} id={`paso-${step.id}`} data-testid={`qa-step-${step.id}`} className="grid scroll-mt-20 grid-cols-[1.75rem_minmax(0,1fr)] gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-2 border border-stroke-2 bg-surface-3 font-mono text-sm font-semibold text-fg-0">{i + 1}</span>
                    <div className="min-w-0 space-y-2.5">
                      <h3 className="pt-0.5 text-lg font-semibold text-fg-0">{step.title}</h3>
                      <p className="text-md text-fg-2"><Rich text={step.body} /></p>
                      {step.code && <CodeBlock code={step.code.code} language={step.code.language} title={step.code.title} />}
                      <p className="flex items-start gap-1.5 text-base text-fg-1">
                        <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-pass" aria-hidden />
                        <span>
                          <span className="font-medium text-signal-pass">Listo si: </span>
                          <Rich text={step.done} />
                        </span>
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </Section>

            <Section id="harness" index={4} title="Tu harness" lede={config.harnessCommon}>
              <HarnessTabs items={harnessItems} />
            </Section>

            <Section id="admin" index={5} title="Token de administrador de un workspace" lede={config.adminToken.why}>
              <ol className="space-y-4" data-testid="qa-admin-steps">
                {config.adminToken.steps.map((s, i) => (
                  <li key={s.title} className="space-y-2">
                    <p className="text-md text-fg-1">
                      <span className="mr-1.5 font-mono text-sm text-fg-3">
                        {i + 1}
                        .
                      </span>
                      {s.title}
                    </p>
                    <CodeBlock code={s.code} language="bash" />
                    <p className="flex items-start gap-1.5 text-base text-fg-1">
                      <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-signal-pass" aria-hidden />
                      <span>
                        <span className="font-medium text-signal-pass">Listo si: </span>
                        {s.done}
                      </span>
                    </p>
                  </li>
                ))}
              </ol>
              <Callout tone="info">
                <p><Rich text="Ningún comando imprime un token: quedan en `.auth/`, que git ignora. Ejecutalos desde la raíz de tu repo de QA." /></p>
              </Callout>
            </Section>

            <Section id="problemas" index={6} title="Problemas frecuentes" lede="Buscá el error que ves. Cada fila dice la causa y el arreglo.">
              {config.troubleshooting.map(group => (
                <div key={group.id} data-testid={`qa-trouble-${group.id}`} className="space-y-2">
                  <h3 className="pt-2 font-mono text-2xs uppercase tracking-widest text-fg-3">{group.title}</h3>
                  <ul className="space-y-2">
                    {group.items.map(t => (
                      <li key={t.symptom} className="rounded-3 border border-stroke-2 bg-surface-2 p-3.5">
                        <p className="font-mono text-sm font-medium text-fg-0">{t.symptom}</p>
                        <dl className="mt-2 grid gap-x-3 gap-y-1 text-base sm:grid-cols-[4.5rem_1fr]">
                          <dt className="font-mono text-2xs uppercase tracking-wider text-fg-3 sm:pt-0.5">Causa</dt>
                          <dd className="text-fg-2"><Rich text={t.cause} /></dd>
                          <dt className="font-mono text-2xs uppercase tracking-wider text-signal-pass sm:pt-0.5">Arreglo</dt>
                          <dd className="text-fg-1"><Rich text={t.fix} /></dd>
                        </dl>
                        {t.code && <div className="mt-2.5"><CodeBlock code={t.code} language="bash" /></div>}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </Section>

            <Section id="referencia" index={7} title="Referencia">
              <h3 className="text-lg font-semibold text-fg-0">Roles de la base</h3>
              <Table
                testid="qa-ref-roles"
                head={['Rol', 'Permisos']}
                rows={reference.dbRoles.map(r => [<Code key="n">{r.name}</Code>, r.access])}
              />
              <Callout tone="warn">
                <p><Rich text={`Los dos roles tienen \`BYPASSRLS\`: ven los datos de todos los workspaces. Las tablas de secretos están revocadas: ${reference.revokedSecretTables.map(t => `\`${t}\``).join(', ')}.`} /></p>
                <p><Rich text={reference.rlsProbe} /></p>
              </Callout>
              <Callout tone="danger">
                <p><Rich text={reference.rpcAccess} /></p>
              </Callout>

              <h3 className="pt-2 text-lg font-semibold text-fg-0">Scopes de un PAT</h3>
              <Table
                testid="qa-ref-scopes"
                head={['Scope', 'Lo da signin', 'Para qué']}
                rows={reference.scopes.map(s => [
                  <Code key="n">{s.name}</Code>,
                  s.onSignin ? <span key="y" className="text-signal-pass">Sí</span> : <span key="n" className="text-signal-fail">No</span>,
                  s.note,
                ])}
              />

              <h3 className="pt-2 text-lg font-semibold text-fg-0">Endpoints de auth</h3>
              <Table
                testid="qa-ref-endpoints"
                head={['Método', 'Ruta', 'Auth', 'Qué hace']}
                rows={reference.authEndpoints.map(e => [
                  <Badge key="m" variant="outline" className="font-mono">{e.method}</Badge>,
                  <Code key="p">{e.path}</Code>,
                  e.auth,
                  e.purpose,
                ])}
              />

              <h3 className="pt-2 text-lg font-semibold text-fg-0">Certificado de la base (TLS)</h3>
              <div data-testid="qa-db-ca" className="space-y-3 rounded-3 border border-stroke-2 bg-surface-2 p-4">
                <p className="text-base text-fg-2">{db.tlsCa.purpose}</p>
                <div className="flex flex-wrap items-center gap-3">
                  <a href={db.tlsCa.href} download data-testid="qa-db-ca-download" className={buttonVariants({ variant: 'default' })}>
                    <Download className="h-3.5 w-3.5" aria-hidden />
                    {db.tlsCa.fileName}
                  </a>
                  <span data-testid="qa-db-ca-meta" className="font-mono text-2xs text-fg-3">
                    {db.tlsCa.issuer}
                    {' · vence '}
                    {db.tlsCa.validUntil}
                  </span>
                </div>
                <p className="break-all font-mono text-2xs text-fg-3">
                  SHA-256
                  {' '}
                  {db.tlsCa.sha256}
                </p>
                <CodeBlock code={db.tlsCa.nodeEnv} language="bash" />
                <CodeBlock code={db.tlsCa.pgClient} language="typescript" title="pg-client.ts" />
                <Callout tone="danger" testid="qa-db-ca-last-resort">
                  <p>{db.tlsCa.lastResort}</p>
                </Callout>
              </div>
            </Section>

            <footer className="flex flex-wrap items-center gap-3 border-t border-stroke-1 pt-6 text-sm text-fg-3">
              <span>Página pública: nunca muestra un valor de credencial.</span>
              <span className="flex-1" />
              <a href={config.credentialsSource.url} target="_blank" rel="noopener noreferrer" className="text-accent hover:text-accent-hi" data-testid="qa-footer-bk29">
                {config.credentialsSource.label}
              </a>
            </footer>
          </main>
        </div>
      </div>
    </div>
  );
}
