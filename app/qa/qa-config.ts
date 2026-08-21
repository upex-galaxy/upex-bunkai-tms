// app/qa/qa-config.ts — the detection → render bridge.
//
// Every value here is produced by /testability-guide Phase-1 detection. The
// page and its _components read ONLY from this object: grep page.tsx and
// _components/ for a literal host / endpoint / project-ref → must be zero.
//
// The ONLY literals allowed in this file are the docs route, the spec route,
// and the credentials-source URL. The DB host / user / project-ref are
// referenced by their `.env` slot NAME (DBHUB_HOST, DBHUB_USER, …) — never the
// literal pooler host or project ref. `null` ⇒ the UI renders an explicit
// "preguntá a tu lead" gap, never a fabricated default.

export type AgentKey = 'claude' | 'opencode' | 'codex' | 'gemini';

export interface AuthMethod {
  id: string
  label: string
  snippet: string
}

export interface ApiEndpoint {
  method: string
  path: string
  purpose: string
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface RequestHeader {
  key: string
  value: string
}

// Structured, Postman-style description of a single API request. Mirrors the
// raw curl snippets — no new endpoints, only placeholders (never a literal
// host/secret). `body`/`response` are JSON strings (highlighted server-side);
// `curl` is the equivalent shell command.
export interface ApiRequest {
  id: string
  label: string
  method: HttpMethod
  url: string
  description?: string
  headers: RequestHeader[]
  body: string | null
  response: string | null
  curl: string
}

export interface DbRole {
  name: string
  access: string
}

export interface QaConfig {
  lang: 'es' | 'en'
  project: {
    name: string
    reposShape: 'mono' | 'poly'
    backendRepo: string | null
    frontendRepo: string | null
  }
  stack: {
    framework: string
    ui: string
    db: string
    orm: string | null
    auth: string[]
  }
  credentialsSource: { label: string, url: string } | null
  docs: {
    ui: 'scalar' | 'redoc' | 'swagger' | null
    route: string | null
    specUrl: string | null
  }
  api: {
    baseUrl: string | null
    loginEndpoint: string | null
    tokenShape: string | null
    loginHelper: string | null
    authMethods: AuthMethod[]
    // Headless onboarding (verification-first, BK-166). signup creates an
    // unconfirmed account (NO session, NO PAT) and triggers an email OTP;
    // confirm verifies the code and mints the session + PAT. signin reuses an
    // existing email+password account and mints a fresh PAT.
    signupEndpoint: string | null
    signinEndpoint: string | null
    // Hybrid path: reuse a browser cookie session to mint a PAT via the API.
    tokensEndpoint: string | null
    cookieMintSnippet: string | null
    patScopes: { scope: string, purpose: string }[]
    endpoints: ApiEndpoint[]
    // Postman-style structured view of the auth requests (restructure of the
    // curl snippets above — same info, no new endpoints, placeholders only).
    apiRequests: ApiRequest[]
  }
  db: {
    engine: 'postgres' | 'sqlserver' | 'mysql' | 'sqlite' | 'mariadb'
    tomlPath: string
    uriScheme: string
    // Teaching snippets for the DBHub `[[sources]]` block vs a raw SQL-extension
    // URI (placeholders only — every value is a .env slot NAME, never a literal).
    tomlBlock: string
    uriBlock: string
    // QA roles + isolation invariant — all referenced by .env slot name only.
    roles: DbRole[]
    revokedColumns: string[]
    poolerNote: string
    rlsProbe: string
  }
  mcp: {
    agents: AgentKey[]
    dbhub: Record<string, string>
    openapi: Record<string, string>
    postman: Record<string, string>
  }
  env: {
    strategy: 'expansion' | 'literal'
    activation: ('wrapper' | 'direnv' | 'auto')[]
    slots: string[]
  }
  demoUsers: { email: string, note: string }[]
  // §6 Playwright fixtures (scripted regression + hybrid UI→API bridge).
  playwright: {
    loginTestIds: { id: string, purpose: string }[]
    scriptedFixture: string
    hybridBridge: string
    cliExample: string
    agenticPrompts: string[]
  }
}

// ---------------------------------------------------------------------------
// MCP config blocks — reproduced verbatim from the committed .mcp.json (Claude)
// and opencode.jsonc (OpenCode). No secrets: every placeholder expands from
// .env at MCP spawn time. Claude uses ${VAR}; OpenCode uses {env:VAR}.
// ---------------------------------------------------------------------------

const dbhubClaude = `// Claude Code → .mcp.json
"dbhub": {
  "command": "bunx",
  "args": ["-y", "@bytebase/dbhub@latest", "--config", "dbhub.toml"]
}`;

const dbhubOpencode = `// OpenCode → opencode.jsonc
"dbhub": {
  "type": "local",
  "command": ["bunx", "-y", "@bytebase/dbhub@latest", "--config", "dbhub.toml"],
  "enabled": true
}`;

const openapiClaude = `// Claude Code → .mcp.json   (--tools dynamic es OBLIGATORIO; sin él da 400)
"openapi": {
  "command": "bunx",
  "args": ["-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
  "env": {
    "API_BASE_URL": "\${API_BASE_URL}",
    "OPENAPI_SPEC_PATH": "\${OPENAPI_SPEC_PATH}",
    "API_HEADERS": "Authorization:Bearer \${API_TOKEN}"
  }
}`;

const openapiOpencode = `// OpenCode → opencode.jsonc   (env key = "environment", sintaxis {env:VAR})
"openapi": {
  "type": "local",
  "command": ["bunx", "-y", "@ivotoby/openapi-mcp-server", "--tools", "dynamic"],
  "environment": {
    "API_BASE_URL": "{env:API_BASE_URL}",
    "OPENAPI_SPEC_PATH": "{env:OPENAPI_SPEC_PATH}",
    "API_HEADERS": "Authorization:Bearer {env:API_TOKEN}"
  },
  "enabled": true
}`;

const postmanClaude = `// Claude Code → .mcp.json
"postman": {
  "type": "http",
  "url": "https://mcp.postman.com/mcp",
  "headers": { "Authorization": "Bearer \${POSTMAN_API_KEY}" }
}`;

const postmanOpencode = `// OpenCode → opencode.jsonc
"postman": {
  "type": "remote",
  "url": "https://mcp.postman.com/mcp",
  "headers": { "Authorization": "Bearer {env:POSTMAN_API_KEY}" },
  "enabled": true
}`;

// Agentic UI driving uses the playwright-cli binary (NOT the Playwright MCP).
// The /playwright-cli skill auto-loads when the agent runs `playwright-cli`.
const playwrightCli = `# 1. Instalá el CLI (una vez) + los browsers
npm i -g @playwright/cli@latest    # o usá: npx playwright-cli <cmd>
bunx playwright install            # chromium / firefox / webkit

# 2. La skill /playwright-cli se auto-carga al detectar llamadas a 'playwright-cli'.
# 3. El agente maneja el browser por comandos directos:
playwright-cli open http://localhost:3000/login
playwright-cli snapshot                              # árbol con refs (e1, e2, ...)
playwright-cli fill e5 "qa.bot@bunkai-test.dev" --submit
playwright-cli click e7
playwright-cli screenshot --filename=login.png
playwright-cli close`;

// ---------------------------------------------------------------------------
// §5 auth-method snippets. Hosts/endpoints come from the slots below; the
// curl examples use API_BASE_URL (relative /api/v1) — never a literal host.
// ---------------------------------------------------------------------------

const cookieSnippet = `# Cookie de sesión (browser) — la obtenés logueándote por la UI de /login.
# Flujo primario: email + password (con OTP por mail en alta de cuenta). El
# navegador guarda la cookie de sesión:
#   sb-<project-ref>-auth-token   (<project-ref> sale del .env, nunca acá)
# Reusá esa cookie desde curl para llamar la API como ese usuario:
curl '<API_BASE_URL>/me' \\
  --cookie 'sb-<project-ref>-auth-token=<valor-de-DevTools>'
# → la respuesta trae auth.source = "cookie"`;

const bearerSnippet = `# Bearer PAT (headless) — sin navegador, ideal para CLI / CI / agentes.
# El token tiene forma bk_pat_<prefix>.<secret> y va en cada request:
curl '<API_BASE_URL>/me' \\
  -H 'Authorization: Bearer bk_pat_<prefix>.<secret>'
# → auth.source = "bearer", auth.scopes = [...]
# COEXISTENCIA (ADR-0001 / ADR-0007): la cookie del browser y el Bearer PAT de
# la MISMA cuenta conviven independientes — ninguno revoca al otro. Podés tener
# sesión por UI y PAT por API al mismo tiempo, ambos válidos (resolveIdentity).
# Endpoints que ya aceptan Bearer: GET /me, GET /workspaces (se suman más por sprint).`;

const signinSnippet = `# Onboarding headless (verification-first, BK-166) — signup → confirm → signin.
# El alta NO loguea a nadie: signup crea la cuenta SIN confirmar y dispara un
# OTP por mail. Recién /auth/confirm verifica el código y mintea sesión + PAT.

# 1) Crear la cuenta (una vez por entorno) — password vive en el Epic, no acá:
curl -X POST '<API_BASE_URL>/auth/signup' \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "<see credentials source>",
    "password": "<see credentials source>"
  }'
# 202 Accepted → { status: "pending_confirmation", email }   (SIN session, SIN PAT)
# Llega un código de 6-8 dígitos por mail (Resend, no-reply@mail.upexgalaxy.com).
# 409 → el user ya existe; saltá al signin.

# 2) Confirmar el OTP → mintea sesión + PAT (misma forma que signin):
curl -X POST '<API_BASE_URL>/auth/confirm' \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "<see credentials source>",
    "token": "<código de 6-8 dígitos del mail>",
    "pat_name": "qa-bot-primary",
    "pat_expires_in_days": 7
  }'
# 200 OK → { user, session, pat:{ token:"bk_pat_<prefix>.<secret>", scopes, expires_at }, warning }
#   El campo pat.token se muestra UNA sola vez — guardalo.

# 3) Signin para mintear un PAT fresco (cada corrida de CI / sesión de test):
curl -X POST '<API_BASE_URL>/auth/signin' \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "<see credentials source>",
    "password": "<see credentials source>",
    "pat_name": "ci-run",
    "pat_expires_in_days": 7
  }'
# 200 OK → misma forma que confirm.
# 401 → credenciales mal (o cuenta sin confirmar — usá /auth/confirm primero).

# Scopes por defecto (least-privilege): atc:read, atc:write, run:execute.
# workspace:admin NO es default y NO se puede pedir acá (ADR-0005) — se mintea
# vía POST /api/v1/tokens con un workspace_id donde seas admin/owner.`;

const cookieMintSnippet = `# UI → API BRIDGE (hybrid): ya logueado en el navegador (email+password o
# magic-link), reusá la cookie de sesión para mintear un PAT sin re-autenticar.
# La cookie y el PAT conviven independientes (ADR-0001) — el mint NO toca la sesión.
# 1) Logueate normal en /login.
# 2) Copiá la cookie sb-<project-ref>-auth-token (DevTools → Application → Cookies),
#    o pasá la sesión directo con --cookie.
# 3) Minteá un PAT atado a esa sesión:
curl -X POST '<API_BASE_URL>/tokens' \\
  -H 'content-type: application/json' \\
  --cookie 'sb-<project-ref>-auth-token=<valor>' \\
  -d '{ "name": "browser-hybrid", "scopes": ["atc:read","atc:write"] }'
# 201 Created → { id, token:"bk_pat_<prefix>.<secret>", scopes, warning }
#   token se muestra UNA vez. Listar: GET /tokens. Revocar: DELETE /tokens/{id}.
# 4) Usá el Bearer para los tests de API. Cookie de UI + Bearer de API = ambos
#    válidos a la vez para la misma cuenta, sin que uno revoque al otro.`;

// ---------------------------------------------------------------------------
// §6 Playwright — scripted regression drives the email-first password UI (the
// primary login flow, BK-166): one email field → Continue → password step →
// signed in. The UI→API bridge is the hybrid cookie→PAT path (headline of §6).
// ---------------------------------------------------------------------------

const scriptedFixture = `import { expect, test } from '@playwright/test';

// Regresión de UI sobre el login email-first con password (flujo primario, BK-166).
// Un solo campo de email → Continue → check-email enruta → step de password → adentro.
// (Cuenta nueva: el step "create" pide setear password y un OTP de 6-8 dígitos.)
test('login email-first: email → password → entra a la app', async ({ page }) => {
  await page.goto('/login');

  // Selectores reales del login (ver tabla de data-testids abajo).
  await page.getByTestId('login-email').fill('qa.bot@bunkai-test.dev');
  await page.getByTestId('login-continue').click();

  // check-email detectó cuenta existente + confirmada → step de password.
  await page.getByTestId('login-password').fill('<see credentials source>');
  await page.getByTestId('login-signin').click();

  // Sesión establecida (cookie) → la app redirige fuera de /login.
  await expect(page).not.toHaveURL(/\\/login/);
});`;

const hybridBridge = `import { expect, request, test } from '@playwright/test';

// UI → API BRIDGE (el puente entre testing de UI y de API).
// El login establece una cookie de sesión (email+password o magic-link). El
// puente HÍBRIDO reusa esa cookie para mintear un PAT vía POST /api/v1/tokens,
// y después testeás la API con Bearer. La cookie y el PAT conviven independientes
// (ADR-0001): mintear el PAT no toca la sesión del browser.

// Fixture reutilizable: dado un browser ya logueado (storageState con la cookie
// sb-<project-ref>-auth-token), mintea un PAT y expone un cliente API con Bearer.
type AuthFixtures = { authToken: string; authApi: Awaited<ReturnType<typeof request.newContext>> };

export const authedTest = test.extend<AuthFixtures>({
  authToken: async ({ context }, use) => {
    // El context trae la cookie de sesión (storageState del paso de magic-link).
    const cookieApi = await request.newContext({ storageState: await context.storageState() });
    const res = await cookieApi.post('/api/v1/tokens', {
      data: { name: 'pw-hybrid', scopes: ['atc:read', 'atc:write'] },
    });
    expect(res.ok()).toBeTruthy();
    const { token } = (await res.json()) as { token: string };
    await use(token); // bk_pat_<prefix>.<secret> — se muestra una vez
    await cookieApi.dispose();
  },
  authApi: async ({ authToken }, use) => {
    const api = await request.newContext({
      extraHTTPHeaders: { Authorization: \`Bearer \${authToken}\` },
    });
    await use(api);
    await api.dispose();
  },
});

authedTest('el PAt minteado desde la sesión sirve la API', async ({ authApi }) => {
  const me = await authApi.get('/api/v1/me');
  expect(me.ok()).toBeTruthy();
  expect((await me.json()).auth.source).toBe('bearer');
});`;

// ---------------------------------------------------------------------------
// §4 DB snippets — DBHub `[[sources]]` (split fields, \${VAR} expansion) vs a
// raw SQL-extension URI. `\${...}` is LITERAL teaching text, never evaluated.
// IMPORTANT (teaching note): DBHub does NOT accept a DSN / connection string —
// only the split `[[sources]]` fields. The URI form is ONLY for a VSCode/Cursor
// SQL extension.
// ---------------------------------------------------------------------------

const dbTomlBlock = `# dbhub.toml — committed, \${VAR} expansion, sin secretos.
# DBHub SOLO acepta estos campos separados — NO un DSN / connection string.
[[sources]]
id = "primary"
type = "\${DBHUB_TYPE}"        # postgres
host = "\${DBHUB_HOST}"
port = "\${DBHUB_PORT}"        # 5432 (Session Pooler)
database = "\${DBHUB_DATABASE}"
user = "\${DBHUB_USER}"        # <DBHUB_USER>.<project-ref> en el pooler
password = "\${DBHUB_PASSWORD}"
sslmode = "require"`;

const dbUriBlock = `# Connection string CRUDA para una extensión SQL de VSCode/Cursor.
# Esto SOLO sirve para clientes SQL — DBHub NO lo acepta (usá el [[sources]] de arriba).
# Session Pooler, puerto 5432, IPv4-friendly. Host/user/ref viven en el .env.
postgresql://<DBHUB_USER>.<project-ref>:<DBHUB_PASSWORD>@<DBHUB_HOST>:5432/<DBHUB_DATABASE>?sslmode=require

# Ejemplos de queries (mismas credenciales read-only de QA):
#   "Mostrame todas las tablas"
#   "Contá las tasks del usuario <email>"`;

// ---------------------------------------------------------------------------
// §5 structured API requests — a Postman-style restructure of the curl
// snippets above. Same endpoints, same shapes, placeholders only. The
// RequestCard renders these; the `curl` field is the toggle's raw view.
// ---------------------------------------------------------------------------

const apiRequests: ApiRequest[] = [
  {
    id: 'cookie-me',
    label: 'GET /me (cookie)',
    method: 'GET',
    url: '<API_BASE_URL>/me',
    description:
      'Cookie de sesión (browser). Logueate en /login (email+password, flujo primario), '
      + 'el navegador guarda sb-<project-ref>-auth-token y reusás esa cookie desde curl. '
      + 'La respuesta trae auth.source = "cookie". La cookie convive con un Bearer PAT de '
      + 'la misma cuenta sin que uno revoque al otro (ADR-0001).',
    headers: [
      { key: 'Cookie', value: 'sb-<project-ref>-auth-token=<valor-de-DevTools>' },
    ],
    body: null,
    response: `{
  "auth": { "source": "cookie" },
  "user": { "id": "<uuid>", "email": "<email>" },
  "workspaces": [ /* ... */ ]
}`,
    curl: `curl '<API_BASE_URL>/me' \\
  --cookie 'sb-<project-ref>-auth-token=<valor-de-DevTools>'
# → la respuesta trae auth.source = "cookie"`,
  },
  {
    id: 'bearer-me',
    label: 'GET /me (Bearer PAT)',
    method: 'GET',
    url: '<API_BASE_URL>/me',
    description:
      'Bearer PAT (headless) — sin navegador, ideal para CLI / CI / agentes. El token '
      + 'tiene forma bk_pat_<prefix>.<secret> y va en cada request. Convive con la cookie '
      + 'de sesión de la misma cuenta — ninguno revoca al otro (ADR-0001 / ADR-0007). '
      + 'Endpoints que ya aceptan Bearer: GET /me, GET /workspaces (se suman más por sprint).',
    headers: [
      { key: 'Authorization', value: 'Bearer bk_pat_<prefix>.<secret>' },
    ],
    body: null,
    response: `{
  "auth": { "source": "bearer", "scopes": ["atc:read", "atc:write"] },
  "user": { "id": "<uuid>", "email": "<email>" }
}`,
    curl: `curl '<API_BASE_URL>/me' \\
  -H 'Authorization: Bearer bk_pat_<prefix>.<secret>'
# → auth.source = "bearer", auth.scopes = [...]`,
  },
  {
    id: 'signup',
    label: 'POST /auth/signup',
    method: 'POST',
    url: '<API_BASE_URL>/auth/signup',
    description:
      'Crear cuenta (verification-first, BK-166). NO loguea ni mintea PAT: crea la cuenta '
      + 'SIN confirmar y dispara un OTP de 6-8 dígitos por mail (Resend). El password (min 8) '
      + 'vive en el Epic, no acá. 202 Accepted → seguí con /auth/confirm. 409 → el user ya '
      + 'existe; saltá al signin.',
    headers: [
      { key: 'content-type', value: 'application/json' },
    ],
    body: `{
  "email": "<see credentials source>",
  "password": "<see credentials source>"
}`,
    response: `{
  "status": "pending_confirmation",
  "email": "<email>"
}`,
    curl: `curl -X POST '<API_BASE_URL>/auth/signup' \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "<see credentials source>",
    "password": "<see credentials source>"
  }'
# 202 Accepted → { status: "pending_confirmation", email }   (SIN session, SIN PAT)
# Llega un OTP de 6-8 dígitos por mail → confirmá con POST /auth/confirm.
# 409 → el user ya existe; saltá al signin.`,
  },
  {
    id: 'confirm',
    label: 'POST /auth/confirm',
    method: 'POST',
    url: '<API_BASE_URL>/auth/confirm',
    description:
      'Verificar el OTP del signup → establece la sesión (cookie) y mintea un PAT en la '
      + 'misma llamada. token = código de 6-8 dígitos del mail. Scopes por defecto '
      + '(least-privilege): atc:read, atc:write, run:execute. workspace:admin se rechaza acá '
      + '(ADR-0005). 200 OK → pat.token se muestra UNA sola vez. 401 → código inválido o vencido.',
    headers: [
      { key: 'content-type', value: 'application/json' },
    ],
    body: `{
  "email": "<see credentials source>",
  "token": "<6-8 dígitos del mail>",
  "pat_name": "qa-bot-primary",
  "pat_expires_in_days": 7
}`,
    response: `{
  "user": { "id": "<uuid>", "email": "<email>" },
  "session": { "access_token": "<jwt>", "refresh_token": "<token>", "expires_at": 0, "token_type": "bearer" },
  "pat": {
    "token": "bk_pat_<prefix>.<secret>",
    "id": "<uuid>",
    "name": "qa-bot-primary",
    "scopes": ["atc:read", "atc:write", "run:execute"],
    "expires_at": "<iso-8601>"
  },
  "warning": "Store the PAT token now — it cannot be retrieved later."
}`,
    curl: `curl -X POST '<API_BASE_URL>/auth/confirm' \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "<see credentials source>",
    "token": "<6-8 dígitos del mail>",
    "pat_name": "qa-bot-primary",
    "pat_expires_in_days": 7
  }'
# 200 OK → { user, session, pat:{ token, scopes, expires_at }, warning }
# El campo pat.token se muestra UNA sola vez — guardalo.
# 401 → código inválido o vencido.`,
  },
  {
    id: 'signin',
    label: 'POST /auth/signin',
    method: 'POST',
    url: '<API_BASE_URL>/auth/signin',
    description:
      'Login email+password de una cuenta ya confirmada → mintea un PAT fresco (cada corrida '
      + 'de CI / sesión de test). Scopes por defecto: atc:read, atc:write, run:execute '
      + '(workspace:admin NO se mintea acá, ADR-0005). 200 OK → misma forma que confirm. '
      + '401 → credenciales mal o cuenta sin confirmar (usá /auth/confirm primero).',
    headers: [
      { key: 'content-type', value: 'application/json' },
    ],
    body: `{
  "email": "<see credentials source>",
  "password": "<see credentials source>",
  "pat_name": "ci-run",
  "pat_expires_in_days": 7
}`,
    response: `{
  "user": { "id": "<uuid>", "email": "<email>" },
  "session": { "access_token": "<jwt>", "refresh_token": "<token>", "expires_at": 0, "token_type": "bearer" },
  "pat": {
    "token": "bk_pat_<prefix>.<secret>",
    "id": "<uuid>",
    "name": "ci-run",
    "scopes": ["atc:read", "atc:write", "run:execute"],
    "expires_at": "<iso-8601>"
  },
  "warning": "Store the PAT token now — it cannot be retrieved later."
}`,
    curl: `curl -X POST '<API_BASE_URL>/auth/signin' \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "<see credentials source>",
    "password": "<see credentials source>",
    "pat_name": "ci-run",
    "pat_expires_in_days": 7
  }'
# 200 OK → misma forma que confirm.
# 401 → credenciales mal o cuenta sin confirmar (usá /auth/confirm primero).`,
  },
  {
    id: 'tokens-mint',
    label: 'POST /tokens (hybrid)',
    method: 'POST',
    url: '<API_BASE_URL>/tokens',
    description:
      'UI → API BRIDGE (hybrid): ya logueado en el navegador (email+password o magic-link), '
      + 'reusá la cookie de sesión para mintear un PAT sin re-autenticar — el mint NO toca la '
      + 'sesión (ADR-0001). 201 Created → token se muestra UNA vez. Listar: GET /tokens. '
      + 'Revocar: DELETE /tokens/{id}. Cookie + Bearer válidos a la vez para la misma cuenta.',
    headers: [
      { key: 'content-type', value: 'application/json' },
      { key: 'Cookie', value: 'sb-<project-ref>-auth-token=<valor>' },
    ],
    body: `{
  "name": "browser-hybrid",
  "scopes": ["atc:read", "atc:write"]
}`,
    response: `{
  "id": "<uuid>",
  "token": "bk_pat_<prefix>.<secret>",
  "scopes": ["atc:read", "atc:write"],
  "warning": "token se muestra UNA vez"
}`,
    curl: `curl -X POST '<API_BASE_URL>/tokens' \\
  -H 'content-type: application/json' \\
  --cookie 'sb-<project-ref>-auth-token=<valor>' \\
  -d '{ "name": "browser-hybrid", "scopes": ["atc:read","atc:write"] }'
# 201 Created → { id, token:"bk_pat_<prefix>.<secret>", scopes, warning }
# token se muestra UNA vez. Listar: GET /tokens. Revocar: DELETE /tokens/{id}.`,
  },
];

// ---------------------------------------------------------------------------

export const qaConfig: QaConfig = {
  lang: 'es',
  project: {
    name: 'Bunkai',
    reposShape: 'mono',
    backendRepo: 'https://github.com/upex-galaxy/upex-bunkai-tms',
    frontendRepo: 'https://github.com/upex-galaxy/upex-bunkai-tms',
  },
  stack: {
    framework: 'Next.js 15 (App Router)',
    ui: 'shadcn/ui + Tailwind',
    db: 'Supabase (PostgreSQL 17)',
    orm: null,
    auth: ['Email + password (primary)', 'Magic link (secondary)', 'Supabase cookie', 'Bearer PAT'],
  },
  credentialsSource: {
    label: 'Jira Epic',
    url: 'https://jira.upexgalaxy.com/browse/BK-29',
  },
  docs: {
    ui: 'scalar',
    route: '/api/docs',
    specUrl: '/api/openapi',
  },
  api: {
    baseUrl: '/api/v1',
    loginEndpoint: '/api/v1/auth/signin',
    tokenShape: '{ user, session, pat: { token: \'bk_pat_<prefix>.<secret>\', scopes, expires_at }, warning }',
    loginHelper: null,
    signupEndpoint: '/api/v1/auth/signup',
    signinEndpoint: '/api/v1/auth/signin',
    tokensEndpoint: '/api/v1/tokens',
    cookieMintSnippet,
    authMethods: [
      { id: 'cookie', label: 'Cookie (browser)', snippet: cookieSnippet },
      { id: 'bearer', label: 'Bearer PAT (headless)', snippet: bearerSnippet },
      { id: 'signin', label: 'Signup / Signin (mint PAT)', snippet: signinSnippet },
    ],
    apiRequests,
    patScopes: [
      { scope: 'atc:read', purpose: 'Leer ATCs, steps, assertions, modules, user stories, AC — y, desde BK-499, TODA lectura de datos compartidos del workspace: reportes (coverage, traceability, runs report, heatmap, recovery cycles), bugs, runs, tests, activity y workspaces. NO cubre la bandeja personal (notificaciones, preferencias, /me), que no pide scope. (DEFAULT)' },
      { scope: 'atc:write', purpose: 'Crear / actualizar / borrar ATCs — y, desde BK-499, crear projects dentro de un workspace existente. (DEFAULT)' },
      { scope: 'run:execute', purpose: 'Iniciar runs + postear resultados de steps (Sprint 2). (DEFAULT)' },
      { scope: 'workspace:admin', purpose: 'Gestionar members, invites, metadata del workspace. NO es default — signin/confirm lo rechazan (ADR-0005); se mintea sólo vía POST /tokens con un workspace_id donde seas admin/owner.' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/v1/me', purpose: 'Identidad + lista de workspaces + workspace activo. Acepta cookie y Bearer.' },
      { method: 'GET', path: '/api/v1/workspaces', purpose: 'Workspaces a los que pertenece el caller. Acepta cookie y Bearer.' },
      { method: 'POST', path: '/api/v1/auth/check-email', purpose: 'Routing email-first → { exists, confirmed }. Decide password vs create.' },
      { method: 'POST', path: '/api/v1/auth/signup', purpose: 'Crea cuenta SIN confirmar + dispara OTP por mail → 202. Sin session ni PAT.' },
      { method: 'POST', path: '/api/v1/auth/confirm', purpose: 'Verifica el OTP del signup → session + PAT fresco.' },
      { method: 'POST', path: '/api/v1/auth/signin', purpose: 'Login email+password (cuenta confirmada) → session + PAT fresco.' },
      { method: 'POST', path: '/api/v1/auth/magic-link', purpose: 'Dispara el mail de magic-link (login secundario "email me a link").' },
      { method: 'POST', path: '/api/v1/tokens', purpose: 'Mintea un PAT (cookie o Bearer). Token visible una sola vez.' },
      { method: 'GET', path: '/api/v1/tokens', purpose: 'Lista PATs (sin secretos).' },
      { method: 'DELETE', path: '/api/v1/tokens/{id}', purpose: 'Revoca un PAT — no hay recuperación.' },
      { method: 'GET', path: '/api/v1/workspaces/{id}/invites', purpose: 'Invites del workspace (admin/owner).' },
      { method: 'POST', path: '/api/v1/invites/accept', purpose: 'Acepta una invitación por token.' },
      { method: 'PUT', path: '/api/v1/me/active-workspace', purpose: 'Cambia el workspace activo del usuario.' },
      { method: 'GET', path: '/api/v1/health', purpose: 'Liveness probe.' },
      { method: 'GET', path: '/api/openapi', purpose: 'Spec OpenAPI (JSON).' },
      { method: 'GET', path: '/api/docs', purpose: 'Docs interactivas (Scalar UI).' },
    ],
  },
  db: {
    engine: 'postgres',
    tomlPath: 'dbhub.toml',
    uriScheme: 'postgresql',
    tomlBlock: dbTomlBlock,
    uriBlock: dbUriBlock,
    roles: [
      { name: 'qa_inspector_ro', access: 'Solo lectura (SELECT en public.*). BYPASSRLS.' },
      { name: 'qa_inspector_rw', access: 'Lectura + escritura (SELECT/INSERT/UPDATE/DELETE en public.*). BYPASSRLS.' },
    ],
    revokedColumns: ['access_tokens.hash', 'workspace_invites.token_hash', 'magic_link_tokens.token_hash'],
    poolerNote: 'Conectá por el Session Pooler en el puerto 5432 (transacciones largas OK). NO uses el 6543 (transaction pooler, sin prepared statements). El usuario del pooler es punteado: <DBHUB_USER>.<project-ref> — host, user y ref viven en el .env (DBHUB_HOST, DBHUB_USER), nunca en esta página.',
    rlsProbe: 'Sonda cross-tenant: logueate como usuario B e intentá SELECT en projects con un workspace_id del usuario A → esperá 0 filas. RLS está activo en cada tabla; auth.uid() maneja la membresía vía la familia bunkai_is_workspace_member.',
  },
  mcp: {
    agents: ['claude', 'opencode'],
    dbhub: { claude: dbhubClaude, opencode: dbhubOpencode },
    openapi: { claude: openapiClaude, opencode: openapiOpencode },
    postman: { claude: postmanClaude, opencode: postmanOpencode },
  },
  env: {
    strategy: 'expansion',
    activation: ['wrapper', 'direnv'],
    slots: [
      'DBHUB_TYPE',
      'DBHUB_HOST',
      'DBHUB_PORT',
      'DBHUB_DATABASE',
      'DBHUB_USER',
      'DBHUB_PASSWORD',
      'API_BASE_URL',
      'OPENAPI_SPEC_PATH',
      'API_TOKEN',
      'POSTMAN_API_KEY',
    ],
  },
  demoUsers: [
    {
      email: 'qa.bot@bunkai-test.dev',
      note: 'QA bot headless — alta vía POST /auth/signup → /auth/confirm (OTP); passwords en el Epic BK-29.',
    },
  ],
  playwright: {
    loginTestIds: [
      { id: 'login-email', purpose: 'Input de email (paso único email-first).' },
      { id: 'login-continue', purpose: 'Botón "Continue" — dispara check-email y enruta.' },
      { id: 'login-password', purpose: 'Input de password (steps de signin y create).' },
      { id: 'login-signin', purpose: 'Botón de login para cuenta existente (email+password).' },
      { id: 'login-create', purpose: 'Botón de alta para email nuevo (setea password).' },
      { id: 'login-otp', purpose: 'Input del código OTP de 6-8 dígitos (step verify).' },
      { id: 'login-verify', purpose: 'Botón "Verify" — confirma el OTP.' },
      { id: 'login-resend', purpose: 'Reenvía el código OTP.' },
      { id: 'login-magic-link-toggle', purpose: 'Toggle al login secundario por magic-link.' },
    ],
    scriptedFixture,
    hybridBridge,
    cliExample: playwrightCli,
    agenticPrompts: [
      'abrí /login, escribí qa.bot@bunkai-test.dev, dale Continue y sacá un screenshot del step de password',
      'listá todos los empty states de la home',
      'reportá un bug si algún texto visible desborda su contenedor',
    ],
  },
};
