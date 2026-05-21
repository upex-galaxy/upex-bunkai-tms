Actúa como Senior Full-Stack Developer experto en [tech stack del proyecto].

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
1. Revisa: `docs/setup/mcp/[claude-code|gemini-cli|copilot-cli|vscode].md`
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

### Supabase MCP (Si proyecto usa Supabase)

**¿Está disponible?** [Verificar si puedes acceder a Supabase MCP]

**Si NO está disponible y la story requiere DB:**

- Advertir al usuario
- Proporcionar SQL manual para que ejecute
- O instruir cómo conectar Supabase MCP

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

**Acceptance Test Plan (Test Cases):** Usar el siguiente orden de descubrimiento:

1. **Jira Comments** (preferido): Buscar en comentarios de la US usando `[ISSUE_TRACKER_TOOL]` para obtener el issue con `comment_limit: 50`
2. **Jira Custom Field**: Campo `customfield_12400` ("Acceptance Test Plan") usando `fields: "*all"`
3. **Archivo Local** (fallback): `.context/.../stories/.../test-cases.md` o `acceptance-test-plan.md`

**Propósito:**

- Entender **qué** implementar (Acceptance Criteria)
- Entender **cómo** implementarlo (pasos técnicos)
- Entender **qué validar** después (Test Cases de Jira)

### 2. Guidelines de Desarrollo (DEV):

```
.claude/skills/sprint-development/references/
├── code-standards.md           # Estándares de código (DRY, naming, TypeScript)
├── error-handling.md           # Manejo de errores estructurado
├── data-testid-standards.md    # Atributos data-testid para testing E2E
└── spec-driven-development.md  # Principio de desarrollo guiado por specs
```

**Propósito:**

- Estándares de código (DRY, naming, TypeScript)
- Manejo de errores estructurado
- **Atributos `data-testid` para testing E2E**
- Principios de Spec-Driven Development

### 3. Design System (Si story tiene UI):

```
.context/design-system.md
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
   - Usar orden de descubrimiento: Jira Comments → Jira `customfield_12400` → Archivo local
   - Entiende qué se espera que funcione
   - Identifica edge cases a considerar
   - Usa los test cases como checklist durante la implementación
   - (NO implementes tests ahora - eso es Fase 8)

4. **Consulta docs con Context7 MCP (CRÍTICO)**
   - ⚠️ **MCP MÁS IMPORTANTE**: Úsalo siempre que trabajes con librerías externas
   - Si usas biblioteca nueva: consulta su documentación oficial actualizada
   - Si hay duda técnica sobre una API: verifica con Context7
   - Antes de implementar: confirma que la API/método existe en la versión actual
   - Ejemplo: usar `[DOCS_TOOL]` para consultar docs de Next.js, React, Supabase, etc.

5. **Consulta shadcn MCP (si proyecto usa shadcn)**
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
- ✅ Instala dependencias manualmente: `npm install [paquete]` o `bun add [paquete]`
- ✅ Si requiere setup complejo: instruye al usuario paso a paso

**Para cambios de DB:**

- ✅ Usa Supabase MCP si está disponible
- ✅ Si NO está disponible: proporciona SQL para que usuario ejecute manualmente

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
npm run dev
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
- **NO hardcodear SQL** (usar Supabase MCP o parametrizar)
- **NO usar `console.error`** (usar logger apropiado)
- **NO crear componentes UI si ya existen** (reusar design system)
- **NO ejecutar scripts interactivos**
- **NO implementar integration/E2E tests** (eso es Fase 11: Test Automation)

### ✅ SÍ HACER:
- **Seguir structure de carpetas** del proyecto
- **Aplicar naming conventions** (camelCase, PascalCase apropiados)
- **Documentar funciones complejas** (JSDoc si necesario)
- **Manejar errores apropiadamente** (try-catch, error boundaries)
- **Usar componentes del design system** (Button, Card, etc.)
- **Validar inputs de usuario** (sanitización, validación)
- **Agregar `data-testid` a componentes UI** (ver `references/data-testid-standards.md`)

---

### Paso 4: Validación Manual (Smoke Testing)

**Al terminar todos los steps:**

1. **Build del proyecto:**
```bash
npm run build  # o: bun run build
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

**Nota:** Unit tests se crean con el prompt `unit-testing.md`. Integration/E2E tests en Fase 11.

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
npm install

# 2. Levantar servidor
npm run dev

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

**2. Code Review (Fase 8):**

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

**Nota:** NO hagas commit todavía - primero crea unit tests y luego pasa por Code Review (Fase 8).

````

---

## 🎯 EJEMPLO DE USO COMPLETO

```markdown
Implementa STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre} siguiendo estos pasos:

**Contexto a leer:**
1. .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/implementation-plan.md
2. .claude/skills/sprint-development/references/ (code-standards, error-handling, data-testid-standards, spec-driven-development)
3. .context/design-system.md

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

**Nota final:** Esta fase implementa funcionalidad + unit tests. Integration/E2E tests se agregan en Fase 11 (Test Automation).
