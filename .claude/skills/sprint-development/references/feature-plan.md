Actúa como Senior Software Architect, Tech Lead, y UI/UX Designer.

---

## Custom field resolution — slug-based, never hardcoded

Las IDs numéricas de Jira (`customfield_NNNNN`) varían por workspace y NO viven en este skill. Esta metodología resuelve cada campo en runtime vía `{{jira.<slug>}}` contra el catálogo canónico en `.agents/jira-required.yaml`. El AI runtime resuelve el slug → ID numérico vía `.agents/jira-fields.json` (poblado por `bun run jira:sync-fields`). Si un slug no existe en el workspace de destino, el catálogo declara el fallback y `bun run jira:check` warnea.

**Slug que este workflow escribe** (semántica del campo):

- `{{jira.feature_implementation_plan}}` — Feature Implementation Plan (Epic-level Textarea). Plan técnico generado por este flujo y publicado al Epic.

**Operación → tool layer.** Toda escritura/lectura contra Jira se expresa como `[ISSUE_TRACKER_TOOL]` pseudo-código. El skill consumidor (AI runtime) resuelve la herramienta vía la tabla `CLAUDE.md` §6 (primary `/acli`, fallback Atlassian MCP, last resort REST). Para la matriz operación → capa de herramienta, ver `.claude/skills/product-management/references/jira-operations.md`. Para gotchas de publicación a campos rich-text (ADF), ver `.claude/skills/product-management/references/jira-publishing-gotchas.md`.

---

**Input:**

- Epic: [usar .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/epic.md]
- SRS completo: [usar .context/SRS/*.md]
- Epic-level Acceptance Criteria: [usar .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/epic.md — sección AC, o `edge-cases-enumeration.md` si existe (artefactos del skill `product-management`)]
- **Design System:** [usar .context/design-system.md - para decisiones de UI/UX]

**Autor del plan → Jira → sync → lee.** NO escribas a mano `feature-implementation-plan.md`. Es un archivo `[SYNC]` (read-only cache): redacta el plan en sesión, publícalo al campo `{{jira.feature_implementation_plan}}` del Epic (o comentario fallback per `.agents/jira-required.yaml`), corre `bun run jira:sync-issues get <EPIC_KEY> --include-comments`, y lee el `feature-implementation-plan.md` materializado en `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/`. El cuerpo del plan sigue la estructura de abajo.

---

# Feature Implementation Plan: EPIC-{PROJECT_KEY}-{ISSUE_NUM} - [Epic Title]

## Overview

Esta feature implementa [descripción high-level de la feature].

**Alcance:**

- [Story 1]: [Título]
- [Story 2]: [Título]
- [Story 3]: [Título]
- ...

**Stack técnico:**

- Frontend: [framework y versión]
- Backend: [framework/plataforma]
- Database: [sistema de BD]
- Deployment: [plataforma]
- Testing: [frameworks]

---

## Technical Decisions

**⚠️ IMPORTANTE - MCPs para Decisión Técnica:**

Antes de tomar decisiones técnicas críticas a nivel feature, DEBES:

1. **Context7 MCP (MCP MÁS IMPORTANTE)**
   - 🔍 Consultar documentación oficial de las librerías que consideras usar
   - ✅ Verificar APIs y capacidades actuales de las librerías
   - 📖 Obtener últimas actualizaciones y best practices
   - **Ejemplo:** Si consideras React Query vs SWR → consulta ambos con Context7

2. **Supabase MCP (si feature requiere backend/DB)**
   - 🔍 Verificar capacidades de Supabase para tu use case
   - ✅ Confirmar APIs disponibles (Auth, Database, Storage, etc.)
   - 📖 Revisar patrones recomendados para tu arquitectura

3. **shadcn MCP (si feature requiere componentes UI)**
   - 🔍 Buscar componentes shadcn que puedan resolver tus necesidades
   - ✅ Evaluar si shadcn tiene componentes complejos (data-table, forms, etc.)
   - 📖 Evitar crear componentes custom si shadcn ya los provee

**Beneficio:** Decisiones basadas en documentación oficial actualizada, no en conocimiento desactualizado.

---

### Decision 1: [Nombre de la decisión]

**Options considered:**

- A) [Opción A]
- B) [Opción B]
- C) [Opción C]

**Chosen:** [Opción elegida]

**Reasoning:**

- ✅ Ventaja 1
- ✅ Ventaja 2
- ✅ Ventaja 3
- ❌ Trade-off: [Desventaja o compromiso]

**Implementation notes:**

- [Detalle de implementación]
- [Consideraciones específicas]

---

### Decision 2: [Otra decisión técnica]

**Chosen:** [Decisión]

**Reasoning:**

- ✅ ...
- ❌ Trade-off: ...

**Implementation notes:**

- [Detalles]

---

(Incluir 3-5 decisiones técnicas críticas a nivel feature)

---

## Types & Type Safety

**⚠️ IMPORTANTE:** Esta feature debe usar tipos del backend para garantizar type-safety consistente en todas las stories.

**Tipos disponibles:**

- `lib/database.types.ts` - Tipos generados desde database schema (Fase 3.2 - Backend Setup)
- `lib/types.ts` - Type helpers extraídos del backend

**Estrategia de tipos a nivel feature:**

1. **Identificar entidades principales:**
   - ¿Qué entidades del backend usa esta feature? (User, Mentor, Product, etc.)
   - Listar tipos disponibles en `lib/database.types.ts` relevantes a esta feature

2. **Crear helpers compartidos (si es necesario):**
   - Si múltiples stories usan transformaciones de tipos similares
   - Ubicación: `lib/types.ts` o `lib/[feature-name]-types.ts`

3. **Directiva para todas las stories de esta feature:**
   - ✅ TODAS las stories deben importar tipos desde `@/lib/types`
   - ✅ TODAS las props de componentes tipadas con tipos del backend
   - ✅ Mock data type-safe que cumpla estructura de tipos
   - ✅ Zero type errors relacionados a entidades del backend

**Ejemplo a nivel feature:**

```typescript
// lib/types.ts (o lib/mentor-types.ts para feature específica)
import type { Database } from './database.types';

export type Mentor = Database['public']['Tables']['mentors']['Row'];
export type MentorInsert = Database['public']['Tables']['mentors']['Insert'];
export type MentorUpdate = Database['public']['Tables']['mentors']['Update'];

// Todas las stories de esta feature usan estos tipos
// Story A: MentorCard component usa Mentor
// Story B: MentorForm component usa MentorInsert
// Story C: EditMentor component usa MentorUpdate
```

**Beneficios a nivel feature:**

- Consistencia de tipos entre todas las stories
- Refactoring seguro (cambio en schema afecta a todas las stories)
- Zero duplicación de definiciones de tipos

---

## UI/UX Design Strategy (Si la feature tiene interfaz)

**⚠️ IMPORTANTE:** Esta feature debe usar el Design System base de Fase 3 (frontend-setup.md).

**Design System disponible:** `.context/design-system.md`

### Componentes compartidos por stories:

**⚠️ IMPORTANTE - Uso de MCP shadcn/ui a nivel feature:**

Si el proyecto usa shadcn/ui, **ANTES** de planificar componentes custom:

- 🔍 **Usa MCP shadcn** para buscar componentes disponibles
- ✅ Identifica componentes complejos que shadcn ya provee (data-table, form, command, etc.)
- 🚫 Evita crear componentes custom si shadcn tiene una solución
- 📖 Planifica integración de componentes shadcn en las stories

**Ejemplo de búsqueda a nivel feature:**

- Feature necesita múltiples diálogos → Busca "dialog" en shadcn MCP
- Feature necesita manejo de formularios complejos → Busca "form" en shadcn MCP
- Feature necesita mostrar data en tablas → Busca "data-table" en shadcn MCP

**Componentes del Design System a usar:**

- ✅ [Componente 1]: [Cómo se usa en esta feature]
- ✅ [Componente 2]: [Cómo se usa en esta feature]
- ✅ [Layout]: [Navbar/Sidebar - si se necesitan ajustes]

**Componentes custom a nivel feature:**

- 🆕 [FeatureComponentName]
  - **Usado por stories:** [Story A, Story B]
  - **Propósito:** [Descripción]
  - **Diseño base:** [Descripción visual usando design system]
  - **Ubicación:** `components/[feature-domain]/`

(Donde [FeatureComponentName] se define según el dominio de la feature. Ejemplos según proyecto: MentorCard en MYM, ProductCard en SHOP, PostCard en BLOG)

### Consistencia visual:

**Paleta aplicada (del design system):**

- Primary: `bg-primary` - [Uso específico en esta feature]
- Secondary: `bg-secondary` - [Uso específico]
- Accent: `bg-accent` - [Uso específico]

**Patrones de diseño comunes:**

- [Patrón 1]: [Descripción de cómo se aplica] (ej: Todas las listas usan Card grid)
- [Patrón 2]: [Descripción]

### Flujos de UX:

**User journeys específicos de esta feature:**

1. [Flujo 1]: [Descripción paso a paso]
   - Estado inicial → [Story A]
   - Acción → [Story B]
   - Resultado → [Story C]

2. [Flujo 2]: [Descripción]

**Estados globales de la feature:**

- Loading: [Cómo se muestra]
- Empty: [Qué mensaje/CTA]
- Error: [Cómo se recupera]

**Nota:** Los diseños específicos de cada story se detallan en sus `implementation-plan.md` respectivos.

### Personalidad UI/UX de la feature:

**⚠️ IMPORTANTE:** Esta feature debe reflejar la personalidad visual elegida en Fase 3 (frontend-setup).

**Estilo visual a seguir:** [Del design system - Minimalista/Bold/Corporativo/Playful]

**Aplicar consistentemente en TODAS las stories de esta feature:**

- **Si Minimalista:**
  - Espacios generosos (padding/margin amplios)
  - Tipografía limpia, jerárquica
  - Sombras sutiles (`shadow-sm`)
  - Bordes suaves (`rounded-md`)

- **Si Bold/Moderno:**
  - Gradientes sutiles en backgrounds
  - Sombras pronunciadas (`shadow-lg`, `shadow-xl`)
  - Bordes redondeados (`rounded-lg`, `rounded-xl`)
  - Hover effects con transforms (scale, translate)

- **Si Corporativo:**
  - Líneas rectas, estructura formal
  - Bordes mínimos o rectos (`rounded-sm`)
  - Colores sobrios, sin gradientes
  - Profesional y serio

- **Si Playful:**
  - Colores vibrantes del accent
  - Bordes muy redondeados (`rounded-2xl`, `rounded-full`)
  - Ilustraciones o íconos coloridos
  - Animaciones suaves

**Validar a nivel feature:**

- ✅ Todas las stories usan bordes consistentes
- ✅ Todas las stories usan sombras consistentes
- ✅ Todas las stories usan espaciado consistente
- ✅ Efectos hover/active coherentes en toda la feature

---

## Content Writing Strategy (Si la feature tiene UI con texto)

**⚠️ CRÍTICO:** Esta feature debe usar Content Writing real basado en el contexto del negocio, NO texto genérico.

**Directiva para TODAS las stories de esta feature:**

1. **Leer contexto de negocio:**
   - `.context/PRD/executive-summary.md` - Propuesta de valor, problema que resuelve
   - `.context/business/README.md` - Problema y solución del negocio
   - `.context/PRD/user-personas.md` - A quién va dirigido
   - `.context/PRD/mvp-scope.md` - Features y vocabulario del dominio

2. **Identificar vocabulario del dominio a nivel feature:**
   - ¿Qué entidades principales aparecen en esta feature?
   - ¿Qué acciones principales realizan los usuarios?
   - ¿Qué lenguaje usa el PRD para describir esta feature?

3. **Evitar frases genéricas en TODA la feature:**
   - ❌ "Bienvenido a nuestra plataforma"
   - ❌ "Gestiona tus recursos fácilmente"
   - ❌ "La mejor solución para..."
   - ❌ "Accede a tu dashboard"

4. **Aplicar tono coherente:**
   - Según personalidad del producto (del PRD)
   - Formal/Casual/Técnico/Amigable
   - Consistente en todas las stories de esta feature

**Ejemplos a nivel feature según dominio:**

**Si feature es "Mentor Discovery" (proyecto MentorYourMind):**

- ❌ Genérico: "Bienvenido a nuestra plataforma de gestión"
- ✅ Contextual: "Encuentra mentores expertos en tu área"
- ✅ Contextual: "Explora perfiles de mentores verificados"
- ✅ Contextual: "Filtra por experiencia, disponibilidad y especialidad"

**Si feature es "Inventory Management" (proyecto ShopFlow):**

- ❌ Genérico: "Administra tus recursos"
- ✅ Contextual: "Controla tu inventario en tiempo real"
- ✅ Contextual: "Recibe alertas cuando el stock esté bajo"
- ✅ Contextual: "Sincroniza automáticamente con tus ventas"

**Si feature es "Content Publishing" (proyecto BlogHub):**

- ❌ Genérico: "Crea y publica contenido"
- ✅ Contextual: "Escribe y monetiza tus artículos"
- ✅ Contextual: "Programa publicaciones para tu audiencia"
- ✅ Contextual: "Analiza el rendimiento de tus posts"

**Resultado esperado:**
Todas las stories de esta feature usan vocabulario consistente del dominio, reflejando el contexto específico del proyecto identificado en PRD/idea.

---

## Shared Dependencies

**Todas las stories de esta feature requieren:**

1. **[Dependency 1]**
   - [Detalles de la dependencia]
   - [Configuración necesaria]

2. **[Dependency 2]**
   - [Detalles]

3. **Environment variables:**
   - VAR_NAME: [descripción]
   - VAR_NAME_2: [descripción]

4. **External services:**
   - [Servicio 1]: [para qué se usa]
   - [Servicio 2]: [para qué se usa]

---

## Architecture Notes

### Folder Structure

(Mostrar estructura de carpetas relevante para esta feature)

/app
├── /feature-name
│ ├── /component1
│ └── /component2
/lib
├── /feature-utils
...

### Design Patterns

1. **[Pattern 1]**: [Descripción de uso]
2. **[Pattern 2]**: [Descripción de uso]

### Third-party Libraries

- **[Library 1]**: [versión] - [para qué se usa]
- **[Library 2]**: [versión] - [para qué se usa]

---

## Implementation Order

**Recomendado:**

1. **STORY-{PROJECT_KEY}-{ISSUE_NUM}: [Título]** (base para todo)
   - Razón: [Por qué primero]

2. **STORY-{PROJECT_KEY}-{ISSUE_NUM}: [Título]** (depende de story anterior)
   - Razón: [Por qué después]

3. **STORY-{PROJECT_KEY}-{ISSUE_NUM}: [Título]** (puede ir en paralelo)
   - Razón: [Por qué en paralelo]

(Donde los números de issue específicos se obtienen del epic.md y sus stories)

---

## Risks & Mitigations

### Risk 1: [Descripción del riesgo]

**Impact:** High | Medium | Low (explicar impacto)
**Likelihood:** High | Medium | Low
**Mitigation:**

- [Estrategia de mitigación 1]
- [Estrategia de mitigación 2]

### Risk 2: [Descripción del riesgo]

**Impact:** ...
**Likelihood:** ...
**Mitigation:**

- ...

---

## Success Criteria

**Esta feature estará completa cuando:**

- [ ] Todas las stories implementadas y deployed
- [ ] **Tipos del backend aplicados consistentemente**
  - [ ] Todas las stories usan tipos desde `@/lib/types`
  - [ ] Zero type errors relacionados a entidades del backend
  - [ ] Props de componentes tipadas correctamente en todas las stories
- [ ] **Personalidad UI/UX consistente en toda la feature**
  - [ ] Todas las stories aplican el mismo estilo visual (Minimalista/Bold/Corporativo/Playful)
  - [ ] Bordes, sombras y espaciado coherentes entre stories
  - [ ] Paleta de colores aplicada consistentemente (bg-primary, bg-secondary, etc.)
- [ ] **Content Writing contextual (NO genérico)**
  - [ ] Vocabulario del dominio usado consistentemente en todas las stories
  - [ ] Sin frases placeholder en ninguna story
  - [ ] Tono coherente con personalidad del producto
- [ ] **Protección de rutas (si aplica)**
  - [ ] Middleware actualizado con rutas de esta feature (si son privadas)
  - [ ] Rutas públicas/privadas correctamente configuradas
- [ ] 100% de test cases críticos pasando
- [ ] [Criterio específico de la feature]
- [ ] Performance targets alcanzados
- [ ] Documentation actualizada
- [ ] **Build y linting pasando**
  - [ ] `npm run build` (o equivalente) exitoso
  - [ ] Zero TypeScript errors en toda la feature
  - [ ] Linting passes en todas las stories

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

> Antes de escribir campos rich-text en Jira, leé `.claude/skills/product-management/references/jira-publishing-gotchas.md` para los dos bugs ADF conocidos y sus workarounds.

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
