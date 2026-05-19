# Documentación del Proyecto

> **Idioma:** Español

Bienvenido a la documentación del **AI-Driven Project Starter**.

Esta documentación está orientada a **humanos** — para aprender conceptos, entender metodologías y seguir guías paso a paso.

> **Nota**: Para el contexto **operativo** que la AI carga cada sesión, consulta `CLAUDE.md` y `CLAUDE.md` en la raíz del repo. El resto del comportamiento de la AI vive en skills (`.claude/skills/`) y commands (`.claude/commands/`).

---

## Estructura de Documentos

```
docs/
├── methodology/                  # Metodologías de testing y QA
│   ├── IQL-methodology.md        # Integrated Quality Lifecycle
│   ├── early-game-testing.md     # Fase shift-left
│   ├── mid-game-testing.md       # Fase de desarrollo activo
│   ├── late-game-testing.md     # Fase de regresión
│   └── jira-platform.md          # Uso de Jira en el flujo
│
├── setup/                        # Guías de configuración
│   ├── jira-setup-guide.md       # Configurar Jira/Atlassian
│   └── mcp/                      # Guías per-cliente MCP (claude-code, gemini-cli, …)
│
├── mcp/                          # Templates copy-pasteables de MCP (.mcp.json, opencode.json, …)
│
├── workflows/                    # Flujos de trabajo
│   ├── environments.md           # Ambientes dev, staging, prod
│   ├── git-flow.md               # Flujo Git para desarrollo asistido por AI
│   └── sync-openapi-guide.md     # Uso de `bun run api:sync`
│
├── architectures/                # Guías específicas por stack
│   └── supabase-nextjs/          # Configuración Supabase + Next.js
│
└── context-engineering.md        # Estrategia de context engineering
```

---

## Metodología

La metodología de testing está basada en **IQL (Integrated Quality Lifecycle)**.

| Documento                                                    | Descripción                        |
| ------------------------------------------------------------ | ---------------------------------- |
| [IQL-methodology.md](./methodology/IQL-methodology.md)       | Vista completa de IQL              |
| [early-game-testing.md](./methodology/early-game-testing.md) | Testing shift-left                 |
| [mid-game-testing.md](./methodology/mid-game-testing.md)     | Desarrollo + automatización        |
| [late-game-testing.md](./methodology/late-game-testing.md)   | Regresión y producción             |
| [jira-platform.md](./methodology/jira-platform.md)           | Uso de Jira en el flujo end-to-end |

---

## Guías de Configuración

| Documento                                          | Descripción                                                      |
| -------------------------------------------------- | ---------------------------------------------------------------- |
| [jira-setup-guide.md](./setup/jira-setup-guide.md) | Configurar credenciales y MCP de Atlassian/Jira                  |
| [setup/mcp/](./setup/mcp/)                         | Guías per-cliente (claude-code, gemini-cli, copilot-cli, vscode) |
| [mcp/](./mcp/)                                     | Templates copy-pasteables (`cp docs/mcp/*.template.* …`)         |

---

## Workflows

| Documento                                                  | Descripción                                      |
| ---------------------------------------------------------- | ------------------------------------------------ |
| [environments.md](./workflows/environments.md)             | Guía de ambientes de desarrollo                  |
| [git-flow.md](./workflows/git-flow.md)                     | Flujo Git para desarrollo asistido por AI        |
| [sync-openapi-guide.md](./workflows/sync-openapi-guide.md) | `bun run api:sync` — sincronizar OpenAPI + tipos |

---

## Guías Específicas por Arquitectura

Guías para stacks tecnológicos específicos:

| Arquitectura           | Descripción                      | Ruta                                                 |
| ---------------------- | -------------------------------- | ---------------------------------------------------- |
| **Supabase + Next.js** | PostgreSQL + PostgREST + Next.js | [supabase-nextjs/](./architectures/supabase-nextjs/) |

> **Nota**: Conceptos genéricos de testing pertenecen a `methodology/`. Solo configuraciones específicas de cada stack van en `architectures/`.

---

## Inicio Rápido

### 1. Entender la Metodología

Lee la [Metodología IQL](./methodology/IQL-methodology.md) para entender las fases de testing.

### 2. Configurar Tus Herramientas

- Jira / Atlassian: [jira-setup-guide.md](./setup/jira-setup-guide.md)

### 3. Aprender los Workflows

- [Flujo Git](./workflows/git-flow.md) para control de versiones
- [Ambientes](./workflows/environments.md) para etapas de deployment
- `bun up --help` para sincronizar este boilerplate upstream

### 4. Usar Skills y Commands de Claude Code

El comportamiento operativo (cómo crear historias, cómo planificar, cómo ejecutar el sprint) vive en skills bajo `.claude/skills/`. Cada skill se invoca con `/<nombre>` (por ejemplo `/sprint-development`, `/project-foundation`). Lista completa en `CLAUDE.md` sección **Skills**.

---

## Relación con `.context/` y `.claude/`

| Directorio          | Audiencia | Propósito                                                           |
| ------------------- | --------- | ------------------------------------------------------------------- |
| `docs/`             | Humanos   | Aprendizaje, tutoriales, referencia                                 |
| `.context/`         | AI        | Memoria persistente del proyecto (PRD, SRS, business map, PBI)      |
| `.claude/skills/`   | AI        | Workflows ejecutables (skills auto-cargadas por Claude Code)        |
| `.claude/commands/` | AI        | Slash commands de utilidad (`/sync-ai-memory`, `/business-*`, etc.) |
| `CLAUDE.md`         | AI        | Operational context cargado en cada sesión                          |

**Regla general**:

- Si un humano necesita **aprender** algo → `docs/`
- Si la AI necesita **recordar** algo del proyecto → `.context/`
- Si la AI necesita **ejecutar** un workflow → `.claude/skills/`

---

## Contribuir

Para agregar documentación:

1. **Educacional / Tutorial** → Agregar al subdirectorio apropiado de `docs/`
2. **Workflow ejecutable para AI** → Crear o editar una skill en `.claude/skills/<nombre>/SKILL.md`
3. **Slash command de utilidad** → Crear o editar un command en `.claude/commands/<nombre>.md`

### Agregar Nuevas Arquitecturas

1. Crear carpeta: `docs/architectures/{nombre-stack}/`
2. Agregar `README.md` con overview de la arquitectura
3. Agregar guías de configuración específicas
4. Mantener conceptos genéricos en `docs/methodology/`

---

**Última actualización**: 2026-05-07
