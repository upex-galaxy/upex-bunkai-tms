import type { QaConfig } from '../qa-config';
import { Badge } from '@components/ui/badge';
import { Database, GitBranch, Globe, Server } from 'lucide-react';

// Literal class maps per hue so Tailwind's JIT scanner picks them up
// (dynamic `border-${hue}-500` strings would be purged from the build).
const BOX_STYLES = {
  blue: 'border-blue-500 bg-blue-50 dark:bg-blue-950/40',
  violet: 'border-violet-500 bg-violet-50 dark:bg-violet-950/40',
  emerald: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40',
} as const;

type Hue = keyof typeof BOX_STYLES;

function Box({ icon, label, sub, hue }: {
  icon: React.ReactNode
  label: string
  sub: string
  hue: Hue
}) {
  return (
    <div className="flex flex-col items-center">
      <div className={`flex h-24 w-36 flex-col items-center justify-center rounded-2 border-2 ${BOX_STYLES[hue]}`}>
        {icon}
        <span className="mt-1 text-sm font-medium text-fg-0">{label}</span>
      </div>
      <span className="mt-2 max-w-36 text-center text-xs text-fg-3">{sub}</span>
    </div>
  );
}

function Arrow() {
  return (
    <>
      <span className="hidden text-2xl text-fg-4 md:block">→</span>
      <span className="text-2xl text-fg-4 md:hidden">↓</span>
    </>
  );
}

function RepoRow({ label, url }: { label: string, url: string | null }) {
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-2 bg-surface-2 p-3 text-sm">
      <Badge variant="secondary">{label}</Badge>
      {url
        ? (
            <a
              className="break-all font-mono text-accent underline underline-offset-2"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {url}
            </a>
          )
        : <span className="text-fg-3">— preguntá a tu lead —</span>}
    </div>
  );
}

export function ArchDiagram({ config }: { config: QaConfig }) {
  return (
    <div data-testid="qa-architecture-diagram" className="py-4">
      <div className="flex flex-col items-center justify-center gap-4 md:flex-row md:gap-6">
        <Box
          icon={<Globe className="h-8 w-8 text-blue-600 dark:text-blue-400" />}
          label="Frontend"
          sub={config.stack.framework}
          hue="blue"
        />
        <Arrow />
        <Box
          icon={<Server className="h-8 w-8 text-violet-600 dark:text-violet-400" />}
          label="API"
          sub={config.stack.auth.join(' · ')}
          hue="violet"
        />
        <Arrow />
        <Box
          icon={<Database className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />}
          label="Database"
          sub={`${config.stack.db}${config.stack.orm ? ` + ${config.stack.orm}` : ''}`}
          hue="emerald"
        />
      </div>

      {/* MCP layer */}
      <div className="mt-8 flex flex-col items-center justify-center gap-3 border-t border-dashed border-stroke-2 pt-6 md:flex-row md:gap-6">
        <Badge variant="outline">DBHub MCP → DB</Badge>
        <Badge variant="outline">OpenAPI / Postman MCP → API</Badge>
        <Badge variant="outline">Playwright MCP → UI</Badge>
      </div>

      {/* Repos (mono vs poly) */}
      <div className="mt-8 border-t border-dashed border-stroke-2 pt-6" data-testid="qa-repos">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-fg-1">
          <GitBranch className="h-4 w-4" />
          {' '}
          Repositorios
        </p>
        {config.project.reposShape === 'mono'
          ? <RepoRow label="Monorepo" url={config.project.backendRepo ?? config.project.frontendRepo} />
          : (
              <div className="grid gap-2 md:grid-cols-2">
                <RepoRow label="Frontend" url={config.project.frontendRepo} />
                <RepoRow label="Backend" url={config.project.backendRepo} />
              </div>
            )}
      </div>
    </div>
  );
}
