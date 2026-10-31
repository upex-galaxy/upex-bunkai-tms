Actúa como Senior Full-Stack Developer experto en [tech stack del proyecto].

---

## Custom field resolution — slug-based, never hardcoded

Las IDs numéricas de Jira (`customfield_NNNNN`) varían por workspace y NO viven en este skill. Esta metodología resuelve cada campo en runtime vía `{{jira.<slug>}}` contra el catálogo canónico en `.agents/jira-required.yaml`. El AI runtime resuelve el slug → ID numérico vía `.agents/jira-fields.json` (poblado por `bun run jira:sync-fields`). Si un slug no existe en el workspace de destino, el catálogo declara el fallback y `bun run jira:check` warnea.

**Slugs que este workflow lee** (semántica del campo):

- `{{jira.acceptance_test_plan}}` — Acceptance Test Plan (Story-level Textarea). Fuente de los test cases que la implementación debe cubrir. Solo lectura desde este flujo, y SIEMPRE vía sync (`bun run jira:sync-issues get <STORY_KEY> --include-comments` → leer `acceptance-test-plan.md`); nunca leer el custom field por `view`.

**Operación → tool layer.** Toda escritura/lectura contra Jira se expresa como `[ISSUE_TRACKER_TOOL]` pseudo-código. El skill consumidor (AI runtime) resuelve la herramienta vía la tabla `.agents/instructions/agent-tool-resolution.md` §6 (primary `/acli`, fallback Atlassian MCP, last resort REST). Para la matriz operación → capa de herramienta, ver `.agents/skills/product-management/references/jira-operations.md`. Para gotchas de publicación a campos rich-text (ADF), ver `.agents/skills/product-management/references/jira-publishing-gotchas.md`.

---

## 🎯 TAREA

Implementar la story **STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}** siguiendo su implementation plan.

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

**ANTES de empezar, verifica:**

### Context7 MCP

**¿Está disponible?** [Verificar si puedes acceder a `[DOCS_TOOL]`]

**Si NO está disponible:**

```
⚠️ MCP Context7 no detectado

Para implementar con documentación oficial verificada y actualizada, necesito que conectes el MCP de Context7.

**¿Cómo conectarlo?**
1. Revisa: `docs/setup/mcp/README.md` (guías por harness: `claude-code.md`, `codex.md`)
2. Agrega Context7 a tu configuración MCP
3. Reinicia la sesión de chat

**¿Por qué es importante?**
- Consulto docs oficiales (Next.js, React, Supabase, etc.)
- Evito usar información desactualizada
- Implemento según best practices actuales

**¿Continuar sin Context7?**
Puedo continuar, pero usaré conocimiento interno (puede estar desactualizado).

**Opciones:**
1. ⏸️ Pausa y conecta Context7 (recomendado)
2. ▶️ Continúa sin Context7 (menos confiable)
```

### DB MCP (capability `db`: Supabase o la misma familia Postgres)

**Solo si la story toca la base de datos** (schema, RLS, funciones, datos). Una story que no la toca nunca se detiene por esta capability (`agentic-dev-core/references/mcp-capabilities.md` §4, pasos opcionales).

**¿Está disponible?** [Verificar que existe una tool terminada en `list_migrations` / `execute_sql`, con cualquier prefijo]

**Si NO está disponible y la story requiere DB:** STOP per `agentic-dev-core/references/mcp-capabilities.md` §4: nombrar la capability, el server que la provee y cómo habilitarlo. SQL a mano solo si el usuario lo elige después del STOP.

### shadcn/ui MCP (Si proyecto usa shadcn)

**¿Está disponible?** [Verificar si puedes acceder a shadcn/ui MCP]

**¿Cuándo usarlo?**

- Al crear nuevos componentes de UI
- Para buscar componentes de shadcn disponibles
- Para confirmar props y API de componentes shadcn

**Beneficios:**

- Búsqueda semántica de componentes shadcn
- Acceso a documentación actualizada de componentes
- Implementación correcta según best practices de shadcn

**Si NO está disponible:**

- Puedo continuar usando conocimiento interno de shadcn (puede estar desactualizado)

---

## 📚 CONTEXTO REQUERIDO

**DEBES leer estos archivos en orden:**

### 1. Story y Plan de Implementación:

```
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/story.md
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/implementation-plan.md
```

**Lectura COMPLETA de la carpeta sincronizada:** la sync (`bun run jira:sync-issues get <STORY_KEY> --include-comments`) materializa la carpeta COMPLETA de la Story bajo `.context/PBI/` — cada archivo per-field (`story.md`, `acceptance-criteria.md`, `scope.md`, custom fields, etc.) + `comments.md`. Para implementar la story DEBES leer TODA la carpeta: nunca omitas ACs / scope / custom fields / comentarios.

**Acceptance Test Plan (Test Cases):** lectura DETALLADA, **modality-aware**, siempre materializada vía sync, nunca leída por `view`:

1. **jira-native**: ATP = el campo `{{jira.acceptance_test_plan}}` de la Story → `bun run jira:sync-issues get <STORY_KEY> --include-comments`, luego lee `.context/.../stories/.../acceptance-test-plan.md` (cubre también comentarios con "Test Case" / "TC-" / "Scenario:" en `comments.md`).
2. **jira-xray**: ATP = la `description` de la issue **Test Plan** → `bun run jira:sync-issues get <ATP_KEY>` (la sync soporta ahora Test Plan / Test Execution), luego lee `.context/.../test-plans/TESTPLAN-<KEY>-<slug>.md`; los resultados de run por-TC vienen vía xray-cli.
3. **Fallback final**: `comments.md` / la descripción de la issue — ahí cae el comentario fallback `## Acceptance Test Plan` cuando el custom field está ausente (per `.agents/jira-required.yaml`).

**Propósito:**

- Entender **qué** implementar (Acceptance Criteria)
- Entender **cómo** implementarlo (pasos técnicos)
- Entender **qué validar** después (Test Cases de Jira)

### 2. Guidelines de Desarrollo (DEV):

```
.agents/skills/sprint-development/references/
├── code-standards.md           # Estándares de código (DRY, naming, TypeScript)
├── error-handling.md           # Manejo de errores estructurado
└── data-testid-standards.md    # Atributos data-testid para testing E2E
```

Son los DEFAULTS para una app que todavía no tiene convención propia. Donde la app ya tiene una (estructura, alias `{{stack.conventions.import_alias}}`, naming, manejo de errores, estilo de test id `{{stack.conventions.testid_style}}`), gana la de la app: `../SKILL.md` → `## Stack parameters` → "Existing conventions win". Un test id existente nunca se renombra.

**Propósito:**

- Estándares de código (DRY, naming, TypeScript)
- Manejo de errores estructurado
- **Atributos `data-testid` para testing E2E**

### 3. Design System (Si story tiene UI):

```
DESIGN.md                                  # tokens congelados (ruta: frontend.design_md_path en .agents/project.yaml)
.context/design/master-design-plan.md      # §8 US→Screen, §4 spec de pantalla (AGENTS.md Rule 14)
.context/design-system.md                  # guía de componentes, si frontend-setup la creó
```

**Propósito:**

- Componentes UI reutilizables disponibles
- Paleta de colores y estilo visual
- Patrones de diseño a seguir

### 4. Specs técnicas:

```
.context/SRS/architecture-specs.md
.context/SRS/api-contracts.yaml  (si story toca backend/API)
```

Sin SRS (app existente cuyos product docs son los mapas de negocio): las mismas preguntas se responden con las secciones de los mapas que lista `../SKILL.md` → "Product docs: PRD/SRS or business maps" (arquitectura, modelo de datos, contrato de API), más `.context/business/project-dev-guide.md`. No se crea un SRS para completar este paso.

**Propósito:**

- Stack técnico del proyecto
- Estructura de carpetas
- Contratos de API (endpoints, schemas)

---

## 🚀 PROCESO DE IMPLEMENTACIÓN

### Paso 1: Análisis y Comprensión

1. **Lee `implementation-plan.md` completo**
   - Identifica TODOS los steps
   - Entiende dependencies
   - Revisa estimated time

2. **Lee `story.md`**
   - Comprende cada Acceptance Criterion
   - Identifica user value
   - Entiende el "por qué"

3. **Revisa los Test Cases (Acceptance Test Plan)**
   - Orden de descubrimiento (modality-aware): sync get `<STORY>`/`<ATP_KEY>` → `acceptance-test-plan.md` (jira-native) o `test-plans/TESTPLAN-<KEY>-<slug>.md` (jira-xray) materializado → fallback final = `comments.md` / la descripción de la issue
   - Entiende qué se espera que funcione
   - Identifica edge cases a considerar
   - Usa los test cases como checklist durante la implementación
   - (los unit tests van después del código, con `/unit-testing`; integration/E2E son del workflow de QA)

4. **Consulta docs con Context7 MCP (CRÍTICO)**
   - ⚠️ **MCP MÁS IMPORTANTE**: Úsalo siempre que trabajes con librerías externas
   - Si usas biblioteca nueva: consulta su documentación oficial actualizada
   - Si hay duda técnica sobre una API: verifica con Context7
   - Antes de implementar: confirma que la API/método existe en la versión actual
   - Ejemplo: usar `[DOCS_TOOL]` para consultar docs de Next.js, React, Supabase, etc.

5. **Load the frontend skills, then consult the shadcn MCP (story has UI)**
   - **Required, before the first component or layout write:** the design set (`/frontend-design` + `/ui-ux-pro-max` + `/impeccable` + `/emil-design-eng`) + `/shadcn` + `/tailwind-css-patterns` (category `frontend-ui`). They carry the composition, shadcn and Tailwind rules; the shadcn MCP below is the component catalog, not a substitute. A story that redesigns a screen that already exists also loads `/redesign-existing-projects`; a public marketing page (landing, pricing) also loads `/design-taste-frontend`, and an indexable one `/seo`. Not installed → say so once, point at `bun setup` or the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
   - Si necesitas componentes UI: busca componentes shadcn disponibles
   - Si tienes dudas sobre props de componentes: consulta la API
   - Ejemplo: buscar "dialog", "form", "table" para encontrar componentes apropiados

**Output de este paso:**

```markdown
## Análisis Completado

**Story:** STORY-{PROJECT_KEY}-{ISSUE_NUM} - [Título]

**Acceptance Criteria:**

1. [AC1]
2. [AC2]
3. [AC3]

**Steps a implementar:**

1. [Step 1]: [Descripción breve]
2. [Step 2]: [Descripción breve]
3. [Step 3]: [Descripción breve]

**Tecnologías involucradas:**

- [Tech 1]
- [Tech 2]

**Componentes del Design System a usar:**

- Button (variant: primary)
- Card
- [Otros...]

**Próximo paso:** Implementar Step 1
```

---

### Paso 2: Setup y Validación de Dependencias

**Verifica que existen:**

- [ ] Dependencias necesarias instaladas
- [ ] Variables de entorno configuradas (`.env`)
- [ ] Base de datos accesible (si aplica)

**Si falta algo:**

- ❌ **NO ejecutes scripts interactivos** (`npm init`, `npx create-*`, etc.)
- ✅ Instala dependencias con el package manager de la app: `{{stack.package_manager}} add [paquete]`
- ✅ Si requiere setup complejo: instruye al usuario paso a paso

**Para cambios de DB:**

- ✅ **Required first:** load `/supabase` + `/supabase-postgres-best-practices` (category `backend-db`) before the first schema, RLS, function or migration call through the DB MCP. Not installed → say so once, point at `bun setup` or the single `bunx skills add` line from `PROJECT_LEVEL_SKILLS` in `cli/install.ts`, then continue (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).
- ✅ Lee el historial de migraciones por el DB MCP (`list_migrations`) justo antes de escribir el cambio
- ✅ Aplica según `{{stack.database.migrations_tool}}`: `supabase-mcp` / `supabase-cli` por el DB MCP (`supabase-cli` además commitea el archivo con la versión que registró el MCP); `prisma` / `drizzle`: la herramienta de la app genera la migración y aplicarla es el pipeline del equipo, preguntando antes; el MCP queda en solo lectura. Detalle: `agentic-dev-core/references/db-change-doctrine.md`
- ✅ Después de aplicar: `list_migrations` muestra el cambio, relee la definición en vivo y regenera los tipos (`{{stack.package_manager}} run {{stack.scripts.db_types}}`)
- ❌ Nunca DDL por `execute_sql`, nunca aplicar un cambio solo para destrabar un error local

---

### Paso 3: Implementación Incremental (Step by Step)

**IMPLEMENTA UN STEP A LA VEZ según `implementation-plan.md`:**

#### Para cada step:

**A) Anuncia qué vas a hacer:**

```markdown
### 🔨 Implementando Step 1: [Nombre del step]

**Task:** [Descripción]
**Archivos a crear/modificar:**

- [Archivo 1]
- [Archivo 2]

**Approach:** [Explicación breve del enfoque]
```

**B) Implementa el código:**

- Crea o modifica archivos
- Sigue code standards (`references/code-standards.md`)
- Aplica error handling (`references/error-handling.md`)
- Si hay UI: usa componentes del design system
- **Agrega `data-testid`** a todos los componentes UI (ver abajo)

**B.1) Data-TestID para Testing E2E:**

⚠️ **OBLIGATORIO** para todos los componentes con UI:

**Regla crítica - Dónde agregar el data-testid:**

| Tipo                                                 | Dónde agregarlo      | Ejemplo                                |
| ---------------------------------------------------- | -------------------- | -------------------------------------- |
| Componentes UI base (Button, Card, Input de shadcn)  | Donde se **usa**     | `<Button data-testid="submit_button">` |
| Componentes de dominio (MentorCard, LoginForm, etc.) | En la **definición** | Ver ejemplo abajo                      |

```tsx
// ✅ Componente de dominio específico: data-testid en la DEFINICIÓN
export function MentorCard({ mentor }) {
  return (
    <Card data-testid="mentorCard">  {/* Root: camelCase */}
      <h3 data-testid="mentor_name">{mentor.name}</h3>  {/* Interno: snake_case */}
      <Button data-testid="book_session_button">Agendar</Button>
    </Card>
  )
}

// ✅ Uso de componentes UI base: data-testid donde se USA
<Input data-testid="email_input" type="email" />
<Button data-testid="login_button">Iniciar sesión</Button>
```

**Nomenclatura:**

- Componente root: **camelCase** (`mentorCard`, `loginForm`)
- Elementos internos: **snake_case** (`email_input`, `submit_button`)

**Reglas clave:**

- **NUNCA** IDs dinámicos: ❌ `data-testid={`card-${id}`}`
- Permite selectores descendientes: `$('[data-testid="mentorCard"] button')`

**Referencia completa:** `references/data-testid-standards.md`

**C) Explica decisiones importantes:**

```markdown
**Decisión:** [Decisión tomada]
**Razón:** [Por qué elegiste ese approach]
```

**D) Valida manualmente que funciona:**

````markdown
**Validación:**

- ✅ Código compila sin errores TypeScript
- ✅ Linting pasa (si hay configurado)
- ✅ Funcionalidad básica se ve/funciona (smoke test)

**Cómo probar:**

```bash
{{stack.package_manager}} run {{stack.scripts.dev}}   # desde {{stack.app_root}}
# Navega a: http://localhost:3000/[ruta]
# Verifica: [Qué debe verse/funcionar]
```
````

````

**E) Continúa al siguiente step**

---

**Restricciones durante implementación:**

### ❌ NO HACER:
- **NO hardcodear valores** (usar env vars, constants)
- **NO duplicar código** (DRY always)
- **NO usar `any` en TypeScript** (tipos explícitos)
- **NO hardcodear SQL en el código de la app** (queries parametrizadas o el cliente del proyecto; los cambios de schema van por el DB MCP, `agentic-dev-core/references/db-change-doctrine.md`)
- **NO usar `console.error`** (usar logger apropiado)
- **NO crear componentes UI si ya existen** (reusar design system)
- **NO ejecutar scripts interactivos**
- **NO implementar integration/E2E tests** (eso es QA, Test Automation, fuera de este skill)

### ✅ SÍ HACER:
- **Seguir la estructura y las convenciones que la app ya tiene** (ganan sobre los defaults de las references)
- **Aplicar naming conventions** (camelCase, PascalCase apropiados)
- **Documentar funciones complejas** (JSDoc si necesario)
- **Manejar errores apropiadamente** (try-catch, error boundaries)
- **Usar componentes del design system** (Button, Card, etc.)
- **Validar inputs de usuario** (sanitización, validación)
- **Agregar test ids a componentes UI nuevos** con el estilo de la app (`{{stack.conventions.testid_style}}`, o el que ya usa su código; sin ninguno, `references/data-testid-standards.md`). Nunca renombrar uno existente

---

### Paso 4: Validación Manual (Smoke Testing)

**Al terminar todos los steps:**

1. **Build del proyecto:**
```bash
{{stack.package_manager}} run {{stack.scripts.build}}   # rol null: se omite y se reporta
````

- ✅ Build exitoso sin errores TypeScript
- ✅ Linting pasa (si hay configurado)

2. **Prueba manual de funcionalidad:**
   - Levanta dev server
   - Navega a la página/feature implementada
   - Valida CADA Acceptance Criterion manualmente

**Output:**

```markdown
## ✅ Validación Manual

**Acceptance Criteria:**

- ✅ AC1: [Descripción] - Funciona correctamente
- ✅ AC2: [Descripción] - Funciona correctamente
- ✅ AC3: [Descripción] - Funciona correctamente

**Edge cases revisados:**

- ✅ [Edge case 1]: Funciona
- ✅ [Edge case 2]: Funciona

**Cómo probé:**

1. [Paso 1]
2. [Paso 2]
3. [Resultado esperado] ✅
```

**Nota:** Unit tests se crean con `/unit-testing`. Integration/E2E tests: workflow de QA, fuera de este skill.

---

### Paso 5: Documentación y Próximos Pasos

**Al finalizar implementación:**

````markdown
## 🎉 Implementación Completada

### 📄 Archivos creados/modificados:

**Creados:**

- `[ruta]` - [Descripción breve de qué hace]
- `[ruta]` - [Descripción breve]

**Modificados:**

- `[ruta]` - [Qué cambió]

### ✅ Funcionalidad implementada:

**Acceptance Criteria cumplidos:**

- ✅ AC1: [Descripción]
- ✅ AC2: [Descripción]
- ✅ AC3: [Descripción]

### 🧪 Validación manual realizada:

- ✅ Build exitoso
- ✅ Linting sin errores
- ✅ Funcionalidad probada manualmente
- ✅ Edge cases considerados

**Comandos para probar localmente:**

```bash
# 1. Instalar dependencias (si agregaste alguna)
{{stack.package_manager}} install

# 2. Levantar servidor
{{stack.package_manager}} run {{stack.scripts.dev}}

# 3. Abrir en navegador
# http://localhost:3000/[ruta]

# 4. Validar que:
# - [Punto 1 a validar]
# - [Punto 2 a validar]
```
````

### 📋 Próximos pasos:

**1. Unit Tests (si no se hicieron):**

- Carga el skill `/unit-testing` para diseño de unit tests (TDD, AAA, mocking)
- Crea tests para lógica de negocio crítica

**2. Code Review (Stage 3):**

- Usa `references/review-pr.md` (sibling en este skill)
- Revisa código con análisis estático

**3. Integration/E2E Tests (out of scope for this skill):**

- Después de code review y deployment staging
- _Test automation belongs to the QA workflow — out of scope here._

### 💬 Sugerencia de commit message:

```
feat(STORY-{PROJECT_KEY}-{ISSUE_NUM}): [Descripción breve]

- Implementa [funcionalidad 1]
- Agrega [funcionalidad 2]
- Modifica [funcionalidad 3]

Acceptance Criteria:
- ✅ AC1: [Descripción]
- ✅ AC2: [Descripción]
- ✅ AC3: [Descripción]

Story: [Link a Jira si aplica]
```

**Nota:** NO hagas commit todavía - primero crea unit tests y luego pasa por Code Review (Stage 3).

````

---

## 🎯 EJEMPLO DE USO COMPLETO

```markdown
Implementa STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre} siguiendo estos pasos:

**Contexto a leer:**
1. .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/implementation-plan.md
2. .agents/skills/sprint-development/references/ (code-standards, error-handling, data-testid-standards)
3. DESIGN.md + .context/design/master-design-plan.md (si la story tiene UI)

**Proceso:**
1. Analiza el implementation plan
2. Implementa step by step
3. Valida manualmente que funciona
4. Al finalizar: dame resumen + comandos para probar + sugerencia de commit

**Importante:**
- Usa Context7 MCP si tienes dudas sobre las tecnologías del stack
- Reutiliza componentes del design system
- Crea unit tests con `unit-testing.md` después
- Valida con build + prueba manual

(Donde {PROJECT_KEY}, {ISSUE_NUM}, {nombre} se obtienen del epic/story que estás implementando)
````

---

## ⚠️ TROUBLESHOOTING

### Problema: Script requiere input interactivo

**❌ NO ejecutar:**

```bash
npx create-next-app@latest  # Pide input interactivo
npm init  # Pide input interactivo
```

**✅ Solución:**

```markdown
Este comando requiere input interactivo. Te proporciono los pasos manuales:

**Opción 1: Ejecución manual por el usuario**

1. Abre una terminal
2. Ejecuta: [comando]
3. Selecciona: [opciones recomendadas]

**Opción 2: Setup manual**
[Proporcionar pasos para configurar manualmente sin script interactivo]
```

### Problema: Context7 MCP no disponible

**Solución:** Advertir al usuario y proporcionar alternativas (ver sección "Verificación de Herramientas" arriba).

### Problema: Error de compilación TypeScript

**Solución:**

1. Lee el error completo
2. Identifica el archivo y línea
3. Consulta Context7 MCP si es error de biblioteca externa
4. Corrige el tipo/import/sintaxis

---

**Nota final:** Esta fase implementa funcionalidad + unit tests. Integration/E2E tests se agregan en el workflow de QA (Test Automation, fuera de este skill).
