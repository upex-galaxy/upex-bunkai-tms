Actúa como Senior Software Architect, Tech Lead, y UI/UX Designer.

---

## Custom field resolution — slug-based, never hardcoded

Las IDs numéricas de Jira (`customfield_NNNNN`) varían por workspace y NO viven en este skill. Esta metodología resuelve cada campo en runtime vía `{{jira.<slug>}}` contra el catálogo canónico en `.agents/jira-required.yaml`. El AI runtime resuelve el slug → ID numérico vía `.agents/jira-fields.json` (poblado por `bun run jira:sync-fields`). Si un slug no existe en el workspace de destino, el catálogo declara el fallback y `bun run jira:check` warnea.

**Slug que este workflow escribe** (semántica del campo):

- `{{jira.feature_implementation_plan}}` — Feature Implementation Plan (Epic-level Textarea). Plan técnico generado por este flujo y publicado al Epic.

**Operación → tool layer.** Toda escritura/lectura contra Jira se expresa como `[ISSUE_TRACKER_TOOL]` pseudo-código. El skill consumidor (AI runtime) resuelve la herramienta vía la tabla `.agents/instructions/agent-tool-resolution.md` §6 (primary `/acli`, fallback Atlassian MCP, last resort REST). Para la matriz operación → capa de herramienta, ver `.agents/skills/product-management/references/jira-operations.md`. Para gotchas de publicación a campos rich-text (ADF), ver `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

---

**Input:**

- Epic: [usar .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/epic.md]
- SRS completo: [usar .context/SRS/*.md; sin SRS, las secciones de los mapas de negocio que nombra `../SKILL.md` → "Product docs: PRD/SRS or business maps"]
- Epic-level Acceptance Criteria: [usar .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/epic.md — sección AC, o `edge-cases-enumeration.md` si existe (artefactos del skill `product-management`)]
- **Design System:** [usar `DESIGN.md` (tokens y personalidad visual) y, si existe, `.context/design/master-design-plan.md` (§2 tokens congelados, §4 specs de pantalla, §8 mapa US→Screen) — para decisiones de UI/UX]

**Autor del plan → Jira → sync → lee.** NO escribas a mano `feature-implementation-plan.md`. Es un archivo `[SYNC]` (read-only cache): redacta el plan en sesión, publícalo al campo `{{jira.feature_implementation_plan}}` del Epic (o comentario fallback per `.agents/jira-required.yaml`), corre `bun run jira:sync-issues get <EPIC_KEY> --include-comments`, y lee el `feature-implementation-plan.md` materializado en `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/`. El cuerpo del plan sigue el esqueleto de abajo.

---

## Cómo escribir el plan (estas reglas NO se publican)

Lo que se publica es solo el cuerpo entre los marcadores `plan-body`. Todo lo de esta sección guía la redacción y se queda en el skill: copiarlo al cuerpo gasta presupuesto de Jira (ver "Presupuesto de tamaño" abajo) sin darle nada al revisor.

- **Verificar antes de decidir.** Antes de cada decisión técnica, consultá Context7 MCP para la API actual de las librerías candidatas (ej.: React Query vs SWR), Supabase MCP si la feature toca Auth / Database / Storage, y shadcn MCP antes de planear un componente custom (data-table, form, dialog ya existen). El plan registra la decisión y su razón, no la consulta.
- **Promoción a ADR.** Las decisiones a nivel feature son más propensas a ser arquitectónicas y difíciles de revertir que las de una story suelta. Cada decisión que pase el **doble filtro** (arquitectónica Y difícil de revertir: modelo de auth, patrón de data-access, contrato de error, tenancy, framework con lock-in) se registra como `ADR-NNNN-<slug>.md` en `.context/ADR/` y el plan deja solo el backlink (`See ADR-NNNN`). Detección + procedimiento: `agentic-dev-core/references/adr-doctrine.md`; template + lifecycle: `.context/ADR/README.md`. Estado: una decisión que el humano ya aprobó (plan aprobado, respuesta en el chat, deck de decisiones) va `Accepted`, citando dónde se aprobó; solo una pregunta todavía abierta va `Proposed`.
- **Tipos del backend.** Todas las stories de la feature importan tipos desde `@/lib/types`, derivados de `src/types/supabase.ts`; los helpers que comparten varias stories van a `lib/types.ts` o `lib/<feature>-types.ts`. El plan nombra entidades y helpers con su archivo; no pega el código.
- **UI.** Aplica Critical Rule #14 (`AGENTS.md`): inspeccionar y reutilizar los componentes vivos, construir contra la spec de `.context/design/master-design-plan.md` §4 cuando la pantalla está en §8, y nunca inventar UI. La personalidad visual (bordes, sombras, espaciado, hover) ya está congelada en `DESIGN.md`: el plan no la repite. Lo que sí nombra: pantallas, componentes reutilizados, componentes nuevos compartidos, journeys y estados globales.
- **Copy real.** Los textos salen del vocabulario de `.context/business/domain-glossary.md` y del PRD (`executive-summary.md`, `user-personas.md`, `mvp-scope.md`), con el tono del producto; sin PRD, del glosario y del copy que la UI viva ya usa. Nada de frases genéricas ("Bienvenido a nuestra plataforma", "Gestiona tus recursos fácilmente"). El plan lista los términos clave, no un catálogo de ejemplos.
- **Lo que no va en el cuerpo.** Los criterios que valen para toda feature (tipos sin errores, build y lint verdes, tests críticos pasando, rutas privadas en el middleware, docs al día) los verifica `/sprint-development` en cada story: el plan lista solo criterios propios de esta feature. El detalle de una story concreta (archivos, componentes, pasos) va a su `story-plan.md`.
- **Forma.** Una sección que no aplica se omite, no se publica vacía. Listas cortas antes que tablas: en ADF una tabla cuesta varias veces lo que cuesta la misma información en lista, así que una tabla entra solo cuando reemplaza varias listas paralelas (`../../acli/references/adf-authoring-style.md`).

---

<!-- plan-body:start -->

# Feature Implementation Plan: EPIC-{PROJECT_KEY}-{ISSUE_NUM} - [Epic Title]

## Overview

[Qué implementa la feature y para quién, en 2-3 oraciones.]

- **Stories:** [STORY-KEY: título], [STORY-KEY: título], ...
- **Stack:** [solo lo que la feature usa o cambia: frontend, backend, DB, deploy, testing]

## Technical Decisions

### Decision 1: [Nombre]

- **Options:** [A] / [B] / [C]
- **Chosen:** [opción], porque [razón]
- **Trade-off:** [lo que se cede]
- **ADR:** [See ADR-NNNN, o "local a la feature"]

(3-5 decisiones, misma forma)

## Shared Types

[Entidades del backend que usa la feature y helpers compartidos, con archivo. Ej.: `Mentor`, `MentorInsert` en `lib/types.ts`.]

## UI/UX Strategy

- **Screens:** [pantalla (master-design-plan §8) → stories que la construyen]
- **Reused components:** [componente: uso en la feature]
- **New shared components:** [Nombre (`components/<domain>/`): propósito; stories que lo usan]
- **Journeys:** [flujo: Story A → Story B → Story C]
- **Global states:** loading [cómo], empty [mensaje + CTA], error [cómo se recupera]
- **Domain copy:** [términos clave del glosario que usa la UI]

## Shared Dependencies

- [Dependencia o servicio externo]: [para qué]
- **Env vars:** `VAR_NAME` ([para qué])

## Architecture

- **Folders:** [rutas nuevas o cambiadas]
- **Patterns:** [patrón]: [dónde se aplica]
- **Libraries:** [librería@versión]: [para qué]

## Implementation Order

1. [STORY-KEY]: [título]. [Por qué va primero / qué desbloquea]
2. [STORY-KEY]: [título]. [Depende de 1 / puede ir en paralelo]

## Risks & Mitigations

- **[Riesgo]** (impact H/M/L, likelihood H/M/L): [mitigación]

## Success Criteria

- [ ] [Criterio de negocio propio de esta feature]
- [ ] [Performance target, si aplica]

<!-- plan-body:end -->

---

## 📤 SINCRONIZACIÓN CON JIRA (Condicional - UPEX Workspace)

### Custom Field para Feature Implementation Plan

| Slug (resuelve vía jira-required.yaml) | Nombre                              | Tipo     | Nivel |
| -------------------------------------- | ----------------------------------- | -------- | ----- |
| `{{jira.feature_implementation_plan}}` | Feature Implementation Plan (Dev)🛠️ | Textarea | Epic  |

### Instrucciones de Sincronización

**Flujo: autor del plan en sesión → publicar al campo Jira → sync → leer el `.md` materializado.** El `feature-implementation-plan.md` NO se escribe a mano; es un archivo `[SYNC]` (read-only cache) que la sync genera desde el campo Jira del Epic.

1. **Verificar si el Epic tiene el custom field:**
   - Verificar si el slug `{{jira.feature_implementation_plan}}` resuelve a un campo presente en el workspace (vía `.agents/jira-fields.json` / `.agents/jira-required.yaml`).

> Antes de escribir campos rich-text en Jira, leé `.agents/skills/product-management/references/jira-publishing-gotchas.md` para los dos bugs ADF conocidos y sus workarounds.

> **Presupuesto de tamaño (bloqueante).** Jira Cloud corta cada valor rich-text en 32,767 caracteres y cuenta el **ADF serializado**, no el Markdown: el plan convertido mide varias veces lo que mide en Markdown, y las tablas, listas anidadas, paneles y bloques de código son lo que más crece (mediciones: `.context/ADR/ADR-0003-forensic-measurements-ledger.md`). Antes de publicar, en el campo o en el comentario fallback, convertí y medí el cuerpo COMPLETO tal como va a quedar guardado:
>
> ```bash
> bun .agents/skills/acli/scripts/md-to-adf.ts plan.md plan.adf.json
> jq -c . plan.adf.json | wc -m        # debe quedar en 30000 o menos
> ```
>
> Más de 30,000 → **STOP antes de escribir.** Proponé qué secciones salen del plan y a dónde van, con lo que ahorra cada movimiento, y esperá la decisión del usuario. Destinos de este nivel: el detalle por Story (archivos, componentes y pasos de una Story concreta) va al `{{jira.spec_implementation_plan}}` de esa Story (`story-plan.md`); una decisión arquitectónica difícil de revertir va a un ADR (`.context/ADR/`) y el plan la enlaza; el diseño de UI ya documentado queda en `DESIGN.md` / `.context/design/master-design-plan.md` y el plan lo referencia. Un rechazo de Jira por longitud (`CONTENT_LIMIT_EXCEEDED`) es el mismo STOP. Nunca truncar, nunca partir el plan en dos campos o dos comentarios, nunca quitar el formato para que entre. Las secciones de la plantilla que no aplican a este plan se omiten, no se publican vacías. Regla canónica: `.agents/skills/acli/SKILL.md` → "Size budget" (T5).

2. **Si el campo existe:**
   - Publicar el cuerpo COMPLETO del plan al campo `{{jira.feature_implementation_plan}}` del Epic vía `[ISSUE_TRACKER_TOOL]` (escritura de custom field).
   - Agregar label: `implementation-plan-ready`.

3. **Si el campo NO existe en el workspace:**
   - Resolver el fallback declarado en `.agents/jira-required.yaml` para el slug `feature_implementation_plan` (puede ser un slug equivalente o instrucción de comentar).
   - Si no existe ningún campo equivalente, publicar el plan como **comentario** estructurado en el Epic vía `[ISSUE_TRACKER_TOOL]` (crear comentario), encabezado `## Feature Implementation Plan (Dev)`:

     ```
     ## Feature Implementation Plan (Dev)

     [cuerpo completo del plan]
     ```

4. **Materializar y leer:**
   - Correr `bun run jira:sync-issues get <EPIC_KEY> --include-comments`.
   - Leer el `feature-implementation-plan.md` generado bajo `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/` (read-only cache). Si el campo estaba ausente, la sync emite un stub apuntando al comentario fallback.

### Output Esperado

- ✅ Cuerpo del plan publicado al campo `{{jira.feature_implementation_plan}}` del Epic (o comentario fallback `## Feature Implementation Plan (Dev)`)
- ✅ Tamaño del cuerpo medido como ADF serializado antes de publicar: `{N} / 30,000` (o STOP con la propuesta de qué secciones se mueven)
- ✅ Label `implementation-plan-ready` agregado al Epic
- ✅ `bun run jira:sync-issues get <EPIC_KEY> --include-comments` ejecutado; `feature-implementation-plan.md` materializado y leído

---

**Formato:** Markdown estructurado. El cuerpo se publica al campo `{{jira.feature_implementation_plan}}` del Epic y, tras la sync, queda materializado en .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/feature-implementation-plan.md (read-only cache).

**Restricciones:**

- Decisiones técnicas justificadas
- Dependencias compartidas claras
- Orden de implementación lógico
- Riesgos identificados con mitigaciones
- **Publicar al campo Jira y correr la sync; nunca escribir el `.md` a mano**
