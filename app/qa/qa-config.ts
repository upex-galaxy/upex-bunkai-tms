export interface DbTlsCa {
  fileName: string
  href: string
  issuer: string
  validUntil: string
  sha256: string
  purpose: string
  nodeEnv: string
  pgClient: string
  lastResort: string
}

export type CredentialSource = 'bk29' | 'own' | 'public' | 'generated';

export interface CredentialRow {
  names: string[]
  purpose: string
  source: CredentialSource
  value?: string
}

export interface CodeSnippet {
  code: string
  language: 'bash' | 'json' | 'jsonc' | 'toml' | 'typescript'
  title?: string
}

export interface QaStep {
  id: string
  title: string
  body: string
  code?: CodeSnippet
  done: string
}

export interface Harness {
  id: 'claude' | 'codex' | 'opencode' | 'pi'
  label: string
  file: string
  open: string
  status: string
  reload: string
  notes: string[]
}

export interface Trouble {
  symptom: string
  cause: string
  fix: string
  code?: string
}

export interface TroubleGroup {
  id: string
  title: string
  items: Trouble[]
}

export interface QaConfig {
  lang: 'es'
  urls: {
    web: string
    api: string
    spec: string
    docs: string
    login: string
  }
  credentialsSource: { label: string, url: string }
  prerequisites: string[]
  credentials: CredentialRow[]
  steps: QaStep[]
  harnessCommon: string
  harnesses: Harness[]
  adminToken: {
    why: string
    steps: { title: string, code: string, done: string }[]
  }
  troubleshooting: TroubleGroup[]
  reference: {
    dbRoles: { name: string, access: string }[]
    revokedSecretTables: string[]
    scopes: { name: string, onSignin: boolean, note: string }[]
    authEndpoints: { method: string, path: string, auth: string, purpose: string }[]
    rlsProbe: string
    rpcAccess: string
  }
  db: { tlsCa: DbTlsCa }
}

const WEB = 'https://staging-upexbunkai.vercel.app';
const lines = (...l: string[]) => l.join('\n');

export const qaConfig: QaConfig = {
  lang: 'es',
  urls: {
    web: WEB,
    api: `${WEB}/api/v1`,
    spec: `${WEB}/api/openapi`,
    docs: `${WEB}/api/docs`,
    login: `${WEB}/login`,
  },
  credentialsSource: {
    label: 'BK-29 en Jira',
    url: 'https://upexgalaxy74.atlassian.net/browse/BK-29',
  },
  prerequisites: [
    'Tu repo de QA (el que trae `.mcp.json`, `dbhub.toml` y `scripts/api-login.ts`), con `bun install` hecho. Si no lo tenés, pedíselo a tu mentor.',
    'Un harness: Claude Code, Codex, OpenCode o Pi.',
    'Un email real que puedas leer: el registro manda un código.',
    'Acceso a la épica BK-29 en Jira, donde están los valores de la base. Si Jira te pide login y no entrás, pedí acceso a tu mentor.',
  ],
  credentials: [
    {
      names: ['STAGING_USER_EMAIL', 'STAGING_USER_PASSWORD'],
      purpose: 'Tu propia cuenta de staging. Las usa `bun run api:login:staging` para sacar tu token de API.',
      source: 'own',
    },
    {
      names: ['API_BASE_URL'],
      purpose: 'Host de la API para el OpenAPI MCP y tus curl. Los paths del spec ya incluyen `/api/v1`.',
      source: 'public',
      value: WEB,
    },
    {
      names: ['OPENAPI_SPEC_PATH'],
      purpose: 'De dónde lee el OpenAPI MCP el contrato. Tiene que ser la URL completa.',
      source: 'public',
      value: `${WEB}/api/openapi`,
    },
    {
      names: ['DBHUB_TYPE', 'DBHUB_HOST', 'DBHUB_PORT', 'DBHUB_DATABASE', 'DBHUB_USER', 'DBHUB_PASSWORD'],
      purpose: 'Conexión del DBHub MCP a la base (rol de solo lectura o de escritura).',
      source: 'bk29',
    },
    {
      names: ['API_TOKEN_USER_STAGING'],
      purpose: 'Tu token personal (PAT) para mandar `Authorization: Bearer`. Vive en `.auth/tokens.env`, no en `.env`.',
      source: 'generated',
    },
  ],
  steps: [
    {
      id: 'cuenta',
      title: 'Creá tu usuario en staging',
      body: 'Entrá a `/login`, escribí tu email y elegí crear contraseña. Te llega un código de 6 a 8 dígitos: pegalo. La primera vez la app te lleva a `/onboarding`, donde creás tu workspace y quedás como owner. Cada tester usa su propia cuenta.',
      done: 'Ves tu workspace en la app.',
    },
    {
      id: 'env',
      title: 'Completá tu .env',
      body: 'Los archivos de MCP de tu repo ya vienen listos y no se tocan. Solo llenás el `.env` de la raíz del repo: tu cuenta, los dos valores públicos y los seis `DBHUB_*` que copiás de BK-29.',
      code: {
        language: 'bash',
        title: '.env',
        code: lines(
          'STAGING_USER_EMAIL=',
          'STAGING_USER_PASSWORD=',
          '',
          `API_BASE_URL=${WEB}`,
          `OPENAPI_SPEC_PATH=${WEB}/api/openapi`,
          '',
          'DBHUB_TYPE=postgres',
          'DBHUB_HOST=',
          'DBHUB_PORT=',
          'DBHUB_DATABASE=',
          'DBHUB_USER=',
          'DBHUB_PASSWORD=',
        ),
      },
      done: 'Lo comprobás en el paso 3.',
    },
    {
      id: 'chequeo',
      title: 'Chequeá las variables sin imprimir secretos',
      body: 'varlock muestra cada variable por nombre y enmascara las sensibles. Si imprime `{}`, esas variables no están en `.env`. Nunca uses grep sobre `.env` ni `env | grep`: imprimen el password.',
      code: {
        language: 'bash',
        code: lines(
          'bunx varlock load --agent --filter \'DBHUB_*\'',
          'bun run vars:env:check',
        ),
      },
      done: 'Aparecen los seis `DBHUB_*` con el password enmascarado y `vars:env:check` termina sin errores (su lista INFO es normal).',
    },
    {
      id: 'token',
      title: 'Sacá tu token de API y probalo',
      body: 'Este script es de tu repo de QA, no del de Bunkai. Inicia sesión con tu cuenta y guarda el PAT en `.auth/tokens.env`, que git ignora. El OpenAPI MCP no lleva token: el token es para tus curl.',
      code: {
        language: 'bash',
        code: lines(
          'bun run api:login:staging',
          'source .auth/tokens.env && curl -s -H "Authorization: Bearer $API_TOKEN_USER_STAGING" \\',
          `  ${WEB}/api/v1/me | jq '{email: .user.email, auth: .auth.source}'`,
        ),
      },
      done: 'La respuesta muestra tu email y `"auth": "bearer"`.',
    },
    {
      id: 'agente',
      title: 'Abrí el agente pelado, desde la raíz del repo',
      body: 'Cada servidor MCP carga `.env` solo al arrancar. No abras el agente con un loader ni hagas source `.env` antes. Después revisá el estado de los MCP como dice tu harness (sección 04).',
      code: {
        language: 'bash',
        code: lines('claude    # o: codex, opencode, pi'),
      },
      done: 'dbhub y openapi aparecen conectados.',
    },
    {
      id: 'db',
      title: 'Primer chequeo de base de datos',
      body: 'Pedile al agente que use dbhub. Debería llamar a `search_objects_primary` o `execute_sql_primary`.',
      code: {
        language: 'bash',
        title: 'prompt',
        code: lines(
          'Usá dbhub: ¿con qué usuario estás conectado y cuántas tablas hay en el schema public?',
        ),
      },
      done: 'Contesta `qa_inspector_ro` (o _rw) y un número de tablas.',
    },
    {
      id: 'api',
      title: 'Primer chequeo de API',
      body: 'El OpenAPI MCP lee el contrato; las llamadas reales las hace con curl y tu token.',
      code: {
        language: 'bash',
        title: 'prompt',
        code: lines(
          'Usá el MCP openapi: listá los endpoints de /api/v1/auth.',
          'Después llamá GET /api/v1/me con curl y el token de .auth/tokens.env.',
        ),
      },
      done: 'Lista las rutas de `/api/v1/auth` y el `GET /me` devuelve 200.',
    },
    {
      id: 'ui',
      title: 'Primer chequeo de UI',
      body: 'playwright-cli maneja un navegador real. En Claude Code, Codex y OpenCode el agente carga su skill solo.',
      code: {
        language: 'bash',
        code: lines(
          `playwright-cli open ${WEB}/login`,
          'playwright-cli snapshot',
          'playwright-cli close',
        ),
      },
      done: 'El snapshot muestra la página de login con el campo `Email`.',
    },
  ],
  harnessCommon: 'Los cuatro archivos ya vienen en tu repo de QA y no se editan. Los cuatro harness levantan dbhub y openapi con el mismo comando: `bun x -p varlock@1.20.0 varlock run --filter <sus variables> -- <servidor>`. Cada servidor lee `.env` cuando arranca, así que después de cambiar `.env` hay que cerrar y abrir el agente.',
  harnesses: [
    {
      id: 'claude',
      label: 'Claude Code',
      file: '.mcp.json',
      open: 'claude',
      status: '`/mcp` dentro de la sesión, o `claude mcp list` en la terminal',
      reload: 'Salí (`/exit`) y volvé a abrir claude.',
      notes: [
        'Sano: `/mcp` muestra `dbhub` y `openapi` como connected.',
        'Un servidor del proyecto sin aprobar figura como Pending approval y no se conecta: aprobalo desde `/mcp`.',
      ],
    },
    {
      id: 'codex',
      label: 'Codex',
      file: '.codex/config.toml',
      open: 'codex',
      status: '`codex mcp list`',
      reload: 'Cerrá y volvé a abrir codex.',
      notes: [
        'Sano: `codex mcp list` muestra `dbhub` y `openapi`. Si solo ves servidores globales, la carpeta no es de confianza.',
        'Codex solo carga la config del proyecto si confiás en la carpeta: la primera vez que lo abrís en el repo, respondé que sí confiás.',
        'Cada servidor tiene `startup_timeout_sec = 30`. La primera descarga de bun x puede tardar; si falla por timeout, reabrí.',
        'Abrilo desde la raíz del repo: ahí resuelve `OPENAPI_SPEC_PATH` si es un archivo.',
      ],
    },
    {
      id: 'opencode',
      label: 'OpenCode',
      file: 'opencode.jsonc',
      open: 'opencode',
      status: '`opencode mcp list`',
      reload: 'Cerrá y volvé a abrir opencode.',
      notes: [
        'Los servidores están bajo la clave mcp, con type "local" y el comando como lista.',
        'Sano: `opencode mcp list` muestra `dbhub` y `openapi`. Si dice No MCP servers configured, no leyó el `opencode.jsonc` del repo.',
        'Abrilo desde la raíz del repo para que encuentre `opencode.jsonc` y `.env`.',
      ],
    },
    {
      id: 'pi',
      label: 'Pi',
      file: '.pi/mcp.json',
      open: 'pi',
      status: '`pi mcp list` (sale con código 1 si un servidor falla)',
      reload: '`/reload` dentro de la sesión.',
      notes: [
        'Sano: `pi mcp list` muestra los dos servidores sin error.',
        'Pi solo lee `.pi/mcp.json` en un proyecto de confianza: corré `/trust` y después `/reload`.',
        'Los servidores son deferred: el agente los encuentra con su búsqueda de tools, no aparecen todos de entrada.',
      ],
    },
  ],
  adminToken: {
    why: 'Las rutas de administración de un workspace (miembros, invites, billing, Jira) piden el scope `workspace:admin` atado a ese workspace. signin y confirm lo rechazan con 403; solo `POST /api/v1/tokens` lo emite, y esa ruta exige la cookie de sesión. signin te da esa cookie sin navegador. Usá un workspace donde seas owner o admin.',
    steps: [
      {
        title: 'Iniciá sesión y guardá la cookie (también crea un PAT mínimo que revocás en el paso 4)',
        code: lines(
          'mkdir -p .auth',
          `bunx varlock run --filter STAGING_USER_EMAIL,STAGING_USER_PASSWORD -- sh -c 'curl -s -c .auth/bunkai-cookie.txt -H "Content-Type: application/json" -d "{\\"email\\":\\"$STAGING_USER_EMAIL\\",\\"password\\":\\"$STAGING_USER_PASSWORD\\",\\"pat_name\\":\\"cookie-bridge\\",\\"pat_scopes\\":[\\"atc:read\\"],\\"pat_expires_in_days\\":1}" ${WEB}/api/v1/auth/signin | jq "{pat_id: .pat.id}"'`,
        ),
        done: 'Imprime {"pat_id": "..."}: anotá ese id, es tu <PAT_ID>.',
      },
      {
        title: 'Elegí el workspace',
        code: `curl -s -b .auth/bunkai-cookie.txt ${WEB}/api/v1/workspaces | jq '.workspaces[] | {id, name, role}'`,
        done: 'Ves tus workspaces con su rol. Copiá el id de uno donde seas owner o admin: es tu <WORKSPACE_ID>.',
      },
      {
        title: 'Emití el PAT de ese workspace y guardalo sin imprimirlo (<WORKSPACE_ID> va en los dos lugares)',
        code: lines(
          'curl -s -b .auth/bunkai-cookie.txt -H "Content-Type: application/json" \\',
          '  -d \'{"name":"qa-ws-admin","scopes":["atc:read","atc:write","run:execute","workspace:admin"],"workspace_id":"<WORKSPACE_ID>","expires_in_days":7}\' \\',
          `  ${WEB}/api/v1/tokens | jq -r '"export API_TOKEN_WSADMIN_STAGING=" + .token, "export API_TOKEN_WSADMIN_ID=" + .id' > .auth/ws-admin.env`,
          'source .auth/ws-admin.env && curl -s -H "Authorization: Bearer $API_TOKEN_WSADMIN_STAGING" \\',
          `  ${WEB}/api/v1/workspaces/<WORKSPACE_ID> | jq '.workspace.name'`,
        ),
        done: 'Imprime el nombre del workspace. El token queda en .auth/ws-admin.env.',
      },
      {
        title: 'Cuando termines: revocá los dos PAT, cerrá la sesión y borrá los archivos',
        code: lines(
          'source .auth/ws-admin.env',
          'for id in <PAT_ID> "$API_TOKEN_WSADMIN_ID"; do',
          `  curl -s -o /dev/null -w '%{http_code}\\n' -b .auth/bunkai-cookie.txt -X DELETE ${WEB}/api/v1/tokens/$id`,
          'done',
          `curl -s -o /dev/null -w '%{http_code}\\n' -b .auth/bunkai-cookie.txt -X POST ${WEB}/api/v1/auth/sign-out`,
          'rm -f .auth/bunkai-cookie.txt .auth/ws-admin.env',
        ),
        done: 'Imprime 204, 204 y 200. Si un DELETE da 401, la cookie venció: repetí el paso 1 y volvé a revocar.',
      },
    ],
  },
  troubleshooting: [
    {
      id: 'mcp',
      title: 'Servidores MCP',
      items: [
        {
          symptom: 'dbhub u openapi aparece failed, ✘ o desconectado',
          cause: 'Falta una variable o tiene un formato inválido (varlock corta solo ese servidor), o la primera descarga de bun x tardó demasiado.',
          fix: 'Revisá las variables con varlock, completá la que falta y reabrí el agente.',
          code: 'bunx varlock load --agent --filter \'DBHUB_*\'',
        },
        {
          symptom: 'Claude Code: el servidor figura como Pending approval',
          cause: 'Los servidores de `.mcp.json` necesitan tu aprobación.',
          fix: 'Abrí `/mcp` y aprobalo.',
        },
        {
          symptom: 'codex mcp list no muestra dbhub ni openapi',
          cause: 'La carpeta no está marcada como confiable.',
          fix: 'Reabrí codex desde la raíz del repo, aceptá la confianza y revisá con `codex mcp list`.',
        },
        {
          symptom: 'Codex: el servidor está en la lista pero falla al arrancar',
          cause: 'La primera descarga de `bun x` superó los 30 s de `startup_timeout_sec`.',
          fix: 'Cerrá y abrí codex: la segunda vez el paquete ya está en caché.',
        },
        {
          symptom: 'Pi no ve ningún MCP',
          cause: 'Proyecto sin confianza: Pi ignora `.pi/mcp.json`.',
          fix: 'Corré `/trust` y `/reload`, y revisá con `pi mcp list`.',
        },
        {
          symptom: 'opencode mcp list dice No MCP servers configured',
          cause: 'Se abrió desde otra carpeta y no encontró `opencode.jsonc`.',
          fix: 'Abrí opencode desde la raíz del repo y revisá con `opencode mcp list`.',
        },
        {
          symptom: 'openapi termina apenas arranca',
          cause: '`OPENAPI_SPEC_PATH` es solo `/api/openapi`: se lee como archivo y no existe.',
          fix: `Usá la URL completa: ${WEB}/api/openapi`,
        },
        {
          symptom: 'invoke-api-endpoint del MCP devuelve 401',
          cause: 'Es lo esperado: el OpenAPI MCP no lleva token.',
          fix: 'Usá el MCP para leer el contrato y curl con tu token para llamar.',
        },
      ],
    },
    {
      id: 'env',
      title: 'Variables de entorno',
      items: [
        {
          symptom: 'Cambié .env y el agente sigue igual',
          cause: 'Cada servidor lee `.env` una sola vez, al arrancar.',
          fix: 'Cerrá y abrí el agente.',
        },
        {
          symptom: 'El valor de .env no se usa aunque está bien escrito',
          cause: 'Una variable exportada en tu terminal le gana a `.env`.',
          fix: '`bun run vars:env:check` la nombra; hacé unset de esa variable y reabrí el agente.',
          code: 'bun run vars:env:check',
        },
        {
          symptom: 'env | grep DBHUB sale vacío',
          cause: 'Es correcto: nada carga `.env` en tu terminal, solo dentro de cada servidor MCP.',
          fix: 'Chequeá con `varlock load --agent`. No uses grep sobre `.env`: imprime el password.',
        },
        {
          symptom: 'Un password con # llega cortado',
          cause: 'En `.env`, un # sin comillas empieza un comentario.',
          fix: 'Poné el valor entre comillas simples.',
        },
      ],
    },
    {
      id: 'db',
      title: 'Base de datos',
      items: [
        {
          symptom: 'ECONNRESET, Connection terminated o timeout al conectar',
          cause: 'Tu red corta el puerto 5432 (pasa seguido desde Windows y redes corporativas).',
          fix: 'Cambiá a `DBHUB_PORT=6543` (transaction pooler de Supabase, mismo host y usuario) y reabrí el agente. Si el 6543 también corta, probá sin VPN o desde otra red.',
        },
        {
          // eslint-disable-next-line no-template-curly-in-string -- the literal placeholder is the error text a tester sees
          symptom: 'password authentication failed, o el error muestra ${DBHUB_PASSWORD}',
          cause: 'La variable está vacía: DBHub usa el texto literal en vez de fallar al arrancar.',
          fix: 'Completá la variable con el valor de BK-29 y reabrí el agente.',
        },
        {
          symptom: 'Tenant or user not found',
          cause: 'Al usuario le falta el sufijo del proyecto.',
          fix: '`DBHUB_USER` va con punto y project-ref, tal cual figura en BK-29.',
        },
        {
          symptom: 'SELF_SIGNED_CERT_IN_CHAIN en un script tuyo',
          cause: 'Node no trae la CA de Supabase.',
          fix: 'Usá el certificado público de la sección 07.',
        },
        {
          symptom: 'Ves datos de todos los workspaces',
          cause: 'Los roles qa_inspector tienen BYPASSRLS: ven a todos los tenants.',
          fix: 'Es esperado. Para probar aislamiento usá una sesión real de usuario (sección 07).',
        },
      ],
    },
    {
      id: 'api',
      title: 'Tokens y API',
      items: [
        {
          symptom: '401 "Invalid token."',
          cause: 'El PAT venció o fue revocado, o mandaste `session.access_token` en vez del PAT.',
          fix: 'Corré de nuevo `bun run api:login:staging` y usá `API_TOKEN_USER_STAGING`.',
        },
        {
          symptom: '403 "workspace:admin tokens cannot be issued via headless auth"',
          cause: 'signin y confirm nunca emiten `workspace:admin`.',
          fix: 'Seguí la sección 05.',
        },
        {
          symptom: '403 "Personal access tokens cannot issue tokens. Use a browser session."',
          cause: '`POST /api/v1/tokens` solo acepta la cookie de sesión.',
          fix: 'Usá la cookie de la sección 05, no un Bearer.',
        },
        {
          symptom: '403 en una ruta /workspaces/{id}/...',
          cause: 'Tu PAT no tiene el scope que pide la ruta, o es de otro workspace.',
          fix: 'Emití un PAT de ese workspace con el scope que falta (sección 05).',
        },
        {
          symptom: '429 rate_limited',
          cause: 'signin y confirm aceptan 10 intentos por minuto.',
          fix: 'Esperá los segundos del header `Retry-After`.',
        },
        {
          symptom: 'api:login:staging da 404 o guarda un token vacío',
          cause: 'El adaptador de login de tu repo no está apuntado a Bunkai.',
          fix: '`config/variables.ts` debe tener `loginEndpoint "/auth/signin"` y `scripts/api-login.project.ts` debe leer `pat.token`.',
        },
        {
          symptom: 'Tu repo no tiene el script api:login:staging',
          cause: 'El repo no es el de QA o quedó viejo.',
          fix: 'Actualizalo con `bun sync`. Mientras tanto, los pasos 1 y 4 de la sección 05 te dan una sesión y un token sin ese script.',
        },
        {
          symptom: 'El registro devuelve 422',
          cause: 'Bunkai rechaza dominios reservados (example.com, .test, .local y similares).',
          fix: 'Registrate con un email real.',
        },
      ],
    },
    {
      id: 'windows',
      title: 'Windows',
      items: [
        {
          symptom: 'source o sh no existen',
          cause: 'PowerShell y cmd no los tienen.',
          fix: 'Corré los comandos de esta guía en Git Bash o WSL. En PowerShell, leé el token de `.auth/tokens.json` y usá `curl.exe`.',
        },
      ],
    },
  ],
  reference: {
    dbRoles: [
      { name: 'qa_inspector_ro', access: 'SELECT sobre public. Es el rol por defecto.' },
      { name: 'qa_inspector_rw', access: 'SELECT, INSERT, UPDATE y DELETE sobre public. Solo para preparar datos.' },
    ],
    revokedSecretTables: ['access_token_secrets', 'magic_link_token_secrets', 'workspace_invite_secrets'],
    scopes: [
      { name: 'atc:read', onSignin: true, note: 'Lecturas.' },
      { name: 'atc:write', onSignin: true, note: 'Altas, cambios y bajas.' },
      { name: 'run:execute', onSignin: true, note: 'Ejecutar runs.' },
      { name: 'workspace:admin', onSignin: false, note: 'Administrar un workspace. Solo vía POST /api/v1/tokens con workspace_id.' },
    ],
    authEndpoints: [
      { method: 'POST', path: '/api/v1/auth/signup', auth: 'pública', purpose: 'Registro: 202, manda el código por email.' },
      { method: 'POST', path: '/api/v1/auth/confirm', auth: 'pública', purpose: 'Confirma el código; devuelve sesión y PAT.' },
      { method: 'POST', path: '/api/v1/auth/signin', auth: 'pública', purpose: 'Login: setea la cookie y devuelve un PAT global.' },
      { method: 'GET', path: '/api/v1/me', auth: 'cookie o PAT', purpose: 'Quién sos y con qué auth llegaste.' },
      { method: 'POST', path: '/api/v1/tokens', auth: 'solo cookie', purpose: 'Emite un PAT, opcionalmente atado a un workspace.' },
      { method: 'GET', path: '/api/v1/tokens', auth: 'cookie o PAT', purpose: 'Lista tus PAT.' },
      { method: 'DELETE', path: '/api/v1/tokens/{id}', auth: 'solo cookie', purpose: 'Revoca un PAT.' },
      { method: 'POST', path: '/api/v1/auth/sign-out', auth: 'solo cookie', purpose: 'Cierra la sesión.' },
    ],
    rlsProbe: 'Los roles qa_inspector no sirven para probar aislamiento entre tenants. Para eso iniciá sesión como el usuario B y pedí por API un recurso del workspace del usuario A: tiene que volver vacío o 403/404.',
    rpcAccess: '`qa_inspector_rw` puede ejecutar casi todos los RPC de public, salvo cinco que leen `auth.users`. Cuidado con `bunkai_sweep_abandoned_runs`: no está limitado a un workspace y aborta runs inactivos de todos los tenants.',
  },
  db: {
    tlsCa: {
      fileName: 'supabase-root-2021-ca.crt',
      href: '/qa/supabase-root-2021-ca.crt',
      issuer: 'Supabase Root 2021 CA',
      validUntil: '2031-04-26',
      sha256: '80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA',
      purpose: 'Un cliente Node, Playwright o pg sin esta CA falla con SELF_SIGNED_CERT_IN_CHAIN. DBHub y las extensiones SQL no suelen necesitarla. El certificado es público.',
      nodeEnv: 'NODE_EXTRA_CA_CERTS=/ruta/a/supabase-root-2021-ca.crt node tu-script.js',
      pgClient: lines(
        'import fs from \'node:fs\'',
        'import pg from \'pg\'',
        '',
        'const client = new pg.Client({',
        '  host: process.env.DBHUB_HOST,',
        '  port: Number(process.env.DBHUB_PORT),',
        '  database: process.env.DBHUB_DATABASE,',
        '  user: process.env.DBHUB_USER,',
        '  password: process.env.DBHUB_PASSWORD,',
        '  ssl: { ca: fs.readFileSync(\'/ruta/a/supabase-root-2021-ca.crt\', \'utf8\') },',
        '})',
      ),
      lastResort: 'Último recurso para destrabarte: ssl: { rejectUnauthorized: false }. Eso APAGA la verificación del certificado. No lo dejes en un script que commiteás.',
    },
  },
};
