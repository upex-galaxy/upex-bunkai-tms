# Documentación del Proyecto

> **Idioma:** Español

Bienvenido a la documentación del **AI-Driven Project Starter**.

Esta documentación está orientada a **humanos** — para aprender conceptos, entender metodologías y seguir guías paso a paso.

> **Nota**: Para el contexto **operativo** que la AI carga cada sesión, consulta `AGENTS.md` y `CONTEXT.md` en la raíz del repo (`CLAUDE.md` es solo un shim de una línea, `@AGENTS.md`, para que Claude Code llegue al mismo archivo). El resto del comportamiento de la AI vive en skills (`.agents/skills/`, leídas por Claude Code, OpenCode y Codex) y en los slash commands generados (`.claude/commands/`, `.opencode/commands/`), que son alias hacia una skill y un modo.

---

## Arquitectura

| Documento                                                                                             | Descripción                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [Una fuente, tres harnesses](https://upex-galaxy.github.io/agentic-dev-boilerplate/harnesses.es.html) | Cómo el mismo repositorio corre en Claude Code, OpenCode y Codex desde una sola fuente: qué es canónico, qué se genera, y qué pasa al actualizar un proyecto creado antes del cambio. Página publicada, con diagramas. |
| [ADR-0002](../.context/ADR/ADR-0002-multi-harness-single-source.md)                                   | Registro de la decisión (contexto, alternativas descartadas, consecuencias). En inglés.                                                                                                                                |

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
├── mcp/                          # Templates opt-in de MCP para hosts sin adapter (gemini-cli, cursor, …)
│
├── workflows/                    # Flujos de trabajo
│   ├── environments.md           # Ambientes dev, staging, prod
│   ├── git-flow.md               # Flujo Git para desarrollo asistido por AI
│   └── sync-openapi-guide.md     # Uso de `bun run api:sync`
│
├── architectures/                # Guías específicas por stack
│   └── supabase-nextjs/          # Configuración Supabase + Next.js
│
├── agentic-development-engineering.md  # Ingeniería del ciclo de desarrollo agéntico
├── ai-personality.md             # Espejo humano del contrato de personalidad de la AI
└── onboarding.html               # Tour de onboarding interactivo (HTML standalone)
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

### 4. Usar Skills y Commands

El comportamiento operativo (cómo crear historias, cómo planificar, cómo ejecutar el sprint) vive en skills bajo `.agents/skills/`, la única copia que leen Claude Code, OpenCode y Codex. Cada skill se invoca con `/<nombre>` (por ejemplo `/sprint-development`, `/project-foundation`). Lista completa en `AGENTS.md` sección **Skills**. Los slash commands (`/business-data-map`, `/sync-ai-memory`, etc.) son alias generados hacia una skill y un modo; en Codex no hay wrappers, se invoca la skill directamente.

---

## Relación con `.context/`, `.agents/` y los adapters por harness

| Directorio / archivo                         | Audiencia | Propósito                                                                                   |
| -------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| `docs/`                                      | Humanos   | Aprendizaje, tutoriales, referencia                                                         |
| `.context/`                                  | AI        | Memoria persistente del proyecto (PRD, SRS, business map, PBI, ADR)                         |
| `.agents/skills/`                            | AI        | Workflows ejecutables: la única copia, leída por los tres harnesses                         |
| `.agents/compatibility/command-aliases.json` | AI        | Manifiesto de alias: fuente de todos los slash commands generados                           |
| `.claude/`, `.opencode/`, `.codex/`          | AI        | Adapters por harness (hook, MCP, wrappers generados). Nunca una segunda copia del contenido |
| `AGENTS.md`                                  | AI        | Operational context cargado en cada sesión, en cualquier harness                            |
| `CLAUDE.md`                                  | AI        | Shim de una línea (`@AGENTS.md`) para Claude Code. Generado, nunca lleva prosa              |

**Regla general**:

- Si un humano necesita **aprender** algo → `docs/`
- Si la AI necesita **recordar** algo del proyecto → `.context/`
- Si la AI necesita **ejecutar** un workflow → `.agents/skills/`

---

## Contribuir

Para agregar documentación:

1. **Educacional / Tutorial** → Agregar al subdirectorio apropiado de `docs/`
2. **Workflow ejecutable para AI** → Crear o editar una skill en `.agents/skills/<nombre>/SKILL.md`
3. **Slash command de utilidad** → Declarar el alias en `.agents/compatibility/command-aliases.json` y correr `bun run agents:compat` (los wrappers en `.claude/commands/` y `.opencode/commands/` se generan; no se editan a mano)

### Agregar Nuevas Arquitecturas

1. Crear carpeta: `docs/architectures/{nombre-stack}/`
2. Agregar `README.md` con overview de la arquitectura
3. Agregar guías de configuración específicas
4. Mantener conceptos genéricos en `docs/methodology/`

---

**Última actualización**: 2026-09-03
