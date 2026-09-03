# Configuración de Codex CLI + Codex Desktop

**Codex** es el agente de codificación de OpenAI. La CLI y la app de escritorio (Codex Desktop) leen la misma configuración de repositorio, así que todo lo que sigue aplica a las dos.

> 💡 Para conceptos generales de MCP, consulta [MCP - Guía General](./README.md). Para la arquitectura completa de tres harnesses, `AGENTS.md` §5.5.

---

## 🚀 Quick Start

```bash
bun install
bun run setup        # detecta Claude Code / OpenCode / Codex instalados, genera los shims
bun run codex        # lanza codex con .env cargado
```

`bun run codex` es un wrapper `dotenv -o -e .env -- codex`. El `-o` hace que `.env` gane sobre una variable heredada del shell. Lanzar `codex` a secas funciona, pero deja a los MCPs sin las variables que `.codex/config.toml` reenvía por nombre, y el síntoma es un 401/403 en el primer tool call.

Si el instalador no detecta Codex (por ejemplo, un binario en una ruta no estándar), forzá la lista con `INSTALL_AGENTS=codex bun run setup`.

---

## 📂 Qué lee Codex de este repo

Codex no necesita ningún shim: consume las dos fuentes canónicas directamente.

| Superficie    | Archivo                                          | Cómo llega a Codex                                                                                                                                                                                                |
| ------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instrucciones | `AGENTS.md`                                      | Nativo. Es el mismo archivo que OpenCode lee nativo y que Claude Code lee a través del shim `CLAUDE.md` (`@AGENTS.md` en una línea).                                                                              |
| Skills        | `.agents/skills/<name>/SKILL.md` + `references/` | Nativo. Una sola copia commiteada; Claude Code llega por el alias generado `.claude/skills`.                                                                                                                      |
| Comandos      | ninguno                                          | Codex no tiene capa de wrappers. Donde en Claude Code / OpenCode tipeás `/dev-roadmap`, acá pedís la skill + modo: "load skill `project-context` mode `dev-roadmap`". La tabla de aliases está en `AGENTS.md` §5. |
| Hook          | `.codex/hooks.json`                              | `UserPromptSubmit` ejecuta `.agents/hooks/personality-reinject.mjs` (el mismo emisor que usan los otros dos harnesses) desde la raíz de git. Trae `command` POSIX y `commandWindows`.                             |
| MCP           | `.codex/config.toml`                             | Cuatro servidores (`context7`, `tavily`, `supabase`, `n8n`) en formato Codex. Paridad con `.mcp.json` y `opencode.jsonc` verificada por `bun run agents:compat:check`.                                            |

Los ocho aliases de comando (`/sync-ai-memory`, `/business-data-map`, `/business-feature-map`, `/business-api-map`, `/master-implementation-plan`, `/dev-roadmap`, `/jira-instance-migration`, `/jira-components`) resuelven así:

| Alias en Claude Code / OpenCode | En Codex pedí                                          |
| ------------------------------- | ------------------------------------------------------ |
| `/business-data-map`            | skill `project-context`, modo `data`                   |
| `/business-feature-map`         | skill `project-context`, modo `features`               |
| `/business-api-map`             | skill `project-context`, modo `api`                    |
| `/master-implementation-plan`   | skill `project-context`, modo `master-plan`            |
| `/dev-roadmap`                  | skill `project-context`, modo `dev-roadmap`            |
| `/sync-ai-memory`               | skill `sync-ai-memory`                                 |
| `/jira-components`              | skill `jira-administration`, modo `components`         |
| `/jira-instance-migration`      | skill `jira-administration`, modo `instance-migration` |

---

## 🔐 Repository trust (obligatorio)

Codex carga `.codex/config.toml` y `.codex/hooks.json` **solo en un repositorio trusted**. Sin trust, Codex arranca igual pero sin los MCPs ni el hook de personalidad, y no avisa.

- La confianza es estado de runtime de Codex, no un archivo del repo: no se puede verificar leyendo el disco. Por eso `bun run setup:doctor` la muestra como fila **WARN** (no FAIL) y te recuerda confirmarla.
- La primera vez que abrís el repo, Codex pregunta si confiás en él. Aceptá. Si lo rechazaste, revisá la configuración de proyectos trusted de tu instalación de Codex y volvé a marcarlo.
- Codex Desktop comparte esa confianza con la CLI: es la misma configuración de usuario.

---

## 🔌 MCP en `.codex/config.toml`

### Por qué la forma cambia respecto de `.mcp.json`

Codex **no expande `${VAR}`** dentro de `args` ni dentro de los valores de `[mcp_servers.X.env]`. Un placeholder ahí llega al server como texto literal. Los secretos se reenvían **por nombre** desde el entorno del proceso:

- `env_vars = ["NOMBRE", ...]` en un server stdio reenvía esas variables al proceso hijo.
- `bearer_token_env_var = "NOMBRE"` en un server HTTP manda `Authorization: Bearer <valor>`.
- `[mcp_servers.X.env]` queda para settings literales, nunca para secretos.

Dos servidores se adaptan por eso; los otros dos conservan su forma:

| Server     | En `.mcp.json` / `opencode.jsonc`                             | En `.codex/config.toml`                                                                            |
| ---------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `context7` | stdio `bunx -y @upstash/context7-mcp`                         | igual, sin secreto                                                                                 |
| `tavily`   | stdio `mcp-remote https://mcp.tavily.com/mcp/?tavilyApiKey=…` | Streamable HTTP: `url = "https://mcp.tavily.com/mcp/"` + `bearer_token_env_var = "TAVILY_API_KEY"` |
| `supabase` | `--access-token ${SUPABASE_ACCESS_TOKEN}` en `args`           | sin flag; `SUPABASE_ACCESS_TOKEN` + URL + keys en `env_vars` (fallback documentado del paquete)    |
| `n8n`      | `env` con `N8N_API_URL` / `N8N_API_KEY` + literales           | `env_vars = ["N8N_API_URL", "N8N_API_KEY"]` + `[mcp_servers.n8n.env]` con los literales            |

`bun run agents:compat:check` compara los **nombres de variables de `.env`** de los que depende cada host y la existencia de cada servidor, no la forma literal del comando, así que estas adaptaciones pasan el gate y un servidor agregado solo acá (o solo en otro host) lo hace fallar.

### El archivo real

```toml
[shell_environment_policy]
inherit = "core"

[mcp_servers.context7]
command = "bunx"
enabled = true
args = ["-y", "@upstash/context7-mcp"]

[mcp_servers.tavily]
url = "https://mcp.tavily.com/mcp/"
bearer_token_env_var = "TAVILY_API_KEY"
enabled = true

[mcp_servers.supabase]
command = "bunx"
enabled = true
args = ["-y", "@supabase/mcp-server-supabase@latest"]
env_vars = [
  "SUPABASE_ACCESS_TOKEN",
  "NEXT_PUBLIC_SUPABASE_URL",
  "SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SECRET_KEY",
]

[mcp_servers.n8n]
command = "npx"
enabled = true
args = ["-y", "n8n-mcp"]
env_vars = ["N8N_API_URL", "N8N_API_KEY"]

[mcp_servers.n8n.env]
MCP_MODE = "stdio"
LOG_LEVEL = "error"
DISABLE_CONSOLE_OUTPUT = "true"
```

El commiteado lleva además comentarios que explican cada adaptación. `docs/mcp/codex.template.toml` es una copia derivada de este archivo más servidores opt-in (Playwright, OpenAPI, DBHub, Atlassian, Postman, etc.) con placeholders `{{VAR}}`: para sumar uno, copiá su bloque a `.codex/config.toml`, agregalo también a `.mcp.json` y `opencode.jsonc`, y corré `bun run agents:compat:check`.

### Agregar o inspeccionar MCPs

```bash
codex mcp list                                  # ver los servidores cargados
codex mcp add nombre -- npx -y paquete          # agrega en ~/.codex/config.toml (global)
codex mcp --help
```

Dentro de la sesión, `/mcp` lista los servidores activos. Si `.codex/config.toml` no aparece, el repo no está trusted (ver arriba).

---

## 🎭 Hook de personalidad

`.codex/hooks.json`:

```json
{
  "hooks": {
    "UserPromptSubmit": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "root=\"$(git rev-parse --show-toplevel)\" && node \"$root/.agents/hooks/personality-reinject.mjs\"",
            "commandWindows": "powershell.exe -NoProfile -Command \"$root = git rev-parse --show-toplevel; if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }; node (Join-Path $root '.agents/hooks/personality-reinject.mjs')\"",
            "timeout": 5,
            "statusMessage": "Loading output contract..."
          }
        ]
      }
    ]
  }
}
```

El emisor es `.agents/hooks/personality-reinject.mjs`, el mismo que ejecuta Claude Code desde `.claude/settings.json` y que OpenCode importa desde `.opencode/plugins/personality-reinject.js`. Reinyecta en cada turno el contrato de salida de `AGENTS.md` §2 (PM Voice, Butler, Visual Mapping) para que no se diluya en sesiones largas. Codex resuelve la raíz con `git rev-parse` porque no expone una variable de directorio de proyecto como `$CLAUDE_PROJECT_DIR`. Requiere `node` y `git` en el `PATH`.

---

## 🧩 Qué NO existe en Codex

- **Plugins de Claude Code** (Engram, caveman): no se instalan. Las reglas de `AGENTS.md` que los mencionan (§1 #11, §12) son no-ops en Codex.
- **Trailer `Claude-Session:`** en commits: solo se emite cuando el harness expone un puntero a la transcripción (Claude Code). En Codex los commits no llevan trailer de sesión (Critical Rule #3).
- **Wrappers de comando**: ver la tabla de arriba; se pide la skill + modo.

---

## 🐛 Troubleshooting

### Los MCPs no aparecen en `/mcp`

1. Confirmá que el repo está trusted (`bun run setup:doctor` lo recuerda como WARN).
2. Lanzaste con `bun run codex`, no con `codex` a secas.
3. `bun run agents:compat:check` en verde: si falla, el TOML y los otros dos configs divergieron.

### 401 / 403 en Tavily o Supabase

La variable no estaba en el entorno cuando Codex spawneó el server. Revisá `.env` (`TAVILY_API_KEY`, `SUPABASE_ACCESS_TOKEN`) y **reiniciá la sesión**: las variables se leen una sola vez al arrancar el MCP (Critical Rule #9 aplica a los tres harnesses).

### El hook no imprime el contrato

`node` o `git` no están en el `PATH` del proceso de Codex, o el repo no está trusted. Probá a mano desde la raíz: `node .agents/hooks/personality-reinject.mjs` tiene que imprimir una línea que empieza con `OUTPUT CONTRACT`.

---

## 📚 Recursos

- **Codex MCP**: https://developers.openai.com/codex/mcp/
- **Arquitectura de tres harnesses**: `AGENTS.md` §5.5 y la página publicada [harnesses.es.html](https://upex-galaxy.github.io/agentic-dev-boilerplate/harnesses.es.html) (fuente: `packages/pages-home/harnesses.es.html`)
- **Sintaxis por herramienta**: [`docs/mcp/mcp-configuration-guide.md`](../../mcp/mcp-configuration-guide.md)

---

**Última actualización**: 2026-09-03
