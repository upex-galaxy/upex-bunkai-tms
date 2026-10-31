# Configuración de MCP para Claude Code

**Claude Code** es la herramienta CLI oficial de Anthropic para codificación asistida directamente desde la terminal.

> 💡 Para conceptos generales de MCP, consulta [MCP - Guía General](./README.md)

---

## 🚀 Quick Start

### Setup Inicial

La primera vez que uses Claude Code basta con lanzarlo: el login y la inicialización son automáticos.

```bash
claude
```

> ⚠️ El flag `--dangerously-skip-permissions` NO es parte del setup: desactiva TODOS los prompts de permisos y solo tiene sentido en sandboxes desechables. No lo uses en tu máquina de trabajo.

**En este boilerplate**: Claude Code se abre con su propio binario en la carpeta del proyecto (`claude`) o con la app de escritorio. No hay script envoltorio: nada carga `.env` en el proceso del agente, así que ningún secreto llega al shell de la IA (ADR-0016). Cada servidor MCP que necesita valores de `.env` arranca con el loader de `.env`, `bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter <sus variables> -- <servidor>`, que lee `.env` al arrancar el servidor y le pasa solo las variables de su filtro, sin importar quién lanzó el harness. Un comando que corre el agente y necesita un valor lo corre por el loader en un subproceso: `bunx varlock run -- sh -c '<comando que usa "$VAR">'` (los scripts de `bun` cargan `.env` solos). Si un MCP se comporta como si `.env` no existiera, `bun run vars:env:check` nombra la variable que el shell exporta con otro valor (varlock deja ganar al heredado; muestra solo nombres y largos).

**Lanzamientos sin línea de comando** (la app de escritorio, un worker supervisado): no necesitan nada extra, porque el loader lee `.env` igual. Después de un cambio de `.env`, reiniciá la sesión. Una instalación vieja escribía una copia en texto plano en el bloque `env` de `.claude/settings.local.json`; `bun run harness:env` la retira (si coincide con `.env` la borra, si no la mueve a `.auth/harness-env-backup/` y la nombra) y `bun run harness:env:check` sale con 1 mientras quede una.

**Tres harnesses, un solo inventario**: los servidores que declara `.mcp.json` viven también en `opencode.jsonc` (OpenCode) y en `.codex/config.toml` (Codex CLI + Desktop, ver [codex.md](./codex.md)). `bun run agents:compat:check` toma `.mcp.json` como conjunto canónico, normaliza los tres formatos y falla si un servidor falta en otro host, existe en un solo host o depende de otras variables de `.env`. Si agregás un servidor acá, agregalo en los otros hosts en uso (`harnesses:` en `.agents/project.yaml`). Las instrucciones (`AGENTS.md`, que Claude Code lee vía el shim `CLAUDE.md`) y las skills (`.agents/skills/`, alias generado `.claude/skills`) también son una sola copia: ver `.agents/instructions/agent-harnesses.md` §5.5.

**Qué NO va en `.mcp.json`**: la búsqueda web (Exa primero, Tavily segundo) se conecta una vez por máquina, en el scope `user` o como conector de claude.ai; la automatización de browser es `playwright-cli`, no un MCP (`.agents/instructions/agent-tool-resolution.md` §6). Las skills piden capacidades, no servidores: `.agents/skills/agentic-dev-core/references/mcp-capabilities.md`.

### Archivos de Configuración

Claude Code usa un sistema jerárquico:

1. **Local** (scope `local`, guardado en `~/.claude.json` por proyecto): mayor prioridad
2. **Proyecto** (`.mcp.json` en la raíz del proyecto, commiteado al repo)
3. **Usuario** (scope `user` en `~/.claude.json`): configuración global

### Scopes de Configuración

- `user`: global para todos los proyectos
- `project`: específico del proyecto actual (archivo `.mcp.json`, compartido con el equipo)
- `local`: privado tuyo para el proyecto actual

---

## 📝 Configuración de MCPs

### Método 1: Mediante CLI (scope `user` o `local`)

```bash
# Servidor stdio
claude mcp add -t stdio -s user mi-servidor -- npx -y @paquete/servidor

# Servidor HTTP
claude mcp add --transport http --scope user notion https://mcp.notion.com/mcp

# Listar / eliminar
claude mcp list
claude mcp remove mi-servidor
```

### Método 2: Edición manual de `.mcp.json` (scope `project`)

Para un servidor que el equipo comparte. Copiá el bloque del template opt-in ([`docs/mcp/claude.template.json`](../../mcp/claude.template.json)) y replicalo en los otros dos hosts:

```json
{
  "mcpServers": {
    "postman": {
      "type": "http",
      "url": "https://mcp.postman.com/mcp",
      "headers": {
        "Authorization": "Bearer ${POSTMAN_API_KEY}"
      }
    }
  }
}
```

> **Nota**: Claude Code NO soporta el bloque `inputs` / `${input:...}` (eso es sintaxis de VS Code). En un servidor remoto (`type: "http"`) los secretos se referencian como `${VAR}` (o `${VAR:-default}`) y se expanden desde el entorno del proceso del harness, donde `.env` ya no llega en ningún lanzamiento: preferí el login OAuth del servidor (como el MCP remoto de Atlassian vía `mcp-remote`); si el servidor solo acepta token, exportá esa ÚNICA variable en el shell antes de lanzar, sabiendo que queda en el entorno del agente; un servidor stdio que necesita valores de `.env` usa el loader de `.env` en su lugar, sin `${VAR}` al lado. **Si la variable falta, Claude Code no avisa**: pasa `${VAR}` como texto literal y el servidor falla recién en su primera llamada autenticada. El chequeo es `/mcp` dentro de la sesión (`AGENTS.md` Critical Rule #9).

---

## 🔧 Transportes Soportados

- ✅ **stdio**: servidores locales; los únicos que este repo commitea
- ✅ **HTTP Streamable** (`type: "http"`): el transporte recomendado para servidores remotos
- ⚠️ **SSE**: deprecado en el estándar MCP. Si un servicio solo expone SSE, agregalo igual con `--transport http`: Claude Code prueba HTTP y cae a SSE cuando el servidor no lo acepta. `--transport sse` sigue disponible para conectar directo.

---

## 🎯 Características Especiales

### Sistema Jerárquico

Local > Project > User. Ante nombres repetidos, el scope local gana sobre el `.mcp.json` del proyecto, y este sobre la configuración global de usuario.

### Conectores de claude.ai

Un conector que conectás en la configuración de claude.ai aparece en la sesión con prefijo `mcp__claude_ai_<conector>__`. Las skills lo resuelven igual que a un servidor local: por el sufijo del nombre de la tool, no por el prefijo.

### Variables de Entorno

Claude Code expande `${VAR}` y `${VAR:-default}` en `command`, `args`, `env`, `url` y `headers`, desde el entorno del proceso. Los servidores stdio de este repo no lo usan: arrancan con el loader de `.env` (`varlock run --filter`), que funciona también desde la app de escritorio, sin entorno de proceso.

---

## 🐛 Troubleshooting

### 401 / 403 o una tool que falla sin explicación

La variable falta o está vacía. Revisá `.env` contra `.env.example` (`bunx varlock load --agent` muestra, redactado, qué valor falla el schema) y **reiniciá la sesión**: el loader lee `.env` al arrancar el MCP.

### "Permission denied"

Revisá los permisos configurados (`/permissions` dentro de la sesión, o `settings.json` / `settings.local.json` en `.claude/`). NO uses `--dangerously-skip-permissions` como atajo fuera de un sandbox desechable.

### Servidor no se encuentra

Verificá que el binario esté en el `PATH` del proceso (`which npx`, `which bunx`), o usá rutas absolutas en `command`.

### Herramientas no aparecen

1. `/mcp` dentro de la sesión: muestra el estado de cada servidor y permite reconectar o autenticar.
2. `bun run agents:compat:check`: si falla, `.mcp.json` divergió de los otros dos hosts.
3. Reiniciá Claude Code después de cambiar la configuración.

---

## 📚 Recursos Adicionales

- **Documentación Oficial**: https://docs.anthropic.com/en/docs/claude-code/mcp
- **Conceptos MCP**: [MCP - Guía General](./README.md)
- **Configs del repo y templates opt-in**: [`docs/mcp/README.md`](../../mcp/README.md)
