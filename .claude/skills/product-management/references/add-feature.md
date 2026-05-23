Actúa como Product Owner, Scrum Master y Solution Architect experto.

**Input:**

- Descripción de la nueva feature/idea: [especificar en detalle]
- Epic tree existente: [usar `.context/PBI/epic-tree.md`]
- PRD (opcional): [usar `.context/PRD/mvp-scope.md` si necesitas contexto adicional]
- SRS (opcional): [usar `.context/SRS/functional-specs.md` si necesitas contexto técnico]
- **PROJECT_KEY:** Código del proyecto en Jira — léelo de `.agents/project.yaml` o, en su defecto, del `epic-tree.md`. NO lo hardcodees aquí.

---

## Inputs — read these first, in this order

Cold start? Lee estos archivos exactamente en este orden antes de proponer cualquier cosa. Cada uno aporta una capa específica de contexto; saltarte uno desperdicia tokens y aumenta el riesgo de inventar.

1. `.agents/project.yaml` — project identity, env URLs, project key, MCP names.
2. `.agents/jira-required.yaml` — canonical slug catalog (fields + statuses + link types).
3. `.agents/jira-fields.json` — slug → numeric custom-field-ID mapping (resolved at sync time).
4. `.agents/jira-workflows.json` — workflow + transition catalog (status names live here).
5. `.agents/jira-link-types.json` — slug → workspace link-type mapping (cuando exista).
6. `.context/master-implementation-plan.md` — Master Sprint roadmap (sequencing estratégico).
7. `.context/PRD/mvp-scope.md` — qué está dentro y qué está fuera del MVP.
8. `.context/PRD/user-personas.md` — modelo de actores.
9. `.context/PRD/user-journeys.md` — expectativas a nivel de flujo.
10. `.context/SRS/functional-specs.md` — catálogo de FR (fuente para `**Source spec:**`).
11. `.context/SRS/non-functional-specs.md` — NFRs (performance, security, a11y).
12. `.context/business/business-data-map.md` — grafo de entidades (fuente de dependencias entity-level).
13. `.context/business/business-feature-map.md` — matriz CRUD por dominio.
14. `.context/business/business-api-map.md` — catálogo de endpoints (auth model, journeys).
15. `.context/PBI/epic-tree.md` — estado actual del backlog.

**Optional inputs.** Algunos proyectos maduros suman business maps generados por `/business-*-map`. Si están ausentes (típicamente en seed temprano), continúa sin ellos pero marca el gap.

---

## Custom field resolution — slug-based, never hardcoded

Las IDs numéricas de Jira (`customfield_NNNNN`) varían por workspace y NO viven en este skill. Esta metodología resuelve cada campo en runtime vía `{{jira.<slug>}}` contra el catálogo canónico en `.agents/jira-required.yaml`. El AI runtime resuelve el slug → ID numérico vía `.agents/jira-fields.json` (poblado por `bun run jira:sync-fields`). Si un slug no existe en el workspace de destino, el catálogo declara el fallback y `bun run jira:check` warnea.

**Slugs que este workflow escribe** (semántica de cada campo):

- `{{jira.acceptance_criteria}}` — escenarios Given/When/Then. Fuente única de verdad para AC.
- `{{jira.business_rules_specification}}` — reglas de negocio específicas de la story (validaciones, invariantes de dominio).
- `{{jira.scope}}` — in-scope únicamente. Lo excluido va a `out_of_scope`.
- `{{jira.out_of_scope}}` — exclusiones explícitas y complementarias a `scope` (no cross-pollination entre ambos).
- `{{jira.mockup}}` — URLs de Figma / wireframes / referencias visuales.
- `{{jira.workflow}}` — descripción del flujo de trabajo cuando es complejo.
- `{{jira.weblink}}` — URL de la app/feature. Llenar SOLO si el dominio se conoce con certeza; en duda, omitir.
- `{{jira.story_points}}` — estimación en Fibonacci (1, 2, 3, 5, 8, 13).

**Operación → tool layer.** Toda escritura/lectura contra Jira se expresa como `[ISSUE_TRACKER_TOOL]` pseudo-código. El skill consumidor (AI runtime) resuelve la herramienta vía la tabla `CLAUDE.md` §6 (primary `/acli`, fallback Atlassian MCP, last resort REST). Para la matriz operación → capa de herramienta, ver `references/jira-operations.md`. Para gotchas de publicación a campos rich-text (ADF), ver `references/jira-publishing-gotchas.md`.

> **Nota sobre `{{jira.weblink}}`.** Es opcional y solo debe llenarse si: (a) la IA conoce con certeza el dominio de la app bajo prueba (sistema prompt o contexto explícito del proyecto), o (b) el usuario proporcionó la URL. En duda → NO llenar.

---

## Summary nomenclature

**NUNCA prefijes el summary de una story con la referencia a la spec funcional** (e.g. patrón `FR-XXX` seguido de em-dash y el título). El Jira key (`{PROJECT_KEY}-{NUM}`) es el único identificador real; mezclar referencias de metodología en el summary contamina la búsqueda Jira-side y rompe filtros JQL por summary.

La referencia a la spec va en el **cuerpo** del issue como primera línea:

```
**Source spec:** FR-XXX
```

Si la story no mapea 1:1 a un FR (e.g. mejora cosmética sin spec dedicada), **omite la línea** completa. No la rellenes con `N/A` ni con un FR forzado.

Same rule applies al summary del epic.

---

## No content duplication — description ↔ custom fields

**Hard rule:** AC, Scope y Out-of-Scope viven **EXCLUSIVAMENTE** en sus custom fields slug-resueltos. La descripción del issue NUNCA debe llevar `## Acceptance Criteria`, `## Scope`, `## Out of Scope` como H2 sections.

El body de la descripción carga:

- `**Source spec:** FR-XXX` (primera línea, opcional).
- `## User story` — narrativa As/I want/So that.
- `## Business rules` — solo overflow cuando el contenido no quepa en `{{jira.business_rules_specification}}`.
- `## Workflow` — solo overflow cuando el contenido no quepa en `{{jira.workflow}}`.
- `## Definition of done` — checklist de cierre.
- Opcional: `## Mockups / Wireframes`, `## Technical notes`.

Detalle completo del contrato + procedimiento de auditoría de deduplicación → `references/description-custom-field-dedup.md`.

---

## 🎯 OBJETIVO

Analizar una nueva idea/feature y determinar cómo agregarla eficientemente al backlog existente, siguiendo el flujo **Jira-First → Local**.

---

## 📊 FASE 1: ANÁLISIS DE COMPLEJIDAD

**Acción:** Analiza la idea proporcionada y clasifícala en uno de estos 3 niveles.

### Criterios de Clasificación

#### **NIVEL 1: Story Individual**

✅ Ejecutar directamente

**Características:**

- Es una mejora/extensión de funcionalidad existente
- Encaja claramente en una épica ya existente
- Puede completarse en 1-8 story points
- No requiere cambios arquitectónicos significativos
- 1 user story es suficiente

**Ejemplos:**

- "Agregar filtro por [atributo] en la búsqueda de [entidad principal]" (→ Epic existente relacionada con búsqueda/descubrimiento)
- "Permitir cancelar [acción de negocio] con X horas de anticipación" (→ Epic existente relacionada con gestión de operaciones)
- "Agregar notificación email cuando [evento de negocio] ocurre" (→ Epic existente relacionada con notificaciones)

(Donde [entidad principal], [atributo], [acción de negocio] y [evento de negocio] se determinan analizando el PRD/SRS del proyecto actual)

**Acción:** → Ir a **FASE 2A**

---

#### **NIVEL 2: Épica Completa**

✅ Ejecutar directamente

**Características:**

- Es una feature nueva que NO encaja en épicas existentes
- Requiere múltiples user stories (3-8 stories)
- Tiene scope bien definido y acotado
- No depende críticamente de otras épicas nuevas
- Puede implementarse de forma independiente

**Ejemplos:**

- "Sistema de mensajería entre [user-type-1] y [user-type-2]"
- "Dashboard de analytics para [user-type]"
- "Sistema de certificados/badges al completar [evento de negocio]"

(Donde [user-type-1], [user-type-2] y [evento de negocio] se determinan analizando el PRD/SRS del proyecto actual)

**Acción:** → Ir a **FASE 2B**

---

#### **NIVEL 3: Múltiples Épicas**

⚠️ **ADVERTENCIA - REQUIERE PLAN PREVIO**

**Características:**

- La idea requiere 2+ épicas para implementarse
- Tiene dependencias complejas entre componentes
- Requiere cambios arquitectónicos significativos
- Scope muy amplio (20+ stories estimadas)
- Alta complejidad técnica o de negocio

**Ejemplos:**

- "Sistema completo de suscripciones mensuales con planes"
- "Marketplace de cursos pregrabados con creador de contenido"
- "Sistema de gamificación con badges, rankings y rewards"

**Acción:** → Ir a **FASE 2C (STOP + Plan Requerido)**

---

## 🚨 VALIDACIÓN CRÍTICA

Antes de clasificar, pregúntate:

1. ¿Cuántas user stories necesito? (1 = Nivel 1, 3-8 = Nivel 2, 8+ = revisar si Nivel 3)
2. ¿Encaja en una épica existente? (Sí = probablemente Nivel 1, No = Nivel 2+)
3. ¿Requiere cambios en múltiples módulos del sistema? (Sí = probablemente Nivel 2-3)
4. ¿Puedo dividirlo en 2+ épicas independientes? (Sí = Nivel 3)
5. ¿Es técnicamente simple o complejo? (Simple = Nivel 1-2, Complejo = Nivel 2-3)

**OUTPUT FASE 1:**

```markdown
## Análisis de Complejidad

**Feature:** [nombre de la feature]
**Clasificación:** NIVEL [1/2/3]

**Justificación:**
[Explicar por qué pertenece a este nivel]

**Estimación preliminar:**

- User Stories: [número estimado]
- Story Points totales: [estimación]
- Épicas necesarias: [número] - [nombres si aplica]

**Épica existente (si aplica):** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre} o "N/A - requiere nueva épica"

**Dependencias identificadas:**
[Listar dependencias con otras épicas o sistemas — fuente: PRD/SRS sequencing, master-plan Master Sprints, business-data-map. Nunca inventar.]
```

---

## 📝 FASE 2A: CREAR STORY INDIVIDUAL (Nivel 1)

**Prerequisito:** Feature clasificada como Nivel 1.

### Paso 1: Identificar Épica Padre

**Acción:** Determina a qué épica existente pertenece esta story.

**Referencia:** Revisa `.context/PBI/epic-tree.md` para listar épicas existentes.

**Output:**

```markdown
**Épica seleccionada:** EPIC-{PROJECT_KEY}-{NUM}-{nombre}
**Razón:** [Por qué esta story pertenece a esta épica]
```

---

### Paso 2: Crear Story en Jira

**Acción:** Pide a `[ISSUE_TRACKER_TOOL]` crear un issue tipo `Story` en el proyecto resuelto. NO cites sintaxis de herramienta — el skill resolver (`/acli` u otro) la posee. Para la matriz operación → capa, ver `references/jira-operations.md`. Antes de escribir campos rich-text, lee `references/jira-publishing-gotchas.md` para los dos bugs ADF conocidos.

**Datos del issue:**

- **Proyecto:** PROJECT_KEY resuelto desde `.agents/project.yaml`.
- **Tipo de issue:** Story.
- **Summary:** Patrón "As a [user], I want to [action] so that [benefit]". Sin prefijo de spec funcional (ver "Summary nomenclature").
- **Description (body):** primera línea `**Source spec:** FR-XXX` si aplica. Body contiene `## User story`, `## Definition of done`, y overflow opcional de business rules / workflow / mockups / technical notes. **NUNCA** incluye `## Acceptance Criteria`, `## Scope`, ni `## Out of Scope` — esos viven en custom fields (ver "No content duplication").
- **Epic Link:** Jira key de la épica padre identificada en Paso 1.
- **Prioridad:** High | Medium | Low.
- **Labels:** `feature-extension`, `post-mvp` (ajustar según corresponda).

**Custom fields (slug-resueltos):**

| Slug                                       | Contenido                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `{{jira.acceptance_criteria}}`     | Escenarios Given/When/Then (mínimo 3: 1 happy + 2 error/edge)                      |
| `{{jira.scope}}`                           | In-scope únicamente (lista de bullets)                                              |
| `{{jira.out_of_scope}}`                    | Exclusiones explícitas (complementario a `scope`, sin cross-pollination)            |
| `{{jira.story_points}}`                    | Fibonacci: 1, 2, 3, 5, 8, 13                                                        |
| `{{jira.business_rules_specification}}`    | Reglas de negocio (opcional)                                                        |
| `{{jira.mockup}}`                          | URLs de Figma / diseños (opcional)                                                  |
| `{{jira.workflow}}`                        | Descripción del flujo si es complejo (opcional)                                     |
| `{{jira.weblink}}`                     | URL de la app SOLO si se conoce con certeza (condicional, ver nota en sección de slugs) |

**Procedimiento:**

1. Pide a `[ISSUE_TRACKER_TOOL]` crear el issue tipo `Story` con los campos anteriores.
2. Vincula a la épica padre vía epic link.
3. Llena los custom fields slug-resueltos según la tabla.
4. **Captura el Jira Key** asignado (formato `{PROJECT_KEY}-{ISSUE_NUM}`).

**Nota ADF:** si vas a escribir múltiples custom fields rich-text en un solo update batch, splittea por campo o pre-convierte vía `md-to-adf.ts` — ver `references/jira-publishing-gotchas.md`.

---

### Paso 3: Transitar story al estado por defecto

**Acción:** Una vez creada, pide a `[ISSUE_TRACKER_TOOL]` transicionar la story al estado declarado en `{{jira.statuses.story_default}}` (default literal `Shift-Left QA` si el slug no está configurado en el workspace).

Si el workflow del proyecto no ofrece esa transición desde el estado inicial (`To Do`), reporta el gap al usuario y deja la story en su estado inicial — no fuerces una transición arbitraria.

---

### Paso 4: Linkear dependencias en Jira

**Acción:** Si la story tiene dependencias observables, créalas como issue links en Jira. Detalle completo → `references/dependency-linking.md`.

**Fuentes válidas de dependencias** (ninguna otra; nunca inventes):

- Sequencing explícito en PRD / SRS / functional-specs.
- Ordenamiento de Master Sprint en `.context/master-implementation-plan.md`.
- Relaciones entity-level en `.context/business/business-data-map.md`.
- Declaraciones explícitas `Blocked By` / `Blocks` en el archivo local `story.md` (Paso 5).

**Cómo:**

- Slug primario: `{{jira.link_types.dependencies}}` (outward = "depends on", inward = "is dependency for").
- Si el workspace no declara el slug `dependencies` y el catálogo declara `{{jira.link_types.dependencies.fallback}}` (típicamente `relates`), úsalo y **flagea explícitamente la degradación** — `relates` es simétrico y la dirección se pierde.
- Para bloqueos duros, usa `{{jira.link_types.blocks}}` (Jira built-in).
- Pide a `[ISSUE_TRACKER_TOOL]` crear el link respetando la direccionalidad: `outwardIssue = dependent`, `inwardIssue = prerequisite`.

**Reporting:** después de crear los links, reporta una matriz `from → to → type → source-of-decision` para que el usuario audite.

---

### Paso 5: Crear Carpeta Local de Story

**Acción:** Crea carpeta local usando el Jira Key obtenido en Paso 2.

**Nomenclatura:** `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ubicación:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/stories/`

**Ejemplo:**

Si PROJECT_KEY = "MYM", la épica padre es "MYM-13", y Jira asignó issue number = 45, entonces el Jira Key completo es "MYM-45".

Crear carpeta:

```
.context/PBI/epics/EPIC-MYM-13-{epic-name}/stories/STORY-MYM-45-{story-name}/
```

(Donde `{epic-name}` y `{story-name}` se infieren del análisis del dominio del proyecto actual.)

---

### Paso 6: Crear Archivo story.md

**Criterios INVEST para User Stories:**

| Criterio        | Descripción                                            | Validación                              |
| --------------- | ------------------------------------------------------ | --------------------------------------- |
| **I**ndependent | La story puede desarrollarse sin depender de otras     | ¿Puede completarse en aislamiento?      |
| **N**egotiable  | Los detalles pueden ajustarse durante el desarrollo    | ¿Hay flexibilidad en la implementación? |
| **V**aluable    | Aporta valor al usuario o al negocio                   | ¿El "so that" es claro y valioso?       |
| **E**stimable   | Se puede estimar el esfuerzo con la información dada   | ¿El equipo puede dar story points?      |
| **S**mall       | Puede completarse en un sprint (máximo 8 story points) | ¿Es menor a 8 SP? Si no, dividir        |
| **T**estable    | Los criterios de aceptación son verificables           | ¿Los scenarios son claros y medibles?   |

**Estructura del archivo `story.md`** (local, NO refleja Jira description 1:1):

```markdown
**Source spec:** FR-XXX  <!-- primera línea, omitir si no aplica -->

# [Story Title]

**Jira Key:** [KEY real de Jira, ej: MYM-45]
**Epic:** [EPIC-{PROJECT_KEY}-{NUM}] ([Epic Title])
**Priority:** [High | Medium | Low]
**Story Points:** [1, 2, 3, 5, 8, 13]
**Status:** [estado actual en Jira]
**Assignee:** null
**Type:** Feature Extension (Post-MVP)

---

## User Story

**As a** [tipo de usuario específico]
**I want to** [acción clara y concreta]
**So that** [beneficio medible para el usuario]

---

## Business Rules

<!-- Mirror de {{jira.business_rules_specification}} (opcional, solo overflow) -->

- [Regla de negocio 1 que aplica a esta story]
- [Regla de negocio 2]

---

## Workflow

<!-- Mirror de {{jira.workflow}} (opcional, solo overflow) -->

[Descripción del flujo de trabajo si es complejo]

1. Usuario hace X
2. Sistema responde Y
3. Usuario confirma Z

---

## Mockups / Wireframes

<!-- Mirror de {{jira.mockup}} (opcional) -->

- [URL a Figma/diseño si existe]

---

## Technical Notes

### Frontend

[Componentes a crear/modificar]

### Backend

[APIs a crear/modificar, lógica de negocio]

### Database

[Tablas/campos a agregar]
**IMPORTANTE:** NO hardcodear SQL. Usar `[DB_TOOL]`.

### Impact Analysis

[Qué partes del sistema se ven afectadas]

---

## Dependencies

### Blocked By

[Otras stories que deben completarse primero — Jira keys]

### Blocks

[Qué stories dependen de esta — Jira keys]

### Related Stories

[Stories relacionadas — informativo, no bloquea]

---

## Definition of Done

- [ ] Código implementado y funcionando
- [ ] Tests unitarios (coverage > 80%)
- [ ] Tests de integración (API + DB)
- [ ] Tests E2E
- [ ] Code review aprobado (2 reviewers)
- [ ] Documentación actualizada
- [ ] Deployed to staging
- [ ] QA testing passed
- [ ] Acceptance criteria validated
- [ ] No critical/high bugs open

---

## Related Documentation

- **Epic:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{nombre}/epic.md`
- **PRD:** `.context/PRD/[relevant-section].md`
- **SRS:** `.context/SRS/functional-specs.md`
```

**Notas importantes:**

- **AC, Scope, Out-of-Scope NO se replican en `story.md`** — viven solo en sus custom fields Jira-side. Ver `references/description-custom-field-dedup.md`.
- Las secciones `## Business Rules`, `## Workflow`, `## Mockups` en local son mirror opcional para developers que prefieren leer todo en filesystem; deben mantenerse en sync con sus slugs respectivos durante refinement.

**Output esperado:** `.context/PBI/epics/EPIC-[...]/stories/STORY-[...]/story.md`

---

### Paso 7: Actualizar epic.md

**Acción:** Agrega la nueva story a la lista de user stories en `epic.md` de la épica padre.

**Buscar sección "User Stories" y agregar:**

```markdown
## User Stories

[... stories existentes ...]
X. **{PROJECT_KEY}-{ISSUE_NUM}** - As a [user-type], I want to [action on entities] so that [benefit]
```

(Donde `{PROJECT_KEY}` y `{ISSUE_NUM}` son los obtenidos en Paso 2, y `[user-type]`, `[action on entities]` y `[benefit]` se determinan del análisis del proyecto actual.)

---

### Paso 8: Actualizar epic-tree.md

**Acción:** Agrega la nueva story al árbol visual del backlog.

**Ejemplo:**

```markdown
EPIC-{PROJECT_KEY}-{NUM}: [Epic Title según dominio]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 1]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 2]
├── STORY-{PROJECT_KEY}-{NUM}: [Existing story 3]
└── STORY-{PROJECT_KEY}-{ISSUE_NUM}: [New story title] ⭐ NEW
```

(Los nombres de stories y epic se determinan analizando el dominio del proyecto actual.)

---

## ✅ FASE 2A COMPLETADA

**Resultado:**

- ✅ Story creada en Jira con ID real
- ✅ Story transicionada al estado por defecto (`{{jira.statuses.story_default}}`)
- ✅ Dependencias publicadas como issue links en Jira (si aplican)
- ✅ Carpeta local creada con nomenclatura correcta
- ✅ Archivo `story.md` completo (sin AC/Scope/OOS duplicados)
- ✅ Epic.md actualizado
- ✅ Epic-tree.md actualizado

---

## 📝 FASE 2B: CREAR ÉPICA COMPLETA (Nivel 2)

**Prerequisito:** Feature clasificada como Nivel 2.

### Paso 1: Definir Épica y Stories

**Acción:** Define la nueva épica y descompón en user stories.

**Output:**

```markdown
## Nueva Épica

**Título:** [Nombre de la épica]
**Descripción:** [2-3 párrafos explicando la épica]
**Prioridad:** High | Medium | Low
**Valor de Negocio:** [Por qué es importante]

## User Stories Identificadas

1. As a [user], I want to [action], so that [benefit] - [X pts]
2. As a [user], I want to [action], so that [benefit] - [X pts]
3. As a [user], I want to [action], so that [benefit] - [X pts]
   ...

**Total estimado:** [suma de story points]
**Número de stories:** [número]
```

---

### Paso 2: Crear Épica en Jira

**Acción:** Pide a `[ISSUE_TRACKER_TOOL]` crear un issue tipo `Epic` en el proyecto resuelto. Para la matriz operación → capa, ver `references/jira-operations.md`. Antes de escribir campos rich-text (description), lee `references/jira-publishing-gotchas.md`.

**Datos del issue:**

- **Proyecto:** PROJECT_KEY resuelto desde `.agents/project.yaml`.
- **Tipo de issue:** Epic.
- **Summary:** Nombre de la épica (sin prefijo de spec funcional).
- **Description (body):** descripción detallada 2-3 párrafos. Si la épica mapea a un set de FRs, el body puede listar la referencia (e.g. "Cubre FR-101 … FR-108"). NO duplicar AC/Scope en description.
- **Prioridad:** High | Medium | Low.
- **Labels:** `post-mvp`, `new-feature`.

**Procedimiento:**

1. Pide a `[ISSUE_TRACKER_TOOL]` crear el issue tipo `Epic`.
2. **Captura el Jira Key** asignado (formato `{PROJECT_KEY}-{ISSUE_NUM}`).

---

### Paso 3: Transitar épica al estado por defecto

**Acción:** Pide a `[ISSUE_TRACKER_TOOL]` transicionar el epic recién creado al estado declarado en `{{jira.statuses.epic_default}}` (default literal `Planning` si el slug no está configurado).

---

### Paso 4: Crear Carpeta Local de Épica

**Nomenclatura:** `EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ejemplo:**

Si PROJECT_KEY = "MYM" y Jira asignó issue number = 50, el Jira Key completo es "MYM-50".

Crear carpeta:

```
.context/PBI/epics/EPIC-MYM-50-{nombre-segun-dominio}/
```

(Donde `{nombre-segun-dominio}` se infiere del análisis del PRD/SRS del proyecto actual.)

---

### Paso 5: Crear Archivo epic.md

**Estructura completa (igual que prompt `product-backlog-seed.md`)**

Incluye todas las secciones:

- Epic Description
- User Stories (con IDs TBD por ahora)
- Related Functional Requirements (referencia FR-XXX al nivel del body, no del summary)
- Technical Considerations
- Dependencies
- Success Metrics
- Risks & Mitigations
- Testing Strategy (referencia a archivos futuros)
- Implementation Plan (referencia a archivos futuros)
- Notes
- Related Documentation

**Importante:** `epic.md` LOCAL no replica `## Acceptance Criteria (Epic Level)`, `## Scope`, ni `## Out of Scope` si estos viven en custom fields del epic Jira-side. Si el workspace no los expone como custom fields del epic, sí pueden ir en `epic.md` local — pero la decisión se documenta una vez por proyecto en `description-custom-field-dedup.md`.

**IMPORTANTE:** Marca claramente que es una feature post-MVP.

---

### Paso 6: Crear Stories en Jira

**Acción:** Por cada user story definida en Paso 1, pide a `[ISSUE_TRACKER_TOOL]` crearla.

**Datos por story:** mismo contrato que Fase 2A Paso 2 (summary sin prefijo de spec funcional; description con `**Source spec:**` como primera línea cuando aplique; AC/Scope/OOS exclusivamente en custom fields).

**Custom fields slug-resueltos por story:**

| Slug                                       | Contenido                                                                          |
| ------------------------------------------ | ---------------------------------------------------------------------------------- |
| `{{jira.acceptance_criteria}}`     | Escenarios Given/When/Then                                                          |
| `{{jira.scope}}`                           | In-scope únicamente                                                                 |
| `{{jira.out_of_scope}}`                    | Exclusiones explícitas                                                              |
| `{{jira.story_points}}`                    | Fibonacci                                                                           |
| `{{jira.business_rules_specification}}`    | Reglas de negocio (opcional)                                                        |
| `{{jira.mockup}}`                          | URLs de diseños (opcional)                                                          |
| `{{jira.workflow}}`                        | Flujo si es complejo (opcional)                                                     |
| `{{jira.weblink}}`                     | URL de la app (condicional, omitir en duda)                                         |

**Procedimiento:**

1. Crea cada story vinculada al epic recién creado.
2. Llena los custom fields slug-resueltos.
3. **Captura el Jira Key** de cada story.

**Nota ADF:** updates multi-campo deben hacerse split por campo o pre-convertidos. Ver `references/jira-publishing-gotchas.md`.

---

### Paso 7: Transitar stories al estado por defecto

**Acción:** Por cada story creada en Paso 6, pide a `[ISSUE_TRACKER_TOOL]` transicionarla al estado declarado en `{{jira.statuses.story_default}}` (default literal `Shift-Left QA`).

---

### Paso 8: Linkear dependencias entre stories

**Acción:** Una vez que TODAS las stories del epic existen, publica las dependencias internas como issue links. Detalle completo → `references/dependency-linking.md`.

**Fuentes válidas** (nunca inventes):

- Sequencing explícito en PRD / SRS / functional-specs.
- Ordenamiento de Master Sprint en `.context/master-implementation-plan.md`.
- Relaciones entity-level en `.context/business/business-data-map.md`.
- Declaraciones explícitas `Blocked By` / `Blocks` en cada `story.md` local (poblado en Paso 10).

**Cómo:**

- Slug primario: `{{jira.link_types.dependencies}}` con `outwardIssue = dependent`, `inwardIssue = prerequisite`.
- Fallback (si el workspace carece del slug): `{{jira.link_types.dependencies.fallback}}` — flagea degradación porque `relates` es simétrico.
- Bloqueos duros: `{{jira.link_types.blocks}}`.

**Reporting:** matriz `from → to → type → source` al cierre del paso.

---

### Paso 9: Cross-story Scope overlap check

**Acción:** Antes de pasar a sprint-sequencing, audita pairwise los bullets de `{{jira.scope}}` entre todas las stories hijas del epic.

**Procedimiento:**

1. Para cada par de stories `(A, B)` dentro del epic, compara literal bullet-by-bullet el contenido de `{{jira.scope}}`.
2. Si dos stories comparten un bullet idéntico (case-insensitive, trimmed) → surface al usuario:
   ```
   overlap_alert: <KEY-A> vs <KEY-B> on bullet "<text>"
   ```
3. **NO auto-resolver.** Ofrece al usuario tres opciones explícitas:
   - **(a) Mover el bullet** a una única story owner (el bullet se borra de la otra).
   - **(b) Extraer una shared dependency story** que contenga el bullet y de la cual ambas dependan.
   - **(c) Aceptar el duplicate** si es contexto compartido intencional (raro; documentar la razón en el `story.md` de ambas).

Detalle conceptual de slicing limpio y la anti-pattern asociada (`I4`) → `SKILL.md` Anti-patterns.

---

### Paso 10: Crear Carpetas Locales de Stories

**Acción:** Por cada story creada, crea su carpeta local.

**Nomenclatura:** `STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre-descriptivo}/`

**Ubicación:** `.context/PBI/epics/EPIC-{PROJECT_KEY}-{NUM}-{epic-name}/stories/`

**Ejemplo:**

Si PROJECT_KEY = "MYM", épica padre = "MYM-50", y stories con issue numbers 51, 52, 53:

```
.context/PBI/epics/EPIC-MYM-50-{epic-name}/stories/
├── STORY-MYM-51-{story-name-1}/
├── STORY-MYM-52-{story-name-2}/
└── STORY-MYM-53-{story-name-3}/
```

(Donde `{epic-name}` y `{story-name-X}` se infieren del análisis del dominio del proyecto actual.)

---

### Paso 11: Crear Archivos story.md

**Acción:** Crea `story.md` para cada story (estructura igual que Fase 2A Paso 6).

**IMPORTANTE:**

- Marca que son stories de feature post-MVP.
- `**Source spec:** FR-XXX` como primera línea cuando aplique.
- NO incluyas `## Acceptance Criteria` / `## Scope` / `## Out of Scope` en `story.md` local — viven en custom fields Jira-side.
- Las declaraciones `Blocked By` / `Blocks` en cada `story.md` deben coincidir con los issue links creados en Paso 8.

---

### Paso 12: Actualizar epic.md con IDs Reales

**Acción:** Actualiza la sección "User Stories" de `epic.md` con los Jira keys reales.

**Ejemplo:**

```markdown
## User Stories

1. **{PROJECT_KEY}-51** - As a [user-type], I want to [action 1] so that [benefit]
2. **{PROJECT_KEY}-52** - As a [user-type], I want to [action 2] so that [benefit]
3. **{PROJECT_KEY}-53** - As a [user-type], I want to [action 3] so that [benefit]
```

(Donde `{PROJECT_KEY}` es el obtenido del input, los números son los asignados por Jira, y las user stories se determinan del análisis del proyecto actual.)

---

### Paso 13: Actualizar epic-tree.md

**Acción:** Agrega la nueva épica al árbol visual del backlog.

**Ejemplo:**

```markdown
[... épicas MVP existentes ...]

---

## Post-MVP Features

### ⭐ EPIC-{PROJECT_KEY}-{NUM}: [Epic Title según dominio]

**Jira Key:** {PROJECT_KEY}-{ISSUE_NUM}
**Status:** [estado actual]
**Priority:** MEDIUM (Post-MVP)
**Description:** [Descripción según análisis del dominio del proyecto actual]

**User Stories (X):**

1. **{PROJECT_KEY}-{NUM}** - [Story title 1]
2. **{PROJECT_KEY}-{NUM}** - [Story title 2]
3. **{PROJECT_KEY}-{NUM}** - [Story title 3]

**Related Functional Requirements:** [FR list at body level, opcional]
```

---

### Paso 14 (final): Sprint sequencing

**Acción:** Después de que TODAS las stories existen, todos los links de dependencias están publicados, y el overlap check pasó (o se resolvió), ejecuta sprint-sequencing.

Detalle completo (algoritmo Kahn, cycle detection, output schema) → `references/sprint-sequencing.md`.

**Output:** este paso SIEMPRE persiste el resultado en `.context/PBI/sprint-sequence.md` (overwrite on re-run).

**Cuándo re-correr:** cada vez que cambie el grafo de dependencias (nuevas stories, nuevos links, links removidos).

**Reglas críticas** (resumen, fuente: `sprint-sequencing.md`):

- Solo `dependencies` y `Blocks` contribuyen al topological sort. `Relates` es informacional.
- Cycle detection es obligatorio: si el grafo no se vacía y ningún nodo tiene in-degree cero → halt + report. Nunca silenciar.
- El output es input al planning humano, **nunca un commitment**.

---

## ✅ FASE 2B COMPLETADA

**Resultado:**

- ✅ Épica creada en Jira con ID real y transicionada a `{{jira.statuses.epic_default}}`
- ✅ Carpeta de épica local creada
- ✅ Archivo `epic.md` completo (sin duplicar AC/Scope si viven en custom fields del epic)
- ✅ Todas las stories creadas en Jira con IDs reales
- ✅ Stories transicionadas a `{{jira.statuses.story_default}}`
- ✅ Dependencias publicadas como issue links (matriz reportada)
- ✅ Scope overlap check completado (alerts resueltos por el usuario)
- ✅ Carpetas locales de stories creadas
- ✅ Archivos `story.md` completos (sin AC/Scope/OOS duplicados)
- ✅ `epic.md` actualizado con IDs reales
- ✅ `epic-tree.md` actualizado
- ✅ Sprint sequencing ejecutado y persistido en `.context/PBI/sprint-sequence.md`

---

## 🚨 FASE 2C: MÚLTIPLES ÉPICAS - ADVERTENCIA Y PLAN (Nivel 3)

**Prerequisito:** Feature clasificada como Nivel 3.

### ⚠️ ADVERTENCIA CRÍTICA

**La idea proporcionada es DEMASIADO COMPLEJA para ser creada directamente.**

Esta feature requiere **múltiples épicas** con dependencias y scope extenso. Crear todas las épicas de una vez resultaría en:

❌ Sobrecarga de tokens
❌ Contexto desorganizado
❌ Dependencias mal gestionadas
❌ Riesgo de inconsistencias
❌ Difícil de planificar correctamente

---

### 📋 PLAN RECOMENDADO

**Acción:** NO crees nada todavía. Primero genera un plan de división.

**Output esperado:**

```markdown
# Plan de Implementación: [Nombre de la Feature]

## 🚨 ADVERTENCIA

Esta feature requiere **[número] épicas** para implementarse correctamente.

**IMPORTANTE:** NO proceder con la creación hasta que este plan sea revisado y aprobado.

---

## Análisis de Complejidad

**Scope total estimado:**

- Épicas necesarias: [número]
- User stories estimadas: [número total]
- Story points totales: [estimación]
- Duración estimada: [Master Sprints]

**¿Por qué múltiples épicas?**
[Explicar razones: complejidad técnica, dominios separados, dependencias, etc.]

---

## División Recomendada en Épicas

### ÉPICA 1: [Nombre]

**Prioridad:** CRITICAL | HIGH | MEDIUM
**Master Sprint:** [N — referencia a `.context/master-implementation-plan.md` §5 si existe]
**Descripción:** [1-2 párrafos]

**User Stories estimadas:** [número]
**Story Points:** [total]

**Scope:**

- Feature 1
- Feature 2
- ...

**Dependencias:**

- **Requiere:** [Épicas que deben completarse antes]
- **Bloqueada por:** [Épicas externas]

**Orden sugerido:** #1 (implementar primero)

---

### ÉPICA 2: [Nombre]

**Prioridad:** CRITICAL | HIGH | MEDIUM
**Master Sprint:** [N]
**Descripción:** [1-2 párrafos]

**User Stories estimadas:** [número]
**Story Points:** [total]

**Scope:**

- Feature 1
- Feature 2
- ...

**Dependencias:**

- **Requiere:** ÉPICA 1 completada
- **Bloqueada por:** [Si aplica]

**Orden sugerido:** #2 (implementar después de ÉPICA 1)

---

[... repetir para todas las épicas necesarias ...]

---

## Orden de Implementación Recomendado

### Master Sprint 1: Foundation

1. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** - [Descripción] (base fundamental)
   - **¿Por qué primero?** [Razón]

### Master Sprint 2: Core Features

2. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** - [Descripción] (funcionalidad principal)
   - **Depende de:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}
   - **¿Por qué ahora?** [Razón]

3. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** - [Descripción]
   - **Depende de:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}
   - **¿Por qué ahora?** [Razón]

### Master Sprint 3: Enhancements

4. **EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** - [Descripción] (mejoras y optimizaciones)
   - **Depende de:** EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}, EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}
   - **¿Por qué al final?** [Razón]

> **Nota terminológica:** "Master Sprint" agrupa estratégicamente al nivel de roadmap (`.context/master-implementation-plan.md`). "Execution Sprint" es la salida del topological sort dependency-driven, derivable solo después de crear stories + links (ver `references/sprint-sequencing.md`).

---

## Riesgos Identificados

| Riesgo     | Impacto         | Probabilidad    | Mitigación           |
| ---------- | --------------- | --------------- | -------------------- |
| [Riesgo 1] | High/Medium/Low | High/Medium/Low | [Plan de mitigación] |
| [Riesgo 2] | High/Medium/Low | High/Medium/Low | [Plan de mitigación] |

---

## Cambios Arquitectónicos Necesarios

[Listar cambios significativos en la arquitectura del sistema que esta feature requiere]

**Ejemplos:**

- Nueva tabla de base de datos: [nombre y propósito]
- Nuevo servicio backend: [nombre y propósito]
- Integración con API externa: [cuál y por qué]
- Cambios en frontend: [componentes principales]

---

## Decisiones Técnicas Pendientes

Antes de comenzar la implementación, se deben tomar estas decisiones:

1. **[Decisión 1]**
   - **Opciones:** [Opción A, Opción B]
   - **Recomendación:** [Opción X porque ...]

2. **[Decisión 2]**
   - **Opciones:** [Opción A, Opción B]
   - **Recomendación:** [Opción X porque ...]

---

## Próximos Pasos

**NO proceder con la creación de épicas/stories todavía.**

### Paso 1: Revisar este Plan

- [ ] Revisar división de épicas propuesta
- [ ] Validar orden de implementación
- [ ] Confirmar estimaciones de esfuerzo
- [ ] Aprobar cambios arquitectónicos

### Paso 2: Dividir la Idea

Una vez aprobado el plan, dividir la idea original en épicas individuales.

### Paso 3: Ejecutar Incremental

Re-ejecuta este reference, pero ahora con **UNA épica a la vez**:

Input para primera ejecución:
"Implementar ÉPICA 1 del plan: [Nombre de la épica]
[Pegar descripción y scope de ÉPICA 1 del plan]"

→ Esto será clasificado como NIVEL 2 → Crear épica completa (Fase 2B), que incluye creación de stories, transiciones, dependency-linking, scope overlap check y sprint sequencing.

Repetir para cada épica según el orden recomendado.

---

## Estimación de Esfuerzo Total

**Total del proyecto:**

- Master Sprints: [número]
- Developers: [número recomendado]
- QA: [número recomendado]
- Duración: [semanas/meses]

**Costo estimado:** [Si aplica]

---

## Notas Adicionales

[Cualquier información relevante adicional sobre la feature, consideraciones de negocio, impacto en usuarios, etc.]
```

---

## ✅ FASE 2C COMPLETADA

**Resultado:**

- ✅ Plan detallado de división generado
- ✅ Advertencia clara al usuario
- ⚠️ NINGUNA épica/story creada (esperando aprobación)
- ✅ Roadmap claro de próximos pasos
- ✅ Usuario sabe que debe dividir la idea y ejecutar incrementalmente (cada épica → Fase 2B completa)

---

## 📋 NOMENCLATURA Y ESTÁNDARES

### Nomenclatura de Carpetas

**Épicas:**

```
EPIC-{PROYECTO}-{NUMERO}-{nombre-descriptivo}/
```

**Stories:**

```
STORY-{PROYECTO}-{NUMERO}-{nombre-descriptivo}/
```

**Reglas:**

- Usar kebab-case en nombres
- IDs sin ceros a la izquierda (MYM-2, no MYM-002)
- Nombres descriptivos pero concisos (2-4 palabras)
- NO usar snake_case, CamelCase, o espacios
- SIEMPRE usar IDs reales de Jira (flujo Jira-First)

### Summary nomenclature (reminder)

- **Nunca** prefix story / epic summaries with the functional-spec reference (e.g. `FR-XXX` followed by em-dash and title).
- `**Source spec:** FR-XXX` como primera línea del body, omitible.

---

## 🎯 RESUMEN DE FLUJOS

### Story Individual (Nivel 1)

```
1. Analizar → Clasificar como Nivel 1
2. Identificar épica padre existente
3. Crear story en Jira → Obtener ID
4. Transitar story a {{jira.statuses.story_default}}
5. Linkear dependencias (si aplican) → ver dependency-linking.md
6. Crear carpeta local STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/
7. Crear story.md (sin AC/Scope/OOS duplicados)
8. Actualizar epic.md de épica padre
9. Actualizar epic-tree.md
✅ Completado
```

### Épica Completa (Nivel 2)

```
 1. Analizar → Clasificar como Nivel 2
 2. Definir épica y descomponer en stories
 3. Crear épica en Jira → Obtener ID
 4. Transitar epic a {{jira.statuses.epic_default}}
 5. Crear carpeta local EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/
 6. Crear epic.md
 7. Crear todas las stories en Jira → Obtener IDs
 8. Transitar stories a {{jira.statuses.story_default}}
 9. Linkear dependencias internas → ver dependency-linking.md
10. Cross-story Scope overlap check (pairwise)
11. Crear carpetas locales de stories
12. Crear archivos story.md (sin AC/Scope/OOS duplicados)
13. Actualizar epic.md con IDs reales
14. Actualizar epic-tree.md
15. Sprint sequencing (final) → persiste .context/PBI/sprint-sequence.md
✅ Completado
```

### Múltiples Épicas (Nivel 3)

```
1. Analizar → Clasificar como Nivel 3
2. ⚠️ ADVERTENCIA: Demasiado complejo
3. Generar plan de división detallado (con Master Sprints como agrupación estratégica)
4. STOP - No crear nada
5. Usuario revisa plan
6. Usuario divide la idea
7. Usuario re-ejecuta este reference por cada épica (→ Nivel 2 / Fase 2B completa)
✅ Plan generado - Esperando división
```

---

## 🚨 VALIDACIONES IMPORTANTES

### Antes de Crear en Jira

- ✅ ¿El nombre de la story/épica es descriptivo y claro?
- ✅ ¿El summary está libre del prefijo de spec funcional (e.g. `FR-XXX` con em-dash y título)?
- ✅ ¿Los acceptance criteria están en formato Gherkin?
- ✅ ¿Los story points están en escala Fibonacci?
- ✅ ¿La épica padre (si aplica) existe realmente?
- ✅ ¿`description-custom-field-dedup.md` revisado para evitar duplicación?

### Después de Crear en Jira

- ✅ ¿Capturaste el Jira Key real asignado?
- ✅ ¿Verificaste que el epic link se creó correctamente?
- ✅ ¿El issue tiene todos los campos obligatorios completos (slug-resueltos)?
- ✅ ¿Transicionaste al estado por defecto (`story_default` / `epic_default`)?
- ✅ ¿Publicaste las dependencias como issue links?
- ✅ (Nivel 2) ¿Pasó el Scope overlap check?
- ✅ (Nivel 2) ¿Ejecutaste sprint-sequencing y persistió `.context/PBI/sprint-sequence.md`?

### Al Crear Archivos Locales

- ✅ ¿La nomenclatura de carpeta usa el ID real de Jira?
- ✅ ¿El formato es EPIC-{PROYECTO}-{NUM}-{nombre}?
- ✅ ¿Usaste kebab-case en el nombre descriptivo?
- ✅ ¿Los archivos `.md` tienen toda la información requerida y NO duplican AC/Scope/OOS?

---

## 📚 ARCHIVOS GENERADOS

Dependiendo del nivel, se generan:

### Nivel 1 (Story Individual)

```
.context/PBI/epics/EPIC-{PROYECTO}-{NUM}-{nombre}/stories/
└── STORY-{PROYECTO}-{NUM}-{nombre}/
    └── story.md
```

**Archivos actualizados:**

- `epic.md` de la épica padre
- `epic-tree.md`

---

### Nivel 2 (Épica Completa)

```
.context/PBI/epics/
└── EPIC-{PROYECTO}-{NUM}-{nombre}/
    ├── epic.md
    └── stories/
        ├── STORY-{PROYECTO}-{NUM}-{nombre}/
        │   └── story.md
        ├── STORY-{PROYECTO}-{NUM}-{nombre}/
        │   └── story.md
        └── ...
```

**Archivos actualizados:**

- `epic-tree.md`
- `.context/PBI/sprint-sequence.md` (generado/sobrescrito por sprint-sequencing)

---

### Nivel 3 (Plan de División)

```
[NO se crean archivos - solo se genera el plan en la respuesta]
```

**Próximos archivos (después de división):**

- Se crearán múltiples épicas usando Nivel 2 (cada una incluye su propio sprint-sequence).

---

## ⚙️ PREREQUISITOS

**Obligatorios:**

- Proyecto en Jira existente y configurado.
- `[ISSUE_TRACKER_TOOL]` resuelto y operativo (primary `/acli`, fallback Atlassian MCP — ver `CLAUDE.md` §6).
- `.agents/project.yaml`, `.agents/jira-required.yaml`, `.agents/jira-fields.json`, `.agents/jira-workflows.json` presentes y sincronizados (`bun run jira:sync-fields` ejecutado al menos una vez).
- `.context/PBI/epic-tree.md` actualizado (para revisar épicas existentes).

**Opcionales pero recomendados:**

- `.agents/jira-link-types.json` — necesario para dependency-linking robusto (poblado por `bun run jira:sync-link-types` cuando el script exista).
- `.context/master-implementation-plan.md` — para alinear con Master Sprints estratégicos.
- `.context/PRD/mvp-scope.md` — contexto de producto.
- `.context/SRS/functional-specs.md` — contexto técnico y catálogo de FRs.
- `.context/SRS/architecture-specs.md` — validación de cambios arquitectónicos.
- `.context/business/business-data-map.md` — para inferir dependencias entity-level reales.

---

## 💡 TIPS DE USO

### Para Story Individual (Nivel 1)

- Sé específico en la descripción de la mejora
- Menciona explícitamente la épica existente si ya la identificaste
- Proporciona contexto de por qué se necesita ahora

### Para Épica Completa (Nivel 2)

- Describe el valor de negocio claramente
- Explica qué problema resuelve la feature
- Proporciona ejemplos de casos de uso si es posible
- Recuerda: dependency-linking + scope overlap check + sprint-sequencing son fases **obligatorias** al final, no opcionales

### Para Ideas Complejas (potencial Nivel 3)

- Si sospechas que es compleja, menciona tus dudas
- Proporciona toda la información disponible
- Confía en el análisis para clasificar correctamente

### En General

- NO intentes forzar una clasificación específica
- Deja que el análisis determine el nivel objetivamente
- Si el análisis dice "Nivel 3", NO insistas en crear todo de una vez
- Trabaja incrementalmente siempre que sea posible

---

## 🔗 REFERENCIAS CRUZADAS

- `references/jira-operations.md` — matriz operación → capa de herramienta (Primary / Fallback / Last resort). Consultar antes de cualquier escritura a Jira.
- `references/dependency-linking.md` — directionality table, link-type semantics, fuentes válidas de dependencias, reporting.
- `references/description-custom-field-dedup.md` — contrato body ↔ custom fields y procedimiento de auditoría.
- `references/sprint-sequencing.md` — Kahn topological sort, output schema, cycle detection, persistencia en `.context/PBI/sprint-sequence.md`.
- `references/jira-publishing-gotchas.md` — dos bugs ADF conocidos (combined `code` + `strong` marks; MCP batched custom fields) y workarounds.

---

**Formato:** Archivos Markdown + Issues en Jira listos para implementación.

**Última actualización:** 2026-05-22 — slug-based catalog refactor (custom fields + statuses + link types), dependency-linking phase, sprint sequencing, scope overlap check, dedup audit, Source spec convention.

**Complementa a:** `product-backlog-seed.md` (para setup inicial MVP), `epic-creation.md`, `story-refinement.md`.
