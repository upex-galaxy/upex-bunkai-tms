import type { QaConfig } from '../qa-config';
import { Badge } from '@components/ui/badge';
import { AlertTriangle, Database } from 'lucide-react';
import { CodeBlock } from './CodeBlock';

// Activation snippet — wrapper scripts, the `bun env` subshell, and direnv.
const wrapperBlock = `# Wrapper dotenv-cli (cross-platform) — lanza el agente con .env ya cargado:
bun run claude       # = dotenv -e .env -- claude
bun run opencode     # = dotenv -e .env -- opencode`;

const envShellBlock = `# bun env — abre un SUBSHELL con .env cargado para TODA la sesión.
# Útil para que 'claude' / 'opencode' "pelados" tengan las vars sin wrapper.
bun run env          # = dotenv -e .env -- $SHELL
# Los MCP cachean el env al spawnear → lanzá el agente DESDE este subshell.`;

const direnvBlock = `# direnv + .envrc (Mac/Linux) — autocarga al entrar al directorio:
direnv allow         # una vez; luego cada cd al repo exporta .env solo`;

export async function EnvSetup({ config }: { config: QaConfig }) {
  const hasWrapper = config.env.activation.includes('wrapper');
  const hasDirenv = config.env.activation.includes('direnv');
  const hasAuto = config.env.activation.includes('auto');

  return (
    <div data-testid="qa-env-setup" className="space-y-4">
      <p className="text-sm text-fg-2">
        Los archivos de config de los MCP están
        {' '}
        <strong className="text-fg-0">commiteados a git y no llevan secretos</strong>
        : referencian variables por expansión. Los valores reales viven en
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
          Activar
          {' '}
          <code className="rounded bg-surface-2 px-1">.env</code>
          {' '}
          antes de lanzar el agente — tres caminos:
        </p>
        {hasWrapper && <CodeBlock language="bash" code={wrapperBlock} title="wrapper" />}
        <CodeBlock language="bash" code={envShellBlock} title="bun env (subshell)" />
        {hasDirenv && <CodeBlock language="bash" code={direnvBlock} title="direnv" />}
        {hasAuto && (
          <p className="text-sm text-fg-2">
            El runtime autocarga
            {' '}
            <code className="rounded bg-surface-2 px-1 text-fg-1">.env</code>
            {' '}
            (igual exportá las vars para el launcher del MCP).
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
          , reentrá — las vars se leen una vez al spawnear el MCP. Verificá que se
          inyecten con
          {' '}
          <code>dotenv -e .env -- env | grep DBHUB</code>
          {' '}
          (un
          {' '}
          <code>env | grep DBHUB</code>
          {' '}
          pelado sale vacío aunque esté bien:
          {' '}
          <code>bun run claude</code>
          {' '}
          inyecta el
          {' '}
          <code>.env</code>
          {' '}
          solo en el proceso del agente, no en tu terminal).
        </p>
      </div>
    </div>
  );
}
