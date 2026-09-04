# Guías de Configuración

> **Idioma:** Español
> Guías de configuración y setup para herramientas y MCPs.

---

## Contenido

| Documento                                    | Descripción                                                                                       |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [jira-setup-guide.md](./jira-setup-guide.md) | Configuración de Jira + Xray como TMS                                                             |
| [mcp/README.md](./mcp/README.md)             | MCP: conceptos, transportes y la matriz de configs por harness (Claude Code, OpenCode, Codex)     |
| [mcp/claude-code.md](./mcp/claude-code.md)   | MCP en Claude Code (`.mcp.json`, `bun run claude`)                                                |
| [mcp/codex.md](./mcp/codex.md)               | Codex CLI + Desktop: `AGENTS.md`, `.agents/skills/`, `.codex/config.toml`, trust, `bun run codex` |

---

## Inicio Rápido

1. **¿Necesitas configurar Jira/Xray?** → [jira-setup-guide.md](./jira-setup-guide.md)
2. **¿Vas a usar Codex CLI o Codex Desktop?** → [mcp/codex.md](./mcp/codex.md)
3. **¿Querés entender cómo se reparten los MCPs entre harnesses?** → [mcp/README.md](./mcp/README.md)

---

**Ver También:**

- `docs/architectures/` - Configuración específica por arquitectura
- `docs/mcp/` - Templates MCP opt-in y guía de sintaxis por herramienta
- `AGENTS.md` §5.5 - Un solo origen, tres harnesses (qué se genera y qué se versiona)
