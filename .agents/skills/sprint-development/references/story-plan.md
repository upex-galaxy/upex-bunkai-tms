Actúa como Senior Full-Stack Developer + UI/UX Designer.

---

## Custom field resolution — slug-based, never hardcoded

Las IDs numéricas de Jira (`customfield_NNNNN`) varían por workspace y NO viven en este skill. Esta metodología resuelve cada campo en runtime vía `{{jira.<slug>}}` contra el catálogo canónico en `.agents/jira-required.yaml`. El AI runtime resuelve el slug → ID numérico vía `.agents/jira-fields.json` (poblado por `bun run jira:sync-fields`). Si un slug no existe en el workspace de destino, el catálogo declara el fallback y `bun run jira:check` warnea.

**Slugs que este workflow lee/escribe** (semántica de cada campo):

- `{{jira.acceptance_test_plan}}` — Acceptance Test Plan (Story-level Textarea). Fuente de los escenarios de aceptación que la implementación debe cubrir. Solo lectura desde este flujo.
- `{{jira.spec_implementation_plan}}` — Spec Implementation Plan (Story-level Textarea). Plan técnico generado por este flujo y publicado a la Story.

**Operación → tool layer.** Toda escritura/lectura contra Jira se expresa como `[ISSUE_TRACKER_TOOL]` pseudo-código. El skill consumidor (AI runtime) resuelve la herramienta vía la tabla `.agents/instructions/agent-tool-resolution.md` §6 (primary `/acli`, fallback Atlassian MCP, last resort REST). Para la matriz operación → capa de herramienta, ver `.agents/skills/product-management/references/jira-operations.md`. Para gotchas de publicación a campos rich-text (ADF), ver `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

---

**Input:**

- Story: [usar .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/story.md]
- **Acceptance Test Plan (artefacto de la fase de planning):** Es una lectura DETALLADA, así que SIEMPRE se materializa primero vía sync, nunca se lee por `view`. Ramifica por modalidad (resuelta en planning):
  1. **Modality jira-native** — ATP vive en el campo `{{jira.acceptance_test_plan}}` de la Story: `bun run jira:sync-issues get <STORY_KEY> --include-comments` materializa el campo + comentarios; lee `.context/PBI/epics/.../stories/.../acceptance-test-plan.md` (si el campo está ausente la sync emite un stub apuntando al comentario fallback) y `comments.md` (para "Test Case", "TC-", "Scenario:", o tablas de test cases).
  2. **Modality jira-xray** — ATP vive en un issue `Test Plan` enlazado a la Story (su `description` contiene el cuerpo del ATP): `bun run jira:sync-issues get <ATP_KEY>` materializa `.context/PBI/test-plans/TESTPLAN-<ATP_KEY>-<slug>.md`; léelo. El `<ATP_KEY>` sale del enlace "tests" / "is tested by" de la Story (visible en `story.md` / `comments.md`). NUNCA uses `get <STORY_KEY>` para leer un ATP de Xray.
  3. **Fallback final**: `comments.md` / la descripción de la issue — ahí cae el comentario fallback `## Acceptance Test Plan` cuando el custom field está ausente (per `.agents/jira-required.yaml`).
- Feature Implementation Plan: [usar .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/feature-implementation-plan.md — materializado por la sync desde el campo `{{jira.feature_implementation_plan}}` del Epic]
- SRS relevante: [usar secciones relacionadas de .context/SRS/; sin SRS, las secciones de los mapas de negocio que nombra `../SKILL.md` → "Product docs: PRD/SRS or business maps"]
- **Design System:** [usar `DESIGN.md` (tokens y personalidad visual) y, en stories con UI, `.context/design/master-design-plan.md` §8 (fila US→Screen) → §4 (spec de pantalla) + el mockup en `.context/designs/` (Critical Rule #14)]

**⚠️ IMPORTANTE - Jira es la fuente de verdad para el Acceptance Test Plan:**
Los escenarios del Acceptance Test Plan (definidos durante la fase de planning) son los que la implementación DEBE cubrir. Cada escenario debe mapearse a un step de implementación (línea **Covers** del step) para garantizar cobertura completa. NO omitir ninguno.

**Autor del plan → Jira → sync → lee.** NO escribas a mano `implementation-plan.md`. Es un archivo `[SYNC]` (read-only cache): redacta el plan en sesión, publícalo al campo `{{jira.spec_implementation_plan}}` de la Story (o comentario fallback per `.agents/jira-required.yaml`), corre `bun run jira:sync-issues get <STORY_KEY> --include-comments`, y lee el `implementation-plan.md` materializado en `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/`. El cuerpo del plan sigue el esqueleto de abajo.

---

## Cómo escribir el plan (estas reglas NO se publican)

Lo que se publica es solo el cuerpo entre los marcadores `plan-body`. Todo lo de esta sección guía la redacción y se queda en el skill: copiarlo al cuerpo gasta presupuesto de Jira (ver "Presupuesto de tamaño" abajo) sin darle nada al revisor.

- **Verificar antes de decidir.** Si el enfoque usa librerías externas, consultá Context7 MCP para confirmar que los métodos y hooks existen en la versión del proyecto (ej.: Supabase Auth, React Query, Next.js App Router). Si el proyecto usa shadcn/ui, buscá en shadcn MCP antes de planear un componente nuevo (dialog, form, data-table). El plan registra el enfoque elegido, no la consulta.
- **Promoción a ADR.** Las decisiones del plan son story-local (qué hook, qué componente, un trade-off de un archivo). Si una pasa el **doble filtro** (arquitectónica Y difícil de revertir: toca muchos archivos, migra datos o impone un invariante cross-cutting), promovela a `ADR-NNNN-<slug>.md` en `.context/ADR/` y dejá en el plan solo el backlink (`See ADR-NNNN`). Detección + procedimiento: `agentic-dev-core/references/adr-doctrine.md`; template + lifecycle: `.context/ADR/README.md`. Estado: una decisión que el humano ya aprobó (plan aprobado, respuesta en el chat, deck de decisiones) va `Accepted`, citando dónde se aprobó; solo una pregunta todavía abierta va `Proposed`.
- **Tipos del backend.** Los componentes importan los tipos por donde la app ya los expone (greenfield: `@/lib/types`, derivados de `{{stack.database.types_path}}`; alias de la app: `{{stack.conventions.import_alias}}`), las props se tipan con ellos, el mock data cumple su estructura y los schemas de Zod usan `z.infer<>`. El plan nombra los tipos que usa y los que crea; no pega el código.
- **UI.** Aplica Critical Rule #14 (`AGENTS.md`): la UI viva es la referencia, el mockup es inspiración; inspeccioná y reutilizá los componentes existentes y nunca inventes UI. La personalidad visual (bordes, sombras, espaciado, hover) y la paleta ya están congeladas en `DESIGN.md`: el plan no las repite. Un diagrama ASCII de layout entra solo cuando no hay mockup que citar.
- **Copy real.** Los textos salen del vocabulario de `.context/business/domain-glossary.md` y del PRD (`executive-summary.md`, `user-personas.md`), con el tono del producto; sin PRD, del glosario y del copy que la UI viva ya usa. Nada de frases genéricas ("Bienvenido a nuestra plataforma", "La mejor solución para...").
- **Base de datos.** El plan describe los cambios de schema; no incluye SQL estático. El cambio se aplica durante la implementación por el DB MCP según `{{stack.database.migrations_tool}}`, después de leer el historial de migraciones por el mismo MCP (`agentic-dev-core/references/db-change-doctrine.md`); una story sin cambios de base de datos no necesita la capability `db`. Sin MCP en una story que sí la necesita: STOP per `agentic-dev-core/references/mcp-capabilities.md` §4.
- **Steps.** Específicos y ejecutables, cada uno con su testing y su estimación; la suma coincide con los story points de `story.md`. El último step integra y corre el escenario E2E completo.
- **Lo que no va en el cuerpo.** El Definition of Done genérico vale para toda story y lo verifican Stage 2-4 de `/sprint-development`; el plan lista solo los checks propios de esta story. Genérico: código según el plan; todos los AC pasando; tipos del backend sin type errors; personalidad de `DESIGN.md` y copy del dominio aplicados; middleware actualizado si hay rutas privadas nuevas; tests unitarios (cobertura según `unit-testing/references/test-coverage.md`: metas por tipo de código, piso y no meta), de integración y E2E (los TC del ATP) pasando; lint, build y TypeScript limpios; code review aprobado; deploy a staging con smoke test en desktop y mobile. Lo que ya dice el Feature Implementation Plan del Epic se enlaza, no se repite.
- **Detalle de trabajo.** Specs largas de componentes, payloads de API o notas de schema que solo sirven para implementar van a `.session/sprint-development/<STORY_KEY>/notes.md` (notas de trabajo locales; esta skill nunca escribe un `plan.md` bajo `.session/`, ver `agentic-dev-core/references/session-management.md` §13); nada que el revisor necesite puede vivir solo ahí.
- **Forma.** Una sección que no aplica se omite, no se publica vacía. Listas cortas antes que tablas o paneles: en ADF una tabla cuesta varias veces lo que cuesta la misma información en lista, así que una tabla entra solo cuando reemplaza varias listas paralelas, y un panel `[!WARNING]` solo para un riesgo que bloquea (`../../acli/references/adf-authoring-style.md`).

---

<!-- plan-body:start -->

# Implementation Plan: STORY-{PROJECT_KEY}-{ISSUE_NUM} - [Story Title]

## Overview

[Qué se implementa, en 1-2 oraciones.]

**Acceptance Criteria:** [AC 1]; [AC 2]; [AC 3]

## Technical Approach

- **Chosen:** [enfoque técnico]
- **Alternatives:** [A]: [por qué no]; [B]: [por qué no]
- **Trade-off:** [lo que se cede]

## UI/UX

- **Screen:** [fila §8 → spec §4 / ruta del mockup, o "DESIGN.md-only"]
- **Reused components:** [componente: uso]
- **New components:** [Nombre (`components/<domain>/<name>.tsx`)]: [propósito; props principales]
- **States:** loading [cómo], empty [mensaje + CTA], error [mensaje + retry], success [vista]
- **Validation:** [campo]: [regla] → "[mensaje]"
- **Responsive:** mobile [ajuste], tablet [ajuste], desktop [layout completo]
- **Copy:** [textos clave con vocabulario del dominio]

## Types

[Tipos del backend que usa (`Mentor` desde `@/lib/types`) y los que crea, con archivo.]

## Implementation Steps

### Step 1: [Nombre]

- **Files:** `[ruta]`
- **Task:** [qué cambia]
- **Edge cases:** [caso]: [cómo se maneja]
- **Covers:** [TC-001, AC 2]
- **Testing:** [tipo]: [qué verifica]
- **Estimate:** [tiempo]

(un step por unidad de trabajo; el último integra y corre el E2E)

## Technical Decisions

- **[Decisión]:** [elegido], porque [razón]. Trade-off: [compromiso]. [See ADR-NNNN si se promovió]

## Dependencies

- [ ] [Pre-requisito] [BLOCKER si falta]

## Risks

- **[Riesgo]** (impact H/M/L): [mitigación]

## Estimate

**Total:** [tiempo] · **Story points:** [N] (coincide con story.md)

## Story-specific Done

- [ ] [TC-001]: [nombre] pasa
- [ ] [Check propio de esta story]

<!-- plan-body:end -->

---

**Output:** El cuerpo del plan se publica al campo `{{jira.spec_implementation_plan}}` de la Story; tras la sync queda materializado en .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/implementation-plan.md (read-only cache).

---

## 📤 SINCRONIZACIÓN CON JIRA (Condicional - UPEX Workspace)

### Custom Field para Story Implementation Plan

| Slug (resuelve vía jira-required.yaml) | Nombre                           | Tipo     | Nivel |
| -------------------------------------- | -------------------------------- | -------- | ----- |
| `{{jira.spec_implementation_plan}}`    | Spec Implementation Plan (Dev)🛠️ | Textarea | Story |

### Instrucciones de Sincronización

**Flujo: autor del plan en sesión → publicar al campo Jira → sync → leer el `.md` materializado.** El `implementation-plan.md` NO se escribe a mano; es un archivo `[SYNC]` (read-only cache) que la sync genera desde el campo Jira.

1. **Verificar si la Story tiene el custom field:**
   - Verificar si el slug `{{jira.spec_implementation_plan}}` resuelve a un campo presente en el workspace (vía `.agents/jira-fields.json` / `.agents/jira-required.yaml`).

> Antes de escribir campos rich-text en Jira, leé `.agents/skills/product-management/references/jira-publishing-gotchas.md` para los dos bugs ADF conocidos y sus workarounds.

> **Presupuesto de tamaño (bloqueante).** Jira Cloud corta cada valor rich-text en 32,767 caracteres y cuenta el **ADF serializado**, no el Markdown: el plan convertido mide varias veces lo que mide en Markdown, y las tablas, listas anidadas, paneles y bloques de código son lo que más crece (mediciones: `.context/ADR/ADR-0003-forensic-measurements-ledger.md`). Antes de publicar, en el campo o en el comentario fallback, convertí y medí el cuerpo COMPLETO tal como va a quedar guardado:
>
> ```bash
> bun .agents/skills/acli/scripts/md-to-adf.ts plan.md plan.adf.json
> jq -c . plan.adf.json | wc -m        # debe quedar en 30000 o menos
> ```
>
> Más de 30,000 → **STOP antes de escribir.** Proponé qué secciones salen del plan y a dónde van, con lo que ahorra cada movimiento, y esperá la decisión del usuario. Destinos de este nivel: código de ejemplo largo sale del plan (el plan nombra archivo y símbolo; el código vive en la rama y el PR); una decisión arquitectónica difícil de revertir va a un ADR (`.context/ADR/`) y el plan la enlaza; el contexto que ya está en el Feature Implementation Plan del Epic se enlaza, no se repite; una Story que sigue sin entrar es una Story demasiado grande: proponé partirla con `/product-management`. Un rechazo de Jira por longitud (`CONTENT_LIMIT_EXCEEDED`) es el mismo STOP. Nunca truncar, nunca partir el plan en dos campos o dos comentarios, nunca quitar el formato para que entre. Las secciones de la plantilla que no aplican a este plan se omiten, no se publican vacías. Regla canónica: `.agents/skills/acli/SKILL.md` → "Size budget" (T5).

2. **Si el campo existe:**
   - Publicar el cuerpo COMPLETO del plan al campo `{{jira.spec_implementation_plan}}` de la Story vía `[ISSUE_TRACKER_TOOL]` (escritura de custom field).
   - Agregar label: `implementation-plan-ready`.

3. **Si el campo NO existe en el workspace:**
   - Resolver el fallback declarado en `.agents/jira-required.yaml` para el slug `spec_implementation_plan`.
   - Si no existe ningún campo equivalente, publicar el plan como **comentario** estructurado en la Story vía `[ISSUE_TRACKER_TOOL]` (crear comentario), encabezado `## Spec Implementation Plan (Dev)`:

     ```
     ## Spec Implementation Plan (Dev)

     [cuerpo completo del plan]
     ```

4. **Materializar y leer:**
   - Correr `bun run jira:sync-issues get <STORY_KEY> --include-comments`.
   - Leer el `implementation-plan.md` generado bajo `.context/PBI/epics/.../stories/.../` (read-only cache). Si el campo estaba ausente, la sync emite un stub apuntando al comentario fallback.

### Output Esperado

- [ ] Cuerpo del plan publicado al campo `{{jira.spec_implementation_plan}}` de la Story (si el slug resuelve a un campo presente) o al comentario fallback `## Spec Implementation Plan (Dev)`
- [ ] Tamaño del cuerpo medido como ADF serializado antes de publicar: `{N} / 30,000` (o STOP con la propuesta de qué secciones se mueven)
- [ ] Label `implementation-plan-ready` agregado a la Story
- [ ] `bun run jira:sync-issues get <STORY_KEY> --include-comments` ejecutado; `implementation-plan.md` materializado y leído
