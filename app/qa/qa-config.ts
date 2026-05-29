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
    // Headless PAT bootstrap (signup / signin) — magic-link users have no
    // password, so the signup endpoint provisions a password + mints a PAT.
    signupEndpoint: string | null
    signinEndpoint: string | null
    // Hybrid path: reuse a browser cookie session to mint a PAT via the API.
    tokensEndpoint: string | null
    cookieMintSnippet: string | null
    patScopes: { scope: string, purpose: string }[]
    endpoints: ApiEndpoint[]
  }
  db: {
    engine: 'postgres' | 'sqlserver' | 'mysql' | 'sqlite' | 'mariadb'
    tomlPath: string
    uriScheme: string
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
    playwright: Record<string, string>
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

const playwrightClaude = `// Claude Code → .mcp.json
"playwright": {
  "command": "bunx",
  "args": [
    "@playwright/mcp@latest",
    "--caps", "vision,pdf,testing,tracing,tabs",
    "--timeout-action", "10000",
    "--timeout-navigation", "30000",
    "--viewport-size", "1920x1080"
  ]
}`;

const playwrightOpencode = `// OpenCode → opencode.jsonc
"playwright": {
  "type": "local",
  "command": [
    "bunx",
    "@playwright/mcp@latest",
    "--caps", "vision,pdf,testing,tracing,tabs",
    "--timeout-action", "10000",
    "--timeout-navigation", "30000",
    "--viewport-size", "1920x1080"
  ],
  "enabled": true
}`;

// ---------------------------------------------------------------------------
// §5 auth-method snippets. Hosts/endpoints come from the slots below; the
// curl examples use API_BASE_URL (relative /api/v1) — never a literal host.
// ---------------------------------------------------------------------------

const cookieSnippet = `# Cookie de sesión (browser) — magic-link es PASSWORDLESS.
# Logueate en /login, recibís el link por mail, y el navegador guarda la cookie:
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
# Endpoints que ya aceptan Bearer: GET /me, GET /workspaces (se suman más por sprint).`;

const signinSnippet = `# Signup / Signin (mint PAT) — el bootstrap headless.
# Los usuarios de magic-link NO tienen password, así que se provisiona uno
# dedicado de QA vía /auth/signup (one-time), y después se mintea un PAT fresco
# en cada corrida vía /auth/signin.

# 1) Provisionar QA bot (una vez por entorno) — password vive en el Epic, no acá:
curl -X POST '<API_BASE_URL>/auth/signup' \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "<see credentials source>",
    "password": "<see credentials source>",
    "pat_name": "qa-bot-primary",
    "pat_scopes": ["atc:read","atc:write","run:execute","workspace:admin"]
  }'
# 201 Created → { user, session, pat:{ token:"bk_pat_<prefix>.<secret>", scopes, expires_at } }
#   El campo pat.token se muestra UNA sola vez — guardalo.
# 409 → el user ya existe; saltá al signin.

# 2) Signin para mintear un PAT fresco (cada corrida de CI / sesión de test):
curl -X POST '<API_BASE_URL>/auth/signin' \\
  -H 'content-type: application/json' \\
  -d '{
    "email": "<see credentials source>",
    "password": "<see credentials source>",
    "pat_name": "ci-run",
    "pat_expires_in_days": 7
  }'
# 200 OK → misma forma que el signup.
# 401 → credenciales mal (o usuario solo-magic-link sin password).`;

const cookieMintSnippet = `# UI → API BRIDGE (hybrid): ya logueado en el navegador vía magic-link,
# reusá la cookie de sesión para mintear un PAT sin re-autenticar.
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
# 4) Usá el Bearer para los tests de API. Este es el camino correcto también
#    para usuarios de producción (solo magic-link) que automatizan Bunkai.`;

// ---------------------------------------------------------------------------
// §6 Playwright — scripted regression drives the magic-link UI (passwordless:
// assert the "magic link sent" state, do NOT pretend to intercept a token).
// The UI→API bridge is the hybrid cookie→PAT path (headline of §6).
// ---------------------------------------------------------------------------

const scriptedFixture = `import { expect, test } from '@playwright/test';

// Regresión de UI sobre el login passwordless (magic-link).
// No interceptamos token: magic-link NO devuelve uno de forma síncrona.
// Validamos el flujo visible — el mail con el link queda fuera del scope del browser.
test('magic-link UI: envía el link y muestra el estado de confirmación', async ({ page }) => {
  await page.goto('/login');

  // Selectores reales del login (ver tabla de data-testids abajo).
  await page.getByTestId('login-email').fill('qa.bot@bunkai-test.dev');
  await page.getByTestId('login-submit').click();

  // El form pasa a "Check your inbox" — sin token, sin password.
  await expect(page.getByText(/check your inbox/i)).toBeVisible();
  await expect(page.getByText('qa.bot@bunkai-test.dev')).toBeVisible();
});`;

const hybridBridge = `import { expect, request, test } from '@playwright/test';

// UI → API BRIDGE (el puente entre testing de UI y de API).
// magic-link es passwordless: el login NO entrega token al navegador.
// El puente real es HÍBRIDO — reusá la cookie de sesión del browser para
// mintear un PAT vía POST /api/v1/tokens, y después testeás la API con Bearer.

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
    auth: ['Supabase cookie', 'Bearer PAT'],
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
    tokenShape: '{ session, pat: { token: \'bk_pat_<prefix>.<secret>\', scopes, expires_at } }',
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
    patScopes: [
      { scope: 'atc:read', purpose: 'Leer ATCs, steps, assertions, modules, user stories, AC.' },
      { scope: 'atc:write', purpose: 'Crear / actualizar / borrar ATCs.' },
      { scope: 'run:execute', purpose: 'Iniciar runs + postear resultados de steps (Sprint 2).' },
      { scope: 'workspace:admin', purpose: 'Gestionar members, invites, metadata del workspace.' },
    ],
    endpoints: [
      { method: 'GET', path: '/api/v1/me', purpose: 'Identidad + lista de workspaces + workspace activo. Acepta cookie y Bearer.' },
      { method: 'GET', path: '/api/v1/workspaces', purpose: 'Workspaces a los que pertenece el caller. Acepta cookie y Bearer.' },
      { method: 'POST', path: '/api/v1/auth/signup', purpose: 'Provisiona usuario con password + mintea PAT (bootstrap headless).' },
      { method: 'POST', path: '/api/v1/auth/signin', purpose: 'Login email+password → session + PAT fresco.' },
      { method: 'POST', path: '/api/v1/auth/magic-link', purpose: 'Dispara el mail de magic-link (flujo passwordless del /login).' },
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
    playwright: { claude: playwrightClaude, opencode: playwrightOpencode },
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
      note: 'QA bot headless — provisionar vía POST /api/v1/auth/signup; passwords en el Epic BK-29.',
    },
  ],
  playwright: {
    loginTestIds: [
      { id: 'login-email', purpose: 'Input de email del login (magic-link).' },
      { id: 'login-submit', purpose: 'Botón "Send magic link".' },
    ],
    scriptedFixture,
    hybridBridge,
    agenticPrompts: [
      'abrí /login, mandá un magic-link a qa.bot@bunkai-test.dev y sacá un screenshot del estado "Check your inbox"',
      'listá todos los empty states de la home',
      'reportá un bug si algún texto visible desborda su contenedor',
    ],
  },
};
