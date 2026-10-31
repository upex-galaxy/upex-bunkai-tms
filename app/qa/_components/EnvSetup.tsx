import type { QaConfig } from '../qa-config';
import { Badge } from '@components/ui/badge';
import { AlertTriangle, Database } from 'lucide-react';
import { CodeBlock } from './CodeBlock';

// Activation snippets: the agent opens bare and .env reaches only the process
// that needs it (each MCP server through its loader entry, a one-off command
// through varlock run). Never a wrapper, a sourced .env or a shell autoloader.
const openBareBlock = `# Abrí el agente pelado, en la carpeta del proyecto (o su app de escritorio). No carga ningún valor del .env:
claude
opencode`;

const mcpLoaderBlock = `# Cada MCP que necesita un valor arranca por el loader del .env (su entrada commiteada en la config):
bunx varlock run --filter <SUS_VARS> -- <comando del server>`;

const varlockRunBlock = `# Un comando que necesita un valor carga el .env solo para ESE proceso (nunca en tu shell):
bunx varlock run -- sh -c '<comando que usa "$VAR">'`;

export async function EnvSetup({ config }: { config: QaConfig }) {
  const hasMcpLoader = config.env.activation.includes('mcp-loader');
  const hasVarlockRun = config.env.activation.includes('varlock-run');
  const hasAuto = config.env.activation.includes('auto');

  return (
    <div data-testid="qa-env-setup" className="space-y-4">
      <p className="text-sm text-fg-2">
        Los archivos de config de los MCP están
        {' '}
        <strong className="text-fg-0">commiteados a git y no llevan secretos</strong>
        : nombran las variables, nunca sus valores. Los valores reales viven en
        {' '}
        <code className="rounded bg-surface-2 px-1 text-fg-1">.env</code>
        {' '}
        (gitignored). Slots que necesitás declarar:
      </p>
      <div className="flex flex-wrap gap-2">
        {config.env.slots.map(s => (
          <Badge key={s} variant="secondary" className="font-mono">{s}</Badge>
        ))}
      </div>

      <div className="space-y-3">
        <p className="text-sm font-semibold text-fg-1">
          Abrí el agente pelado: el
          {' '}
          <code className="rounded bg-surface-2 px-1">.env</code>
          {' '}
          llega solo al proceso que lo necesita, nunca al agente ni a tu shell.
        </p>
        <CodeBlock language="bash" code={openBareBlock} title="abrir el agente" />
        {hasMcpLoader && <CodeBlock language="bash" code={mcpLoaderBlock} title="loader del .env (MCP)" />}
        {hasVarlockRun && <CodeBlock language="bash" code={varlockRunBlock} title="varlock run" />}
        {hasAuto && (
          <p className="text-sm text-fg-2">
            Los scripts del proyecto autocargan el
            {' '}
            <code className="rounded bg-surface-2 px-1 text-fg-1">.env</code>
            {' '}
            (Bun lo hace solo); los MCP igual reciben el suyo por el loader.
          </p>
        )}
      </div>

      <div className="rounded-2 border-l-4 border-emerald-500 bg-emerald-50 p-3 text-sm dark:bg-emerald-950/30">
        <p className="flex items-center gap-2 font-medium text-fg-0">
          <Database className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          DBHub NO acepta un connection string — solo
          {' '}
          <code className="rounded bg-surface-2 px-1">[[sources]]</code>
        </p>
        <ul className="ml-5 mt-1 list-disc text-fg-2">
          <li>
            <strong className="text-fg-0">URI cruda</strong>
            {' '}
            (
            <code className="break-all rounded bg-surface-2 px-1">
              postgresql://&lt;user&gt;.&lt;ref&gt;:&lt;password&gt;@&lt;host&gt;:5432/postgres?sslmode=require
            </code>
            ): SOLO la usa una extensión SQL de VSCode/Cursor.
          </li>
          <li>
            <strong className="text-fg-0">DBHub</strong>
            {' '}
            (
            <code className="rounded bg-surface-2 px-1">dbhub.toml</code>
            {' '}
            →
            {' '}
            <code className="rounded bg-surface-2 px-1">[[sources]]</code>
            ): campos separados
            {' '}
            <code className="rounded bg-surface-2 px-1">host / port / user / password / database / sslmode</code>
            , cada uno desde su slot
            {' '}
            <code className="rounded bg-surface-2 px-1">DBHUB_*</code>
            . NO mete un DSN.
          </li>
        </ul>
      </div>

      <div className="rounded-2 border-l-4 border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
        <p className="flex items-center gap-2 font-medium text-fg-0">
          <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          Si una var no carga
        </p>
        <p className="mt-1 text-fg-2">
          El MCP da 401/403 (o DBHub: error críptico de auth porque sustituye el literal
          {' '}
          <code>{'$' + '{VAR}'}</code>
          ). Salí del agente, corregí
          {' '}
          <code>.env</code>
          , reentrá: las vars se leen una vez, al spawnear el MCP. Un
          {' '}
          <code>env | grep DBHUB</code>
          {' '}
          pelado sale vacío aunque todo esté bien, porque el loader le pasa las vars a cada proceso
          MCP al arrancar, nunca al agente ni a tu terminal. Verificá con estos tres, que imprimen
          solo nombres, nunca valores:
        </p>
        <ul className="ml-5 mt-1 list-disc text-fg-2">
          <li>
            <code>grep -E '^DBHUB[A-Z0-9_]*=.' .env | cut -d= -f1</code>
            : la var está en el archivo?
          </li>
          <li>
            <code>bunx varlock run -- env | grep '^DBHUB' | cut -d= -f1</code>
            : lo que ve el MCP al arrancar.
          </li>
          <li>
            <code>bunx varlock load --agent</code>
            : cada valor pasa el schema? (redactado)
          </li>
        </ul>
      </div>
    </div>
  );
}
