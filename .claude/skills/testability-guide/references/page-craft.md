# Page Craft — the `/qa` golden file

> **Purpose**: The visual + structural target for the generated `/qa` page. This is the single thing that makes the output *better than a flat accordion list*: a page with its own layout (sticky TOC, hero, domain-colored sections), a clean RSC split, copy-buttoned multi-agent code blocks, a real architecture diagram, and a one-object detection→render bridge so NOTHING is hardcoded.
>
> **When to read**: Phase 4 (page codegen). Pair with `page-structure.md` (section order + copy) and `mcp-and-env-setup.md` (the content inside §3–§6).
>
> **How to use the golden**: copy the structure, then fill `qaConfig` (below) from Phase-1 detection. Adapt primitives to the detected UI kit (the golden uses shadcn/ui + Tailwind + lucide-react + next-themes — the most common host stack). For non-Next frameworks, keep the same component decomposition; swap the routing/RSC mechanics per `routing-patterns.md`.

---

## Design principles (what makes it fascinating to read)

1. **Own layout, not a doc dump.** Two-column on desktop: sticky TOC rail + content. Hero band on top. Each section is a self-contained card with a domain accent color.
2. **Scannable.** Sticky TOC with active-section highlight + anchor deep-links + copy-link. A tester can jump straight to "DB testing".
3. **Show, don't tell.** Real architecture diagram (Frontend → API → DB + MCP layer + Repos). Copy-buttoned snippets. Agent tabs so each tester copies the block for THEIR tool.
4. **Zero hardcode at the source.** One typed `qaConfig` object holds every detected value. JSX reads from it. Codegen fills it. If a value is `null`, the UI renders an explicit "ask your lead" gap — never a fabricated default.
5. **Clean RSC split.** `page.tsx` is a Server Component (static markup + metadata). Anything with state/interaction lives in a `'use client'` sibling under `_components/`.
6. **Dark/light from the host.** Mirror the host theme mechanism (the golden assumes `next-themes` + `dark:` variants + CSS-variable tokens). Never ship a second theme system.

---

## File structure (Next.js App Router)

```
app/qa/
├── page.tsx                 # Server Component — markup, metadata, snapshot comment
├── qa-config.ts             # the detection→render bridge (typed; codegen fills it)
└── _components/
    ├── QaShell.tsx          # 'use client' — layout: hero + sticky TOC + content
    ├── Toc.tsx              # 'use client' — sticky nav, active-section, copy-link
    ├── CodeBlock.tsx        # 'use client' — copy + check 2s; optional agent tabs
    ├── ArchDiagram.tsx      # boxes-and-arrows + MCP layer + Repos (mono/poly)
    ├── AuthMethods.tsx      # tabs over detected auth methods
    ├── TwoWayTabs.tsx       # reusable 2-way tabs (DB: toml|URI · API: OpenAPI|Postman)
    └── EnvSetup.tsx         # .env slots + activation + missing-var table
```

For non-App-Router frameworks, collapse to a single page file + the framework's interactivity pattern; keep the component boundaries conceptually.

---

## The `qaConfig` contract (qa-config.ts)

Every value here is produced by `pre-flight-discovery.md`. `null` ⇒ render a gap, not a guess.

```ts
// app/qa/qa-config.ts — codegen fills every field from Phase-1 detection.
export type AgentKey = "claude" | "opencode" | "codex" | "gemini";

export interface QaConfig {
  lang: "es" | "en";
  project: { name: string; reposShape: "mono" | "poly"; backendRepo: string | null; frontendRepo: string | null };
  stack: { framework: string; ui: string; db: string; orm: string | null; auth: string[] };
  credentialsSource: { label: string; url: string } | null;   // Jira Epic / Confluence / Notion …
  docs: { ui: "scalar" | "redoc" | "swagger" | null; route: string | null; specUrl: string | null };
  api: {
    baseUrl: string | null;
    loginEndpoint: string | null;        // DETECTED — never "/api/auth/callback/credentials" by default
    tokenShape: string | null;           // e.g. '{ access_token, token_type, expires_in }'
    loginHelper: string | null;          // e.g. "bun run api:login" if present
    authMethods: { id: string; label: string; snippet: string }[];
  };
  db: { engine: "postgres" | "sqlserver" | "mysql" | "sqlite" | "mariadb"; tomlPath: string; uriScheme: string };
  mcp: { agents: AgentKey[]; dbhub: Record<AgentKey, string>; openapi: Record<AgentKey, string>;
         postman: Record<AgentKey, string>; playwright: Record<AgentKey, string> };
  env: { strategy: "expansion" | "literal"; activation: ("wrapper" | "direnv" | "auto")[]; slots: string[] };
  demoUsers: { email: string; note: string }[];               // emails only on the page; passwords gated
}

export const qaConfig: QaConfig = {/* DETECTED — filled by the skill */} as QaConfig;
```

> The golden's whole point: reviewers can see at a glance that the page contains **no literal endpoint, host, or token** — only `qaConfig.*` reads.

---

## Color system (domain accents)

Use the host's token palette; map a hue per domain so a tester learns the page visually:

| Domain | Accent (Tailwind family) | Icon (lucide) |
| --- | --- | --- |
| Credentials | `amber` | `KeyRound` |
| Architecture / Repos | `slate` / `blue` | `Network` / `GitBranch` |
| DB testing | `emerald` | `Database` |
| API testing | `violet` | `Plug` / `FileJson` |
| UI testing | `pink` | `MousePointerClick` / `TestTube2` |
| Env setup | `cyan` | `Terminal` |

Accents are `border-l-4` + a soft `bg-<hue>-50 dark:bg-<hue>-950/30` for callouts. Keep body text on the host's `foreground`/`muted-foreground` tokens so dark/light just works.

---

## Golden — `page.tsx` (Server Component)

```tsx
/* qa-guide-snapshot
   …fields per idempotency-snapshot.md…
*/
import type { Metadata } from "next";
import { qaConfig } from "./qa-config";
import { QaShell } from "./_components/QaShell";

export const metadata: Metadata = { title: "Software Testability Guide for QA" };

// Env-gate is CONDITIONAL (see SKILL.md T3): gate only for internal-tool projects.
// For public practice/demo apps the page is the teaching surface — leave it public.
export default function QaPage() {
  return <QaShell config={qaConfig} />;
}
```

## Golden — `QaShell.tsx` (layout)

```tsx
"use client";
import { qaSections } from "./Toc";
import { Toc } from "./Toc";
import { ArchDiagram } from "./ArchDiagram";
import { TwoWayTabs } from "./TwoWayTabs";
import { AuthMethods } from "./AuthMethods";
import { EnvSetup } from "./EnvSetup";
import { CodeBlock } from "./CodeBlock";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyRound, ExternalLink, Database, Plug, MousePointerClick, Network } from "lucide-react";
import type { QaConfig } from "../qa-config";

export function QaShell({ config }: { config: QaConfig }) {
  const t = config.lang === "es" ? es : en;
  return (
    <div data-testid="qa-page" className="mx-auto max-w-7xl px-4 py-10">
      {/* Hero */}
      <header className="mb-10 text-center">
        <h1 data-testid="qa-title" className="text-4xl font-bold tracking-tight">
          Software Testability Guide for QA
        </h1>
        <p className="mx-auto mt-3 max-w-2xl text-lg text-muted-foreground">{t.subtitle}</p>
      </header>

      <div className="lg:grid lg:grid-cols-[16rem_1fr] lg:gap-10">
        {/* Sticky TOC rail (desktop) */}
        <aside className="hidden lg:block">
          <Toc className="sticky top-20" />
        </aside>

        <main className="min-w-0 space-y-8">
          {/* §1 Credentials CTA — above the fold */}
          <Card id="credenciales" data-testid="qa-credentials-card"
                className="border-l-4 border-amber-500 bg-amber-50 dark:bg-amber-950/30">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <KeyRound className="h-5 w-5 text-amber-600 dark:text-amber-400" />
                {t.credsTitle}
              </CardTitle>
              <CardDescription>{t.credsDesc}</CardDescription>
            </CardHeader>
            <CardContent>
              {config.credentialsSource ? (
                <Button asChild size="lg" className="bg-amber-600 text-white hover:bg-amber-700"
                        data-testid="qa-credentials-button">
                  <a href={config.credentialsSource.url} target="_blank" rel="noopener noreferrer">
                    <KeyRound className="mr-2 h-5 w-5" />
                    {t.credsCta} ({config.credentialsSource.label})
                    <ExternalLink className="ml-2 h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <p className="text-sm text-muted-foreground">{t.credsGap}</p>
              )}
              <p className="mt-3 text-xs text-muted-foreground">{t.credsAsk}</p>
            </CardContent>
          </Card>

          {/* §2 Architecture + Repos */}
          <Section id="arquitectura" testid="qa-architecture-card" icon={<Network className="h-5 w-5" />}
                   title={t.archTitle} desc={t.archDesc} accent="slate">
            <ArchDiagram config={config} />
          </Section>

          {/* §3 Trinity overview + Env setup */}
          <Section id="trifuerza" testid="qa-section-trinity" title={t.trinityTitle} desc={t.trinityDesc} accent="cyan">
            <TrinityCards t={t} />
            <EnvSetup config={config} />
          </Section>

          {/* §4 DB testing — two ways */}
          <Section id="db" testid="qa-section-database" icon={<Database className="h-5 w-5" />}
                   title={t.dbTitle} desc={t.dbDesc} accent="emerald">
            <TwoWayTabs config={config} domain="db" />
          </Section>

          {/* §5 API testing — two ways + auth + docs */}
          <Section id="api" testid="qa-section-api" icon={<Plug className="h-5 w-5" />}
                   title={t.apiTitle} desc={t.apiDesc} accent="violet">
            <AuthMethods config={config} />
            <TwoWayTabs config={config} domain="api" />
            {config.docs.route && (
              <Button asChild variant="outline" className="mt-4" data-testid="qa-docs-button">
                <a href={config.docs.route} target="_blank" rel="noopener noreferrer">
                  {t.docsCta} ({config.docs.ui ?? "API docs"}) <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            )}
          </Section>

          {/* §6 UI testing — Playwright scripted + agentic */}
          <Section id="ui" testid="qa-section-ui" icon={<MousePointerClick className="h-5 w-5" />}
                   title={t.uiTitle} desc={t.uiDesc} accent="pink">
            <CodeBlock language="typescript" code={config /* playwright fixture, see page-structure §6 */ && PLAYWRIGHT_FIXTURE} />
            {/* agentic prompts + decision rule rendered here — see page-structure.md §6 */}
          </Section>

          {/* §7 Quick reference */}
          <Section id="referencia" testid="qa-section-reference" title={t.refTitle} accent="blue">
            {/* demo users (emails only), endpoints table, troubleshooting */}
          </Section>
        </main>
      </div>
    </div>
  );
}
```

> `Section` is a tiny local wrapper (Card + accent border + anchor heading + a copy-link button). `TrinityCards` renders the three-card grid from `mcp-and-env-setup.md` §3. `PLAYWRIGHT_FIXTURE` is the scripted fixture string from `page-structure.md` §6. `es`/`en` are copy dictionaries (Spanish default).

---

## Golden — `CodeBlock.tsx` (copy + agent tabs)

```tsx
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Copy, Check } from "lucide-react";

function Pre({ code, language = "bash" }: { code: string; language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div className="group relative" data-testid="qa-code-block">
      <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-sm text-slate-50">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy code"
              className="absolute right-2 top-2 h-8 w-8 opacity-0 transition-opacity group-hover:opacity-100"
              data-testid="qa-copy-code-button">
        {copied ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

// Single block:
export function CodeBlock(props: { code: string; language?: string }) { return <Pre {...props} />; }

// Multi-agent tabbed block (Claude / OpenCode / Codex / Gemini):
export function AgentCodeBlock({ blocks, agents }: {
  blocks: Record<string, string>; agents: string[];
}) {
  const labels: Record<string, string> = { claude: "Claude Code", opencode: "OpenCode", codex: "Codex", gemini: "Gemini" };
  const langs: Record<string, string> = { claude: "json", opencode: "jsonc", codex: "toml", gemini: "json" };
  return (
    <Tabs defaultValue={agents[0]} data-testid="qa-agent-tabs">
      <TabsList>{agents.map(a => <TabsTrigger key={a} value={a} data-testid={`qa-agent-tab-${a}`}>{labels[a]}</TabsTrigger>)}</TabsList>
      {agents.map(a => <TabsContent key={a} value={a}><Pre code={blocks[a]} language={langs[a]} /></TabsContent>)}
    </Tabs>
  );
}
```

---

## Golden — `ArchDiagram.tsx` (Frontend → API → DB + MCP + Repos)

```tsx
import { Globe, Server, Database, GitBranch } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { QaConfig } from "../qa-config";

function Box({ icon, label, sub, hue }: { icon: React.ReactNode; label: string; sub: string; hue: string }) {
  return (
    <div className="flex flex-col items-center">
      <div className={`flex h-24 w-32 flex-col items-center justify-center rounded-lg border-2 border-${hue}-500 bg-${hue}-100 dark:bg-${hue}-950`}>
        {icon}<span className="mt-1 text-sm font-medium">{label}</span>
      </div>
      <span className="mt-2 text-xs text-muted-foreground">{sub}</span>
    </div>
  );
}

export function ArchDiagram({ config }: { config: QaConfig }) {
  const Arrow = () => (<><span className="hidden text-3xl text-muted-foreground md:block">→</span>
                         <span className="text-3xl text-muted-foreground md:hidden">↓</span></>);
  return (
    <div data-testid="qa-architecture-diagram" className="py-6">
      <div className="flex flex-col items-center justify-center gap-4 md:flex-row md:gap-8">
        <Box icon={<Globe className="h-8 w-8 text-blue-600 dark:text-blue-400" />} label="Frontend" sub={config.stack.framework} hue="blue" />
        <Arrow />
        <Box icon={<Server className="h-8 w-8 text-violet-600 dark:text-violet-400" />} label="API" sub={config.stack.auth.join(" · ")} hue="violet" />
        <Arrow />
        <Box icon={<Database className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />} label="Database" sub={`${config.stack.db}${config.stack.orm ? " + " + config.stack.orm : ""}`} hue="emerald" />
      </div>

      {/* MCP layer */}
      <div className="mt-8 flex flex-col items-center justify-center gap-3 border-t border-dashed pt-6 md:flex-row md:gap-6">
        <Badge variant="outline">DBHub MCP → DB</Badge>
        <Badge variant="outline">OpenAPI / Postman MCP → API</Badge>
        <Badge variant="outline">Playwright MCP → UI</Badge>
      </div>

      {/* Repos (mono vs poly) */}
      <div className="mt-8 border-t border-dashed pt-6" data-testid="qa-repos">
        <p className="mb-3 flex items-center gap-2 text-sm font-semibold"><GitBranch className="h-4 w-4" /> Repositorios</p>
        {config.project.reposShape === "mono" ? (
          <RepoRow label="Monorepo" url={config.project.backendRepo ?? config.project.frontendRepo} />
        ) : (
          <div className="grid gap-2 md:grid-cols-2">
            <RepoRow label="Frontend" url={config.project.frontendRepo} />
            <RepoRow label="Backend" url={config.project.backendRepo} />
          </div>
        )}
      </div>
    </div>
  );
}

function RepoRow({ label, url }: { label: string; url: string | null }) {
  return (
    <div className="flex items-center gap-2 rounded-lg bg-muted/50 p-3 text-sm">
      <Badge>{label}</Badge>
      {url ? <a className="font-mono underline" href={url} target="_blank" rel="noopener noreferrer">{url}</a>
           : <span className="text-muted-foreground">— preguntá a tu lead —</span>}
    </div>
  );
}
```

---

## Golden — `AuthMethods.tsx`, `TwoWayTabs.tsx`, `EnvSetup.tsx`

```tsx
// AuthMethods.tsx — one tab per DETECTED method (Supabase token / Bearer / cookie / X-API-Key / custom JWT)
"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CodeBlock } from "./CodeBlock";
import type { QaConfig } from "../qa-config";
export function AuthMethods({ config }: { config: QaConfig }) {
  const methods = config.api.authMethods;
  if (!methods.length) return <p className="text-sm text-muted-foreground">Auth no detectado — preguntá a tu lead.</p>;
  return (
    <Tabs defaultValue={methods[0].id} data-testid="qa-auth-methods">
      <TabsList>{methods.map(m => <TabsTrigger key={m.id} value={m.id} data-testid={`qa-auth-tab-${m.id}`}>{m.label}</TabsTrigger>)}</TabsList>
      {methods.map(m => <TabsContent key={m.id} value={m.id}><CodeBlock language="bash" code={m.snippet} /></TabsContent>)}
    </Tabs>
  );
}
```

```tsx
// TwoWayTabs.tsx — DB: ["DBHub MCP", "URI VSCode"]  ·  API: ["OpenAPI MCP", "Postman"]
"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AgentCodeBlock, CodeBlock } from "./CodeBlock";
import type { QaConfig } from "../qa-config";
export function TwoWayTabs({ config, domain }: { config: QaConfig; domain: "db" | "api" }) {
  if (domain === "db") return (
    <Tabs defaultValue="mcp" data-testid="qa-db-ways">
      <TabsList><TabsTrigger value="mcp">DBHub MCP</TabsTrigger><TabsTrigger value="uri">URI (VSCode)</TabsTrigger></TabsList>
      <TabsContent value="mcp"><AgentCodeBlock agents={config.mcp.agents} blocks={config.mcp.dbhub} /></TabsContent>
      <TabsContent value="uri"><CodeBlock language="bash" code={`${config.db.uriScheme}://<DBHUB_USER>:<DBHUB_PASSWORD>@<host>/<db>`} /></TabsContent>
    </Tabs>
  );
  return (
    <Tabs defaultValue="openapi" data-testid="qa-api-ways">
      <TabsList><TabsTrigger value="openapi">OpenAPI MCP</TabsTrigger><TabsTrigger value="postman">Postman</TabsTrigger></TabsList>
      <TabsContent value="openapi"><AgentCodeBlock agents={config.mcp.agents} blocks={config.mcp.openapi} /></TabsContent>
      <TabsContent value="postman"><AgentCodeBlock agents={config.mcp.agents} blocks={config.mcp.postman} /></TabsContent>
    </Tabs>
  );
}
```

```tsx
// EnvSetup.tsx — .env slots (names only) + activation + missing-var table
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import type { QaConfig } from "../qa-config";
export function EnvSetup({ config }: { config: QaConfig }) {
  return (
    <div data-testid="qa-env-setup" className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {config.env.slots.map(s => <Badge key={s} variant="secondary" className="font-mono">{s}</Badge>)}
      </div>
      <div className="rounded-lg border-l-4 border-cyan-500 bg-cyan-50 p-3 text-sm dark:bg-cyan-950/30">
        <p className="font-medium">Activar <code>.env</code> antes de lanzar el agente:</p>
        <ul className="ml-5 mt-1 list-disc text-muted-foreground">
          {config.env.activation.includes("wrapper") && <li><code>bun run claude</code> / <code>bun run opencode</code> (dotenv-cli, cross-platform)</li>}
          {config.env.activation.includes("direnv") && <li><code>direnv</code> + <code>.envrc</code> (Mac/Linux; <code>direnv allow</code>)</li>}
          {config.env.activation.includes("auto") && <li>El runtime autocarga <code>.env</code> (igual exportá las vars para el launcher del MCP).</li>}
        </ul>
      </div>
      <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
        <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> Si una var no carga</p>
        <p className="mt-1 text-muted-foreground">El MCP da 401/403 (o DBHub: error críptico de auth porque sustituye literal <code>{"${VAR}"}</code>). Salí del agente, corregí <code>.env</code>, reentrá. Verificá: <code>env | grep DBHUB</code>.</p>
      </div>
    </div>
  );
}
```

---

## data-testid conventions

- Page root: `qa-page`. Title: `qa-title`.
- Sections: `qa-section-<name>` (`-trinity`, `-database`, `-api`, `-ui`, `-reference`). **One id per node** — never two on the same element.
- Credentials: `qa-credentials-card`, `qa-credentials-button`. Docs: `qa-docs-button`.
- Code: `qa-code-block`, `qa-copy-code-button`. Agent tabs: `qa-agent-tabs`, `qa-agent-tab-<agent>`.
- Tabs: `qa-auth-methods`/`qa-auth-tab-<id>`, `qa-db-ways`, `qa-api-ways`. Env: `qa-env-setup`. Repos: `qa-repos`.
- TOC: `qa-toc`, `qa-toc-link-<section>`.

---

## Responsive + a11y

- Mobile-first. The `[16rem_1fr]` TOC grid collapses to single column under `lg`; on mobile the TOC becomes a top `<details>` or is omitted (sections still anchor-linkable).
- ArchDiagram arrows flip horizontal→vertical under `md`. Two-way tabs and agent tabs scroll horizontally if cramped.
- Accordions/tabs keyboard-navigable (shadcn primitives are). Icon-only buttons carry `aria-label`. Headings semantic (`h1` → `h2` per section).
- Dark/light via the host theme — no inline colors; only token classes + the per-domain `<hue>` families (which have `dark:` variants).

---

## Adapt-don't-copy checklist

- [ ] `qaConfig` filled entirely from detection; grep the page for literal hosts/endpoints/tokens → must be zero.
- [ ] UI primitives = the detected host kit (not shadcn if the host uses MUI/Mantine/Chakra).
- [ ] **Missing primitive ≠ missing dep.** If the golden needs a primitive the host kit has not scaffolded yet (e.g. Tabs, Badge) but the underlying dep already exists (`@radix-ui/*`) or none is needed (`cva`), scaffold the local `components/ui/<x>.tsx` in the host's style. Adding a local component file is NOT "adding a dependency" — it is allowed. The "never add a dep" rule is about `package.json`, not about local files.
- [ ] **Custom token vocabulary?** The golden is coded against shadcn-neutral tokens (`text-muted-foreground`, `bg-card`, `border`). If the host uses a CUSTOM token system (e.g. `fg-0..4` / `surface-0..2` / `stroke-*` / `accent`), READ an existing host component (`components/ui/card.tsx`, a real page) for the real vocabulary and MAP the golden's classes onto it — do not emit raw shadcn-neutral classes the host app doesn't use. Domain-accent hues (amber/emerald/violet/cyan/pink/slate) come from default Tailwind and are safe regardless. Mirror the host's dark mechanism (`darkMode:'class'` vs `next-themes`); do not add `next-themes` if absent.
- [ ] Icons = the detected icon lib (lucide here; swap if host differs; inline SVG if none).
- [ ] Dark/light uses the host mechanism.
- [ ] Visible copy in `qaConfig.lang` (Spanish default in this ecosystem); identifiers + `data-testid`s stay English.
- [ ] Agent tabs include only `qaConfig.mcp.agents`; the 4-tab set is the documentation default.
