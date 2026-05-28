import type { QaConfig } from '../qa-config';
import { Badge } from '@components/ui/badge';
import { AlertTriangle } from 'lucide-react';

export function EnvSetup({ config }: { config: QaConfig }) {
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

      <div className="rounded-2 border-l-4 border-cyan-500 bg-cyan-50 p-3 text-sm dark:bg-cyan-950/30">
        <p className="font-medium text-fg-0">
          Activar
          {' '}
          <code className="rounded bg-surface-2 px-1">.env</code>
          {' '}
          antes de lanzar el agente:
        </p>
        <ul className="ml-5 mt-1 list-disc text-fg-2">
          {config.env.activation.includes('wrapper') && (
            <li>
              <code>bun run claude</code>
              {' '}
              /
              {' '}
              <code>bun run opencode</code>
              {' '}
              (wrapper dotenv-cli, cross-platform)
            </li>
          )}
          {config.env.activation.includes('direnv') && (
            <li>
              <code>direnv</code>
              {' '}
              +
              {' '}
              <code>.envrc</code>
              {' '}
              (Mac/Linux;
              {' '}
              <code>direnv allow</code>
              )
            </li>
          )}
          {config.env.activation.includes('auto') && (
            <li>
              El runtime autocarga
              {' '}
              <code>.env</code>
              {' '}
              (igual exportá las vars para el launcher del MCP).
            </li>
          )}
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
          , reentrá — las vars se leen una vez al spawnear el MCP. Verificá:
          {' '}
          <code>env | grep DBHUB</code>
          .
        </p>
      </div>
    </div>
  );
}
