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
├── _lib/
│   ├── highlight.ts         # server-only Shiki bridge — memoized highlighter, dual theme
│   └── prepare.ts           # server one-shot: highlight every client-bound snippet
└── _components/
    ├── QaShell.tsx          # async SERVER orchestrator: layout + prepareQa() + sections
    ├── Toc.tsx              # 'use client' — sticky nav, active-section, copy-link
    ├── CodeBlock.tsx        # async SERVER CodeBlock + presentational CodeFrame (terminal|editor)
    ├── CopyButton.tsx       # 'use client' — the only interactive leaf (clipboard + 2s check)
    ├── AgentCodeBlock.tsx   # 'use client' — tabs over PRE-highlighted per-agent blocks
    ├── RequestCard.tsx      # 'use client' — Postman-style request viewer (Visual/curl toggle)
    ├── RequestCards.tsx     # 'use client' — tab group over RequestCards (§5 auth)
    ├── ArchDiagram.tsx      # boxes-and-arrows + MCP layer + Repos (mono/poly)
    ├── TwoWayTabs.tsx       # reusable 2-way tabs (DB: toml|URI · API: OpenAPI|Postman)
    └── EnvSetup.tsx         # .env slots + activation (3 paths) + missing-var table
```

> **Why the `_lib/` split**: the highlighter is server-only (it loads WASM + grammars — expensive, and must never ship to the browser). Client components (`AgentCodeBlock`, `RequestCard`) cannot import it, so the SERVER pre-highlights every snippet into html-string props (`prepare.ts`) and passes them down. Server components highlight inline via the async `<CodeBlock>`.

For non-App-Router frameworks, collapse to a single page file + the framework's interactivity pattern; keep the component boundaries conceptually. If the framework has no RSC/server-component model, run the highlighter at build time (or in the route loader) and pass html strings to the components — the "highlight on the server, copy on the client" split is the load-bearing idea, not the exact directory.

---

## The `qaConfig` contract (qa-config.ts)

Every value here is produced by `pre-flight-discovery.md`. `null` ⇒ render a gap, not a guess.

```ts
// app/qa/qa-config.ts — codegen fills every field from Phase-1 detection.
export type AgentKey = "claude" | "opencode" | "codex" | "gemini";
export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

// Postman-style description of ONE detected API request. Mirrors the project's
// REAL auth call — no invented endpoints. `body`/`response` are JSON strings
// (highlighted server-side); `curl` is the equivalent shell command. Every
// value is a placeholder (<API_BASE_URL>, <see credentials source>) — never a
// literal host/secret. (Q8 — request viewer.)
export interface ApiRequest {
  id: string;
  label: string;                          // e.g. "<METHOD> <path>" of the DETECTED request
  method: HttpMethod;
  url: string;                            // "<API_BASE_URL>/<detected-path>"
  description?: string;
  headers: { key: string; value: string }[];
  body: string | null;                    // JSON request body, or null
  response: string | null;                // example JSON response, or null
  curl: string;                           // the raw curl equivalent (toggle's "curl" view)
}

export interface DbRole { name: string; access: string; }   // e.g. "read-only (SELECT). BYPASSRLS."

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
    loginHelper: string | null;          // e.g. "bun run api:login" if present (Q5 — PAT bootstrap)
    authMethods: { id: string; label: string; snippet: string }[];   // raw-curl fallback (Q8=curl-blocks)
    apiRequests: ApiRequest[];           // Postman-style cards (Q8=request-cards, default) — DETECTED requests
    endpoints?: { method: string; path: string; purpose: string }[]; // §7 quick-reference table
  };
  db: {
    engine: "postgres" | "sqlserver" | "mysql" | "sqlite" | "mariadb";
    tomlPath: string; uriScheme: string;
    tomlBlock: string; uriBlock: string;             // teaching snippets (placeholders only) — see §4
    roles: DbRole[];                                 // DETECTED QA roles (only render what exists)
    revokedColumns: string[];                        // column-level REVOKE list (hashes stay opaque)
    poolerNote: string | null;                       // session-vs-transaction pooler note (null if N/A)
    rlsProbe: string | null;                         // cross-tenant RLS probe instruction (null if no RLS)
  };
  mcp: { agents: AgentKey[]; dbhub: Record<AgentKey, string>; openapi: Record<AgentKey, string>;
         postman: Record<AgentKey, string> };        // playwright driven by CLI, not an MCP record (Q7)
  env: { strategy: "expansion" | "literal"; activation: ("wrapper" | "source-shell" | "direnv" | "auto")[]; slots: string[] };
  demoUsers: { email: string; note: string }[];               // emails only on the page; passwords gated
  playwright: {                                       // §6 fixtures + agentic CLI (Q7)
    loginTestIds: { id: string; purpose: string }[];
    scriptedFixture: string;                          // regression over the DETECTED login flow
    hybridBridge: string | null;                      // UI→API bridge (only when a token path exists)
    cliExample: string;                               // playwright-cli command cookbook
    agenticPrompts: string[];
  };
}

export const qaConfig: QaConfig = {/* DETECTED — filled by the skill */} as QaConfig;
```

> The golden's whole point: reviewers can see at a glance that the page contains **no literal endpoint, host, or token** — only `qaConfig.*` reads. The `apiRequests`, `db.roles`, `db.poolerNote`, and `db.rlsProbe` fields are ALL detection-driven: render only what the project actually exposes, with `null`/empty rendering a gap. The Bunkai-shaped values (signup/signin/tokens, BYPASSRLS roles, Supabase pooler) are EXAMPLES — never bake them into a fresh run.

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

## Golden — `QaShell.tsx` (async SERVER orchestrator)

`QaShell` is an **async Server Component** (no `'use client'`). It runs `prepareQa(config)` once — the single place async Shiki work happens — and threads the prepared html into the (client) `RequestCards`, `AgentCodeBlock`, and `TwoWayTabs`. Interactive leaves (`CopyButton`, `Toc`, tab triggers, the request toggle) carry their own `'use client'`.

```tsx
import { Toc } from "./Toc";
import { ArchDiagram } from "./ArchDiagram";
import { TwoWayTabs } from "./TwoWayTabs";
import { RequestCards } from "./RequestCards";          // §5 default (Q8); AuthMethods is the curl fallback
import { EnvSetup } from "./EnvSetup";
import { CodeBlock } from "./CodeBlock";
import { prepareQa } from "../_lib/prepare";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { KeyRound, ExternalLink, Database, Plug, MousePointerClick, Network } from "lucide-react";
import type { QaConfig } from "../qa-config";

export async function QaShell({ config }: { config: QaConfig }) {
  const t = config.lang === "es" ? es : en;
  const prepared = await prepareQa(config);               // highlight everything once, server-side
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

          {/* §5 API testing — Postman-style request cards (Q8 default) + two ways + docs */}
          <Section id="api" testid="qa-section-api" icon={<Plug className="h-5 w-5" />}
                   title={t.apiTitle} desc={t.apiDesc} accent="violet">
            <RequestCards requests={prepared.requests} />   {/* curl-wall AuthMethods only when Q8=curl-blocks */}
            <TwoWayTabs config={config} domain="api" />
            {config.docs.route && (
              <Button asChild variant="outline" className="mt-4" data-testid="qa-docs-button">
                <a href={config.docs.route} target="_blank" rel="noopener noreferrer">
                  {t.docsCta} ({config.docs.ui ?? "API docs"}) <ExternalLink className="ml-2 h-4 w-4" />
                </a>
              </Button>
            )}
          </Section>

          {/* §6 UI testing — Playwright scripted + agentic (playwright-cli, Q7) */}
          <Section id="ui" testid="qa-section-ui" icon={<MousePointerClick className="h-5 w-5" />}
                   title={t.uiTitle} desc={t.uiDesc} accent="pink">
            {/* (a) scripted: regression over the DETECTED login + the hybrid UI→API bridge when a token path exists */}
            <CodeBlock language="typescript" code={config.playwright.scriptedFixture} title="login.spec.ts" />
            {config.playwright.hybridBridge && (
              <CodeBlock language="typescript" code={config.playwright.hybridBridge} title="auth.fixture.ts" />
            )}
            {/* (b) agentic: the playwright-cli command cookbook (NOT a Playwright MCP block) */}
            <CodeBlock language="bash" code={config.playwright.cliExample} title="playwright-cli" />
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

> `Section` is a tiny local wrapper (Card + accent border + anchor heading + a copy-link button). `TrinityCards` renders the three-card grid from `mcp-and-env-setup.md` §3. The §4 DB section also renders the roles table + REVOKE callout + pooler + RLS-probe callouts (see "DB-roles depth" in `page-structure.md` §4) — all conditional on the detected `config.db.*` fields. `es`/`en` are copy dictionaries (Spanish default).

---

## Server highlight pipeline (`_lib/highlight.ts` + `_lib/prepare.ts`)

The single thing that makes the code blocks read like an IDE instead of a monochrome wall. **HARD RULE: never call the highlighter from a `'use client'` module.** Shiki loads WASM + grammars — it is server-only and expensive. Highlight on the server, pass html strings down. (Gated by Q6; reuse the host's highlighter if one exists. See `SKILL.md` Notes for the one-dependency sanction.)

```ts
// app/qa/_lib/highlight.ts — server-only Shiki bridge.
// Memoized singleton highlighter (createHighlighter loads WASM + grammars — never
// per-call). Dual theme + defaultColor:false → emits CSS variables (--shiki /
// --shiki-dark); the class-based dark flip lives in globals.css: `html.dark .shiki ...`.
import type { Highlighter } from "shiki";
import { createHighlighter } from "shiki";

// Only the langs the QA snippets actually use — keep the grammar set tight.
const LANGS = ["bash", "json", "jsonc", "toml", "typescript"] as const;
const THEMES = ["github-light", "github-dark"] as const;          // any dual light/dark pair

let highlighterPromise: Promise<Highlighter> | null = null;
async function getHighlighter(): Promise<Highlighter> {
  if (!highlighterPromise) {
    highlighterPromise = createHighlighter({ langs: [...LANGS], themes: [...THEMES] });
  }
  return highlighterPromise;                                       // one instance per process
}

const ALIASES: Record<string, string> = { sh: "bash", shell: "bash", zsh: "bash", ts: "typescript", tsx: "typescript" };
function resolveLang(lang: string): string {
  const r = ALIASES[lang.toLowerCase()] ?? lang.toLowerCase();
  return (LANGS as readonly string[]).includes(r) ? r : "bash";
}

/** Highlight `code` → a Shiki `<pre class="shiki">` html string with dual-theme CSS vars.
 *  Server-only — never import this from a 'use client' module. */
export async function highlight(code: string, lang: string): Promise<string> {
  const hl = await getHighlighter();
  return hl.codeToHtml(code, { lang: resolveLang(lang), themes: { light: "github-light", dark: "github-dark" }, defaultColor: false });
}
```

```ts
// app/qa/_lib/prepare.ts — server one-shot. Client components can't import the
// highlighter, so the SERVER pre-highlights everything they need into html-string
// props here. Server components highlight inline via the async <CodeBlock/>.
import type { ApiRequest, QaConfig } from "../qa-config";
import { AGENT_LANGS } from "../_components/CodeBlock";
import { highlight } from "./highlight";

export interface CodeHtml { html: string; code: string; }
export interface AgentBlock { code: string; html: string; language: string; }

async function codeHtml(code: string, lang: string): Promise<CodeHtml> { return { html: await highlight(code, lang), code }; }
async function maybe(code: string | null, lang: string) { return code ? codeHtml(code, lang) : null; }

// { agent → snippet } → { agent → { code, html, language } } the client AgentCodeBlock expects.
async function prepareAgentBlocks(blocks: Record<string, string>, agents: string[]): Promise<Record<string, AgentBlock>> {
  const entries = await Promise.all(agents.map(async (a) => {
    const code = blocks[a] ?? "";
    const language = AGENT_LANGS[a] ?? "json";
    return [a, { code, html: await highlight(code, language), language }] as const;
  }));
  return Object.fromEntries(entries);
}

export interface PreparedRequest extends Omit<ApiRequest, "body" | "response" | "curl"> {
  body: CodeHtml | null; response: CodeHtml | null; curl: CodeHtml;
}
async function prepareRequest(req: ApiRequest): Promise<PreparedRequest> {
  const [body, response, curl] = await Promise.all([maybe(req.body, "json"), maybe(req.response, "json"), codeHtml(req.curl, "bash")]);
  return { ...req, body, response, curl };
}

export async function prepareQa(config: QaConfig) {
  const agents = config.mcp.agents;
  const [dbhub, openapi, postman, tomlBlock, uriBlock, requests] = await Promise.all([
    prepareAgentBlocks(config.mcp.dbhub, agents),
    prepareAgentBlocks(config.mcp.openapi, agents),
    prepareAgentBlocks(config.mcp.postman, agents),
    codeHtml(config.db.tomlBlock, "toml"),
    codeHtml(config.db.uriBlock, "bash"),
    Promise.all(config.api.apiRequests.map(prepareRequest)),
  ]);
  return { mcp: { dbhub, openapi, postman }, db: { tomlBlock, uriBlock }, requests };
}
```

> `QaShell` is an **async Server Component** that calls `await prepareQa(config)` once and threads the prepared html into the client components. See the QaShell golden above (it is async; `'use client'` is gone from the shell).

---

## Golden — `CodeBlock.tsx` (server highlight + two chrome variants)

`CodeBlock` is an **async SERVER component** — it highlights inline. `CodeFrame` is **presentational** (no directive → usable in BOTH server and client trees). `CopyButton` is the **only** `'use client'` leaf.

**Two chrome variants** so the surface matches the content:

| Variant    | For languages                         | Chrome                                            |
| ---------- | ------------------------------------- | ------------------------------------------------- |
| `terminal` | `bash` / `sh` / `shell` / `zsh`       | macOS traffic-light dots + lang label             |
| `editor`   | `ts` / `json` / `jsonc` / `toml` / …  | filename tab + lang label                         |

`variantFor(language)` picks automatically; pass `variant` to override. For agent config blocks, the filename comes from `AGENT_FILES` (claude → `.mcp.json`, opencode → `opencode.jsonc`, codex → `codex.toml`, gemini → `.gemini/settings.json`).

```tsx
// app/qa/_components/CodeBlock.tsx — async SERVER component. NEVER import highlight() from 'use client'.
import type { ReactNode } from "react";
import { highlight } from "../_lib/highlight";
import { CopyButton } from "./CopyButton";

export const AGENT_LABELS: Record<string, string> = { claude: "Claude Code", opencode: "OpenCode", codex: "Codex", gemini: "Gemini" };
export const AGENT_LANGS: Record<string, string> = { claude: "json", opencode: "jsonc", codex: "toml", gemini: "json" };
// Config filename shown in the editor tab per agent — adapt to the agents the project supports.
export const AGENT_FILES: Record<string, string> = { claude: ".mcp.json", opencode: "opencode.jsonc", codex: "codex.toml", gemini: ".gemini/settings.json" };

type Variant = "terminal" | "editor";
function variantFor(language: string): Variant {
  return ["bash", "sh", "shell", "zsh"].includes(language.toLowerCase()) ? "terminal" : "editor";
}

function TrafficLights() {
  return (
    <div className="flex shrink-0 items-center gap-1.5" aria-hidden>
      <span className="h-3 w-3 rounded-full" style={{ background: "#ff5f56" }} />
      <span className="h-3 w-3 rounded-full" style={{ background: "#ffbd2e" }} />
      <span className="h-3 w-3 rounded-full" style={{ background: "#27c93f" }} />
    </div>
  );
}

/** Presentational chrome — no 'use client', renders in server AND client trees.
 *  `html` is a pre-rendered Shiki string; `code` feeds CopyButton. */
export function CodeFrame({ html, code, variant, title, language }: {
  html: string; code: string; variant: Variant; title?: string; language: string;
}) {
  const chrome: ReactNode = variant === "terminal"
    ? (<><TrafficLights /><span className="ml-1 truncate font-mono text-xs uppercase tracking-wider text-muted-foreground">{title ?? language}</span><span className="flex-1" /><CopyButton code={code} /></>)
    : (<><span className="truncate rounded-t border-b-2 border-primary bg-muted px-2.5 py-1 font-mono text-xs">{title ?? `snippet.${language}`}</span><span className="font-mono text-xs uppercase tracking-wider text-muted-foreground">{language}</span><span className="flex-1" /><CopyButton code={code} /></>);
  return (
    <div className="group overflow-hidden rounded-lg border bg-card" data-testid="qa-code-block" data-variant={variant}>
      <div className="flex items-center gap-2 border-b bg-muted/50 px-3 py-2">{chrome}</div>
      <div dangerouslySetInnerHTML={{ __html: html }} />
    </div>
  );
}

/** Async SERVER code block — highlights `code`, frames it as terminal (bash) or editor (else). */
export async function CodeBlock({ code, language = "bash", variant, title }: {
  code: string; language?: string; variant?: Variant; title?: string;
}) {
  const html = await highlight(code, language);
  return <CodeFrame html={html} code={code} variant={variant ?? variantFor(language)} title={title} language={language} />;
}
```

```tsx
// app/qa/_components/CopyButton.tsx — the ONLY interactive leaf of a code block.
"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Check, Copy } from "lucide-react";
export function CopyButton({ code }: { code: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => { void navigator.clipboard.writeText(code); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <Button variant="ghost" size="icon" onClick={copy} aria-label="Copy code"
            className="h-7 w-7 shrink-0" data-testid="qa-copy-code-button">
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-500" /> : <Copy className="h-3.5 w-3.5" />}
    </Button>
  );
}
```

```tsx
// app/qa/_components/AgentCodeBlock.tsx — tabs over PRE-highlighted per-agent blocks.
"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AGENT_FILES, AGENT_LABELS, CodeFrame } from "./CodeBlock";
import type { AgentBlock } from "../_lib/prepare";

// Highlighting happens in the SERVER parent (prepareQa). This client component
// only renders the Tabs shell + the editor-variant CodeFrame around each html string.
export function AgentCodeBlock({ blocks, agents }: { blocks: Record<string, AgentBlock>; agents: string[] }) {
  return (
    <Tabs defaultValue={agents[0]} data-testid="qa-agent-tabs">
      <TabsList className="flex-wrap">
        {agents.map(a => <TabsTrigger key={a} value={a} data-testid={`qa-agent-tab-${a}`}>{AGENT_LABELS[a] ?? a}</TabsTrigger>)}
      </TabsList>
      {agents.map((a) => {
        const b = blocks[a];
        if (!b) return null;
        return (
          <TabsContent key={a} value={a}>
            <CodeFrame html={b.html} code={b.code} variant="editor" title={AGENT_FILES[a] ?? `config.${b.language}`} language={b.language} />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
```

---

## Golden — `RequestCard.tsx` + `RequestCards.tsx` (Postman-style request viewer)

The §5 default (Q8). **REPLACES the curl-wall `AuthMethods`** — a read-only request viewer with a METHOD badge (verb-colored), URL+copy, a Headers table, Body/Response editor panels, and a Visual/curl toggle. Keep the plain-curl `AuthMethods` (below) only as the Q8 fallback. **Detection-driven**: the skill reads the project's REAL auth requests into `apiRequests[]` — `<METHOD> <path>` placeholders, never baked-in signup/signin/token endpoints.

```tsx
// app/qa/_components/RequestCard.tsx
"use client";
import { useState } from "react";
import { Copy } from "lucide-react";
import { CodeFrame } from "./CodeBlock";
import type { HttpMethod } from "../qa-config";

// Verb → accent map (kept literal so Tailwind's JIT preserves the classes).
const METHOD_STYLES: Record<HttpMethod, string> = {
  GET: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30",
  POST: "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
  PUT: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  DELETE: "bg-rose-500/15 text-rose-600 dark:text-rose-400 border-rose-500/30",
};
type CodePayload = { html: string; code: string };

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick}
    className={`rounded px-2.5 py-1 text-xs font-medium ${active ? "bg-background text-foreground shadow" : "text-muted-foreground hover:text-foreground"}`}>{children}</button>;
}
function Panel({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="space-y-1.5"><p className="font-mono text-xs font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>{children}</div>;
}

export function RequestCard({ method, url, description, headers, body, response, curl }: {
  method: HttpMethod; url: string; description?: string;
  headers?: { key: string; value: string }[]; body?: CodePayload | null; response?: CodePayload | null; curl: CodePayload;
}) {
  const [mode, setMode] = useState<"visual" | "curl">("visual");
  const [copied, setCopied] = useState(false);
  const copyUrl = () => { void navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); };
  return (
    <div data-testid="qa-request-card" className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-center gap-2 border-b bg-muted/50 px-3 py-2">
        <span className={`shrink-0 rounded border px-2 py-0.5 font-mono text-xs font-bold uppercase ${METHOD_STYLES[method]}`}>{method}</span>
        <code className="min-w-0 flex-1 truncate font-mono text-xs">{url}</code>
        <button type="button" onClick={copyUrl} aria-label="Copy URL" className="shrink-0 p-1 text-muted-foreground hover:text-foreground">
          <Copy className="h-3.5 w-3.5" />{copied && <span className="sr-only">copied</span>}
        </button>
        <div data-testid="qa-request-toggle" className="flex shrink-0 items-center gap-0.5 rounded border p-0.5">
          <Toggle active={mode === "visual"} onClick={() => setMode("visual")}>Visual</Toggle>
          <Toggle active={mode === "curl"} onClick={() => setMode("curl")}>curl</Toggle>
        </div>
      </div>
      <div className="space-y-3 p-3">
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
        {mode === "visual" ? (
          <>
            {headers && headers.length > 0 && (
              <Panel label="Headers">
                <div className="overflow-x-auto rounded border">
                  <table className="w-full text-left text-xs"><tbody>
                    {headers.map(h => (
                      <tr key={h.key} className="border-b last:border-0">
                        <td className="whitespace-nowrap px-3 py-1.5 font-mono font-medium">{h.key}</td>
                        <td className="break-all px-3 py-1.5 font-mono text-muted-foreground">{h.value}</td>
                      </tr>
                    ))}
                  </tbody></table>
                </div>
              </Panel>
            )}
            {body && <Panel label="Body"><CodeFrame html={body.html} code={body.code} variant="editor" title="request.json" language="json" /></Panel>}
            {response && <Panel label="Response (example)"><CodeFrame html={response.html} code={response.code} variant="editor" title="response.json" language="json" /></Panel>}
          </>
        ) : (
          <CodeFrame html={curl.html} code={curl.code} variant="terminal" title="curl" language="bash" />
        )}
      </div>
    </div>
  );
}
```

```tsx
// app/qa/_components/RequestCards.tsx — tab group over the prepared RequestCards.
"use client";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { RequestCard } from "./RequestCard";
import type { PreparedRequest } from "../_lib/prepare";

export function RequestCards({ requests }: { requests: PreparedRequest[] }) {
  if (!requests.length) return <p className="text-sm text-muted-foreground">No auth requests detected — ask your lead.</p>;
  return (
    <Tabs defaultValue={requests[0].id} data-testid="qa-auth-methods">
      <TabsList className="flex-wrap">
        {requests.map(r => <TabsTrigger key={r.id} value={r.id} data-testid={`qa-auth-tab-${r.id}`}>{r.label}</TabsTrigger>)}
      </TabsList>
      {requests.map(r => (
        <TabsContent key={r.id} value={r.id}>
          <RequestCard method={r.method} url={r.url} description={r.description} headers={r.headers} body={r.body} response={r.response} curl={r.curl} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
```

> `data-testid`s: `qa-request-card`, `qa-request-toggle`, and the tab group reuses `qa-auth-methods` / `qa-auth-tab-<id>` (so it slots in where `AuthMethods` was). The `PreparedRequest` type comes from `_lib/prepare.ts`.

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
        <Badge variant="outline">playwright-cli → UI</Badge>   {/* Q7: CLI binary, not @playwright/mcp */}
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

## Golden — `AuthMethods.tsx` (Q8 fallback), `TwoWayTabs.tsx`, `EnvSetup.tsx`

```tsx
// AuthMethods.tsx — the Q8=curl-blocks FALLBACK (RequestCards is the default).
// One tab per DETECTED method (Supabase token / Bearer / cookie / X-API-Key / custom JWT).
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
// EnvSetup.tsx — .env slots (names only) + the THREE activation paths + the
// CORRECT env verification. Server component (renders <CodeBlock> server-side).
import { Badge } from "@/components/ui/badge";
import { AlertTriangle } from "lucide-react";
import { CodeBlock } from "./CodeBlock";
import type { QaConfig } from "../qa-config";

// <PREFIX> = the project's MCP env prefix (e.g. DBHUB) — DETECTED, never baked in.
const wrapperBlock = `# Wrapper (dotenv-cli, cross-platform) — launches the agent with .env preloaded:
bun run claude       # = dotenv -e .env -- claude
bun run opencode     # = dotenv -e .env -- opencode`;
const sourceShellBlock = `# Source .env into your CURRENT shell — must be SOURCED (a 'bun run' wrapper
# runs in a subshell and won't persist). Mac/Linux/Git Bash:
set -a; source .env; set +a
# then launch bare 'claude' / 'opencode' with the vars already exported.`;
const direnvBlock = `# direnv + .envrc (Mac/Linux) — auto-loads .env on cd into the repo:
direnv allow         # once; every cd then exports .env automatically`;

export function EnvSetup({ config }: { config: QaConfig }) {
  return (
    <div data-testid="qa-env-setup" className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {config.env.slots.map(s => <Badge key={s} variant="secondary" className="font-mono">{s}</Badge>)}
      </div>

      {/* Activation — three paths (render only the ones DETECTED in env.activation) */}
      <div className="space-y-3">
        <p className="text-sm font-semibold">Activate <code>.env</code> before launching the agent — three paths:</p>
        {config.env.activation.includes("wrapper") && <CodeBlock language="bash" code={wrapperBlock} title="wrapper" />}
        {config.env.activation.includes("source-shell") && <CodeBlock language="bash" code={sourceShellBlock} title="source .env (current shell)" />}
        {config.env.activation.includes("direnv") && <CodeBlock language="bash" code={direnvBlock} title="direnv" />}
        {config.env.activation.includes("auto") && (
          <p className="text-sm text-muted-foreground">The runtime auto-loads <code>.env</code> (still export the vars for the MCP launcher).</p>
        )}
      </div>

      {/* The CORRECT env verification — a bare `env | grep` is MISLEADING. */}
      <div className="rounded-lg border-l-4 border-amber-500 bg-amber-50 p-3 text-sm dark:bg-amber-950/30">
        <p className="flex items-center gap-2 font-medium"><AlertTriangle className="h-4 w-4" /> If a var doesn't load</p>
        <p className="mt-1 text-muted-foreground">
          The MCP returns 401/403 (or DBHub: a cryptic auth error because it substitutes the literal <code>{"${VAR}"}</code>).
          Exit the agent, fix <code>.env</code>, re-enter — vars are read once at MCP spawn. A bare
          {" "}<code>env | grep &lt;PREFIX&gt;</code> comes back EMPTY even when correct, because the wrapper
          injects vars into the agent CHILD process, not your parent shell. Verify with the trio:
        </p>
        <ul className="ml-5 mt-1 list-disc text-muted-foreground">
          <li><code>grep &lt;PREFIX&gt; .env</code> — is the var in the file?</li>
          <li><code>dotenv -e .env -- env | grep &lt;PREFIX&gt;</code> — what the MCP actually sees.</li>
          <li><code>set -a; source .env; set +a</code> — load into your current shell to inspect.</li>
        </ul>
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
- Code: `qa-code-block` (carries `data-variant="terminal|editor"`), `qa-copy-code-button`. Agent tabs: `qa-agent-tabs`, `qa-agent-tab-<agent>`.
- Request viewer: `qa-request-card`, `qa-request-toggle`. The §5 tab group reuses `qa-auth-methods` / `qa-auth-tab-<id>` so it drops in where `AuthMethods` was.
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
- [ ] **Highlighter (Q6).** If the host already ships one (Shiki / Prism / highlight.js / `rehype-pretty-code`), adapt the `_lib/highlight.ts` bridge onto it instead of adding Shiki. Shiki is added ONLY when the host has none (the single sanctioned dep — `SKILL.md` Notes). NEVER import `highlight()` from a `'use client'` module — highlight server-side, pass html down. If the framework has no server model, run it at build / in the route loader.
- [ ] **Request viewer (Q8).** `apiRequests[]` is filled from the project's DETECTED auth requests (`<METHOD> <path>` placeholders) — never the example signup/signin/token shapes. Fall back to plain-curl `AuthMethods` only when the host kit can't render tabs/tables.
- [ ] **Agentic UI driver (Q7).** Default `playwright-cli` (binary + skill); ArchDiagram UI badge = "playwright-cli → UI". Use a `@playwright/mcp` block only when detection says so.
- [ ] **DB depth (only what exists).** Render `db.roles` / `db.revokedColumns` / `db.poolerNote` / `db.rlsProbe` only when the project actually has them; `null`/empty → omit the callout, don't fabricate roles or an RLS story.
