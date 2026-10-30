# Guía de Configuración MCP por host

Referencia de sintaxis para los tres hosts del contrato (`.agents/instructions/agent-harnesses.md` §5.5): **Claude Code**, **OpenCode** y **Codex CLI + Desktop**. Qué servidores corre el repo, cómo llegan las credenciales y cómo sumar uno opt-in está en [`README.md`](./README.md); esta página es el detalle por host.

---

## Tabla de Contenidos

1. [Resumen de Formatos](#resumen-de-formatos)
2. [Variables y secretos](#variables-y-secretos)
3. [Claude Code](#claude-code)
4. [OpenCode](#opencode)
5. [Codex CLI + Desktop](#codex-cli--desktop)
6. [DBHub (SQL)](#dbhub-sql)
7. [OpenAPI](#openapi)
8. [Postman](#postman)
9. [Token de Supabase para llamar a la API](#token-de-supabase-para-llamar-a-la-api)
10. [Troubleshooting](#troubleshooting)

---

## Resumen de Formatos

| Host                | Archivo de proyecto  | Archivo global                     | Formato |
| ------------------- | -------------------- | ---------------------------------- | ------- |
| **Claude Code**     | `.mcp.json`          | `~/.claude.json` (scope `user`)    | JSON    |
| **OpenCode**        | `opencode.jsonc`     | `~/.config/opencode/opencode.json` | JSONC   |
| **Codex CLI + Desktop** | `.codex/config.toml` (solo en un repo trusted) | `~/.codex/config.toml` | TOML |

**En este repo** los tres archivos de proyecto están commiteados con el mismo conjunto de servidores: el que declara `.mcp.json`. `bun run agents:compat:check` los normaliza y compara; un servidor que falte en un host, o que exista en uno solo, falla el gate. En un proyecto que declara `harnesses:` en `.agents/project.yaml`, solo se comparan los hosts en uso. Los servidores que trae el boilerplate (`KNOWN_MCP_IDS` en `cli/lib/agent-compatibility-contracts.ts`) reciben además un chequeo estricto de forma por host; cualquier otro, solo el chequeo genérico de variables de `.env`.

### Diferencias Clave

| Característica | Claude Code     | OpenCode                    | Codex                                                    |
| -------------- | --------------- | --------------------------- | -------------------------------------------------------- |
| Root key       | `mcpServers`    | `mcp`                       | `mcp_servers`                                            |
| Command        | string + `args` | array                       | string + `args`                                          |
| Env literal    | `env`           | `environment`               | `[mcp_servers.X.env]`                                    |
| Secreto stdio  | loader de `.env` | loader de `.env`           | loader de `.env` + `startup_timeout_sec = 30`            |
| Secreto remoto | `${VAR}`        | `{env:VAR}`                 | `bearer_token_env_var`                                   |
| Remote type    | `type: "http"`  | `type: "remote"`            | `url`                                                    |
| Enable/disable | N/A             | `enabled`                   | `enabled`                                                |

---

## Variables y secretos

Los templates de este directorio usan `{{VARIABLE}}` solo como marcador de buscar y reemplazar: ningún host lo entiende en runtime. Un secreto no se escribe en el config: su valor vive en `.env` (gitignored) y llega al server así:

| Server            | Cómo llega el secreto                                                                                         | Si la variable falta                                              |
| ----------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| stdio (los tres hosts) | el loader de `.env`: `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter A,B -- <server>` | el server la recibe vacía o sin definir y falla en su primera llamada autenticada |
| remoto, Claude Code | `${VAR}` en `url` / `headers`, desde el entorno del proceso                                                  | sin aviso claro: el server falla en su primera llamada, o el config no carga en un lanzamiento de escritorio |
| remoto, OpenCode  | `{env:VAR}`, desde el entorno del proceso                                                                     | `""`                                                              |
| remoto, Codex     | `bearer_token_env_var = "VAR"`, desde el entorno del proceso                                                  | error al arrancar que nombra el server                            |

**El loader de `.env`.** Es el mismo en los tres hosts (`MCP_ENV_LOADER_*` / `mcpEnvLoaderArgs` en `cli/lib/agent-compatibility-contracts.ts`). Lee el schema de varlock más `.env` / `.env.local` (o el gestor de secretos que nombra el schema) desde la raíz del proyecto al arrancar el server, lo haya lanzado quien sea (terminal, app de escritorio, worker supervisado), y le pasa **solo** las variables de su `--filter`, que son los nombres exactos que el server lee. `--inject vars` las pasa sueltas, sin blob; `--no-redact-stdout` deja intacto el stream JSON-RPC. Al lado del loader no va ningún `${VAR}`, `{env:}`, `{file:}` ni `env_vars`: un `${VAR}` sin valor rompe un lanzamiento de escritorio y un valor heredado vacío le gana a `.env`. Un server que no necesita valores (context7) arranca sin loader. Un valor que falla el schema frena solo al server que lo necesita: `bunx varlock load --agent` muestra cuál, redactado.

**Un server remoto no puede usar el loader** (no hay comando que envolver): su secreto sale del entorno del proceso del harness, adonde `.env` no llega en ningún lanzamiento. Preferí el login OAuth del server (como el MCP remoto de Atlassian vía `mcp-remote`); un server que solo acepta token necesita que exportes esa ÚNICA variable en el shell antes de lanzar, sabiendo que queda en el entorno del agente.

**Abrir el agente.** Con su propio binario en la carpeta del proyecto (`claude`, `opencode`, `codex`) o con su app de escritorio. No hay script envoltorio: nada carga `.env` en el proceso del agente, así que ningún secreto llega al shell de la IA (ADR-0016). Un comando que corre el agente y necesita un valor lo corre por el loader en un subproceso: `bunx varlock run -- sh -c '<comando que usa "$VAR">'` (los scripts de `bun` cargan `.env` solos). Si un MCP se comporta como si `.env` no existiera, corré `bun run vars:env:check`: nombra la variable que el shell exporta con otro valor, porque bajo varlock gana el heredado (solo nombres y largos). Después de un cambio de `.env`, reiniciá la sesión. Una instalación vieja escribía copias en texto plano (bloque `env` de `.claude/settings.local.json`, `.auth/opencode/<VAR>`): `bun run harness:env` las retira y `bun run harness:env:check` sale con 1 mientras quede una.

> **Regla crítica:** ningún server stdio se niega a arrancar por una variable faltante (el único error temprano es el `bearer_token_env_var` de un server remoto en Codex). Un 401/403 o una falla misteriosa de una tool ES la señal. Verificá con `/mcp` dentro de la sesión, corregí `.env` y reiniciá la sesión: las variables se leen al spawnear el MCP (`AGENTS.md` Critical Rule #9).

---

## Claude Code

**Archivo de proyecto:** `.mcp.json` en el root.

```json
{
  "mcpServers": {
    "server-name": {
      "command": "bunx",
      "args": [
        "-p", "varlock@<pin>", "varlock", "run", "--no-redact-stdout",
        "--inject", "vars", "--filter", "API_KEY", "--",
        "npx", "-y", "package-name"
      ]
    },
    "remote-server": {
      "type": "http",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer ${API_TOKEN}"
      }
    }
  }
}
```

```bash
# Ver, habilitar, autenticar o reconectar servers (dentro de la sesión)
/mcp

# Agregar un server a tu scope de usuario (fuera de este repo)
claude mcp add --scope user server-name -- npx -y package-name
```

Un server que solo agregás vos (por ejemplo búsqueda web) va al scope `user` o como conector de claude.ai, nunca a `.mcp.json`. Guía del host: [`docs/setup/mcp/claude-code.md`](../setup/mcp/claude-code.md).

---

## OpenCode

**Archivo de proyecto:** `opencode.jsonc` en el root.

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "server-name": {
      "type": "local",
      "command": [
        "bunx", "-p", "varlock@<pin>", "varlock", "run", "--no-redact-stdout",
        "--inject", "vars", "--filter", "API_KEY", "--",
        "npx", "-y", "package-name",
      ],
      "enabled": true,
    },
    "remote-server": {
      "type": "remote",
      "url": "https://mcp.example.com/mcp",
      "headers": {
        "Authorization": "Bearer {env:API_TOKEN}",
      },
      "oauth": false,
      "enabled": true,
    },
  },
}
```

- `command` es un array (`["npx", "-y", "package"]`), nunca un string.
- El loader corre en el directorio de `opencode.jsonc`, así que en un worktree lee el `.env` de ese worktree (`bun run worktree:provision` lo copia).
- `enabled: false` desactiva un server sin borrarlo.
- El servicio en background cachea el config resuelto por directorio: después de cambiar `.env` o el config, `opencode service restart` (o cerrá todas las sesiones).

---

## Codex CLI + Desktop

**Archivo de proyecto:** `.codex/config.toml`. Solo se carga si Codex confía en el repositorio; la confianza es estado de runtime, así que `bun run setup:doctor` la reporta como WARN. Codex CLI y Codex Desktop leen el mismo archivo. Guía del host: [`docs/setup/mcp/codex.md`](../setup/mcp/codex.md).

Codex no interpola placeholders dentro de `args` ni de `[mcp_servers.X.env]`: un `${VAR}` ahí llega al server como texto literal. No hace falta:

- un server stdio que necesita valores arranca con el loader de `.env` (arriba), igual que en los otros dos hosts, más `startup_timeout_sec = 30` (un `bunx` en frío más el salto del loader puede pasar los 10 s por defecto);
- `bearer_token_env_var = "NOMBRE"` en un server HTTP envía `Authorization: Bearer <valor>` desde el entorno del proceso;
- `[mcp_servers.X.env]` queda para settings literales (`MCP_MODE = "stdio"`).

```toml
[mcp_servers.server-name]
command = "bunx"
enabled = true
startup_timeout_sec = 30
args = [
  "-p", "varlock@<pin>", "varlock", "run", "--no-redact-stdout",
  "--inject", "vars", "--filter", "API_KEY", "--",
  "npx", "-y", "package-name",
]

[mcp_servers.remote-server]
url = "https://mcp.example.com/mcp"
bearer_token_env_var = "API_TOKEN"
```

`<pin>` es la versión exacta de la devDependency `varlock` (la que usan los configs commiteados). `bun run agents:compat:check` compara **los nombres de variables de `.env`** de los que depende cada host (el `--filter`) y la existencia de cada server. Un server stdio sin loader, con `env_vars` al lado del loader o sin `startup_timeout_sec` falla el check en el boilerplate y es WARNING en un proyecto derivado, con el lanzamiento exacto. Los bloques reales están en `.codex/config.toml`; los opt-in, ya con el loader, en [`codex.template.toml`](./codex.template.toml).

```bash
# Server global (fuera de este repo)
codex mcp add server-name -- npx -y package-name
codex mcp add remote-name --url https://mcp.example.com/mcp
codex mcp login remote-name

# Dentro de la sesión
/mcp
```

---

## DBHub (SQL)

Opt-in. La capacidad `db` del repo la da el MCP `supabase` commiteado; DBHub se suma solo cuando un proyecto necesita SQL contra una base que ese MCP no cubre.

1. Copiá [`dbhub.example.toml`](./dbhub.example.toml) a `dbhub.toml` en el root. Usa `${VAR}`, que DBHub interpola desde su entorno al cargar (el loader de `.env` del bloque `sql` lo llena con su `--filter`), así que `dbhub.toml` se puede commitear sin secretos. Credenciales literales solo en `dbhub.local.toml` (ya gitignored).
2. Declará `DB_HOST`, `DB_USER` y `DB_PASSWORD` en `.env.schema` (`@sensitive` en la contraseña), agregalas vacías a `.env.example` y con valor a `.env`. Una variable más en `dbhub.toml` va también al `--filter` del bloque `sql` en los tres hosts.
3. Copiá el bloque `sql` de los tres templates a `.mcp.json`, `opencode.jsonc` y `.codex/config.toml`, y corré `bun run agents:compat:check`.
4. Reiniciá la sesión y verificá con `/mcp`.

DBHub nombra sus tools con el id de la fuente (`execute_sql_<source_id>`); una variable sin definir queda como `${VAR}` literal sin error, y la conexión falla después.

---

## OpenAPI

Opt-in, para explorar la API de la app desde el agente. Para llamadas puntuales alcanza con `curl` y los tipos de `bun run api:sync` (`.agents/instructions/agent-tool-resolution.md` §6, `[API_TOOL]`).

Requisitos: URL base de la API, URL del spec OpenAPI (JSON o YAML) y un bearer token ([abajo](#token-de-supabase-para-llamar-a-la-api)).

> **IMPORTANTE:** el flag `--tools dynamic` es obligatorio. Sin él, el server responde 400.

Bloques en los tres templates (`openapi`). Reemplazá `{{API_BASE_URL}}` y `{{OPENAPI_SPEC_URL}}` por las URLs de tu entorno. El header `API_HEADERS` lleva el token dentro del valor y ningún host lo interpola: poné el valor entero (`API_HEADERS=Authorization:Bearer <token>`) en `.env`; el loader del bloque se lo pasa al server con `--filter API_HEADERS` en los tres hosts.

| Tool                      | Descripción                           |
| ------------------------- | ------------------------------------- |
| `list-api-endpoints`      | Lista los endpoints disponibles       |
| `get-api-endpoint-schema` | Obtiene el schema JSON de un endpoint |
| `invoke-api-endpoint`     | Ejecuta un endpoint con parámetros    |

---

## Postman

Opt-in, servidor remoto.

1. En https://www.postman.com: avatar → **Settings** → **API Keys** → **Generate API Key** (se muestra una sola vez).
2. Guardala en `.env` como `POSTMAN_API_KEY`.
3. Copiá el bloque `postman` de los tres templates y reemplazá `{{POSTMAN_API_KEY}}` por `${POSTMAN_API_KEY}` (Claude Code) o `{env:POSTMAN_API_KEY}` (OpenCode). Codex la envía con `bearer_token_env_var = "POSTMAN_API_KEY"`. Es un server remoto: la key sale del entorno del proceso del harness, no de `.env`. Si Postman no ofrece login OAuth, exportá `POSTMAN_API_KEY` en el shell antes de abrir el agente, sabiendo que queda en su entorno.

Las tools cubren colecciones, requests, environments, specs, mocks y workspaces; `/mcp` lista las que expone tu versión.

---

## Token de Supabase para llamar a la API

```
CLIENTE                       SUPABASE AUTH                   API DE LA APP
   |  1. POST /auth/v1/token        |                               |
   |     { email, password }        |                               |
   | -----------------------------> |                               |
   |  2. { access_token: "eyJ..." } |                               |
   | <----------------------------- |                               |
   |  3. GET /api/<recurso>                                         |
   |     Authorization: Bearer eyJ...                               |
   | -------------------------------------------------------------> |
   |  4. 200 OK                                                     |
   | <------------------------------------------------------------- |
```

```bash
# 1. Obtener el token con la identidad de automatización del proyecto
curl -X POST 'https://<project-ref>.supabase.co/auth/v1/token?grant_type=password' \
  -H "apikey: $SUPABASE_PUBLISHABLE_KEY" \
  -H 'Content-Type: application/json' \
  -d '{"email":"<email>","password":"<password>"}'

# 2. Usar el token
curl 'https://<app-host>/api/<recurso>' \
  -H 'Authorization: Bearer <access_token del paso 1>'
```

El token dura lo que dice `expires_in` en la respuesta (en segundos). Ante un 401, pedí uno nuevo. `<project-ref>` está en `NEXT_PUBLIC_SUPABASE_URL`. `<email>` y `<password>` salen de las variables de `.env` que nombra `.agents/project.yaml` → `testing.automation_identity` (`email_var`, `password_var`): una cuenta dedicada de no producción, nunca un usuario creado a mano.

---

## Troubleshooting

### 401 / 403 o una tool que falla sin explicación

Variable faltante o vacía (ver [Variables y secretos](#variables-y-secretos)). Corregí `.env` (`bunx varlock load --agent` muestra, redactado, qué valor falla el schema) y reiniciá la sesión.

### El MCP no aparece en `/mcp`

- Revisá la sintaxis del archivo (root key, `command` como array en OpenCode).
- Codex: confirmá que el repo es trusted.
- OpenCode: un `{file:}` que apunta a un archivo inexistente invalida todo el config (solo en un config viejo; los de este repo usan el loader de `.env`).
- Reiniciá la sesión después de cada cambio.

### `bun run agents:compat:check` falla después de agregar un server

El server falta en alguno de los tres archivos, o depende de variables distintas en cada uno. El mensaje nombra el server y el host.

### Error 400 en OpenAPI

Falta `--tools dynamic` en los argumentos.

### Error de conexión en DBHub

- `dbhub.toml` existe en el root y sus `${VAR}` están en `.env`.
- La base es alcanzable desde tu red (Supabase: pooler en IPv4).

---

## Referencias

- [Claude Code MCP](https://docs.anthropic.com/en/docs/claude-code/mcp)
- [OpenCode Config](https://opencode.ai/docs/config/)
- [Codex MCP](https://developers.openai.com/codex/mcp/)
- [DBHub Configuration](https://dbhub.ai/config/toml)
- [OpenAPI MCP Server](https://github.com/ivo-toby/mcp-openapi-server)
