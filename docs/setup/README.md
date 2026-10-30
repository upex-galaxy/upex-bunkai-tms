# Guías de Configuración

> **Idioma:** Español
> Guías de configuración y setup para herramientas y MCPs.

---

## Contenido

| Documento                                    | Descripción                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [Jira (lado dev)](#jira-lado-dev)            | Conectar el repo a tu sitio de Jira: host, credenciales, catálogos, caché local                   |
| [mcp/README.md](./mcp/README.md)             | MCP: conceptos, transportes, capacidades y la matriz de configs por harness (Claude Code, OpenCode, Codex) |
| [mcp/claude-code.md](./mcp/claude-code.md)   | MCP en Claude Code (`.mcp.json`, el binario `claude`, el loader de `.env`)                        |
| [mcp/codex.md](./mcp/codex.md)               | Codex CLI + Desktop: `AGENTS.md`, `.agents/skills/`, `.codex/config.toml`, trust, loader de `.env` |

---

## Inicio Rápido

1. **Vas a conectar el repo a Jira?** → [Jira (lado dev)](#jira-lado-dev)
2. **Vas a usar Codex CLI o Codex Desktop?** → [mcp/codex.md](./mcp/codex.md)
3. **Querés entender cómo se reparten los MCPs entre harnesses?** → [mcp/README.md](./mcp/README.md)

---

## Jira (lado dev)

El repo habla con Jira por `acli` y por scripts propios; Jira es la fuente de verdad de las historias y `.context/PBI/` es solo una caché local. Pasos, en orden:

1. **Host.** `bun run agents:setup` completa `.agents/project.yaml`, incluido `issue_tracker.atlassian_url`. Ese es el ÚNICO lugar del host: no va en `.env` (`.agents/instructions/agent-project-variables.md` §7). `bun run --silent jira:url` lo imprime.
2. **Credenciales.** `ATLASSIAN_EMAIL` y `ATLASSIAN_API_TOKEN` en `.env` (el instalador las pide en `bun setup`). Nunca en el yaml versionado.
3. **Catálogos.** `bun run jira:sync-fields`, `bun run jira:sync-workflows` y `bun run jira:sync-link-types` generan los catálogos de `.agents/` con los ids de TU instancia.
4. **Validación.** `bun run jira:check` compara esos catálogos contra el manifiesto `.agents/jira-required.yaml` y falla si falta un campo requerido. Un campo que tu instancia no tiene usa el fallback a comentario que declara el manifiesto.
5. **Caché local.** `bun run context:hydrate` reconstruye `.context/PBI/` desde Jira (gitignored, se regenera cuando haga falta).

Para operar tickets desde el agente: skill `/acli`. Para administrar el proyecto de Jira (componentes, o mover el repo a otro sitio de Atlassian): skill `/jira-administration`, modos `components` e `instance-migration`. Los comandos exactos están en `package.json`.

---

**Ver También:**

- `docs/architectures/` - Configuración específica por arquitectura
- `docs/mcp/` - Templates MCP opt-in y guía de sintaxis por host
- `.agents/instructions/agent-harnesses.md` §5.5 - Un solo origen, tres harnesses (qué se genera y qué se versiona)
