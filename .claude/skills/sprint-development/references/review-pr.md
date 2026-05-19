Actúa como Senior Tech Lead y Code Reviewer experto.

---

## 🎯 TAREA

Realizar code review estático completo del código implementado para **STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}**.

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

### Context7 MCP (Recomendado)

**¿Está disponible?** [Verificar si puedes acceder a `[DOCS_TOOL]`]

**Si NO está disponible:**

```
⚠️ MCP Context7 no detectado

Para revisar código según best practices actuales, recomiendo conectar Context7 MCP.

**¿Continuar sin Context7?**
Puedo continuar, pero la revisión se basará en conocimiento interno (puede estar desactualizado).

**Opciones:**
1. ⏸️ Pausa y conecta Context7 (recomendado)
2. ▶️ Continúa sin Context7
```

---

## 📚 CONTEXTO REQUERIDO

**DEBES leer:**

### 1. Story y Plan:

```
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/story.md
.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/implementation-plan.md
```

**Propósito:**

- Entender Acceptance Criteria (qué debe cumplir)
- Entender approach técnico planificado

### 2. Code Standards (DEV):

```
references/code-standards.md
references/error-handling.md
references/data-testid-standards.md
```

**Propósito:**

- Checklist de estándares de código
- Reglas de manejo de errores
- Estándares de data-testid para identidad de componentes

### 3. Design System (si hay UI):

```
.context/design-system.md
```

**Propósito:**

- Validar que usa componentes correctos
- Validar paleta de colores aplicada

### 4. Código implementado:

- Diff completo de la implementación
- Archivos creados/modificados

---

## 🔍 CHECKLIST DE REVIEW (Orden de revisión)

### 1. ✅ **Acceptance Criteria**

**Revisar:**

- [ ] Todos los AC de `story.md` se cumplen
- [ ] Funcionalidad implementada correctamente
- [ ] Edge cases considerados (según los AC y el implementation plan)

**Si algún AC no se cumple:**

- 🚨 **CRITICAL** - Blocker para approval

---

### 2. 🔧 **Linting y Build**

**Ejecutar (si es posible):**

```bash
npm run lint:check    # o: bun run lint:check
npm run build   # o: bun run build
```

**Revisar:**

- [ ] **Linting:** Sin errores de ESLint
- [ ] **TypeScript:** Sin errores de compilación
- [ ] **Build:** Exitoso

**Si hay errores:**

- 🚨 **CRITICAL** - Debe corregirse antes de merge

**Si NO puedes ejecutar:**

- Instruir al usuario a ejecutar y reportar resultado

---

### 3. 📐 **Code Standards** (CRÍTICO)

**Revisar archivo por archivo:**

#### A) **DRY (Don't Repeat Yourself)**

- [ ] No hay código duplicado
- [ ] Lógica repetida extraída a funciones reutilizables
- [ ] Componentes UI reutilizan design system

**Ejemplo de violación:**

```typescript
// ❌ MAL - Código duplicado
function getUserName() {
  const user = await fetch('/api/user');
  return user.name;
}

function getUserEmail() {
  const user = await fetch('/api/user'); // Duplicado
  return user.email;
}

// ✅ BIEN - DRY
async function getUser() {
  return await fetch('/api/user');
}
```

#### B) **Naming Conventions**

- [ ] Variables: `camelCase` descriptivas
- [ ] Funciones: `camelCase` con verbos (`getUserData`, `handleClick`)
- [ ] Componentes React: `PascalCase`
- [ ] Constantes: `UPPER_SNAKE_CASE`
- [ ] No nombres genéricos (`data`, `temp`, `x`)

**Ejemplo de violación:**

```typescript
// ❌ MAL
const data = getUserData();
const x = 5;

// ✅ BIEN
const userData = getUserData();
const maxRetryAttempts = 5;
```

#### C) **TypeScript Strict**

- [ ] No usa `any` (salvo excepciones justificadas)
- [ ] Tipos explícitos en parámetros y retornos
- [ ] Interfaces/types definidos para objetos complejos
- [ ] No usa `@ts-ignore` sin comentario explicativo

**Ejemplo de violación:**

```typescript
// ❌ MAL
function processData(data: any) {
  return data.map((item: any) => item.value);
}

// ✅ BIEN
interface DataItem {
  value: string;
  id: number;
}

function processData(data: DataItem[]): string[] {
  return data.map(item => item.value);
}
```

#### D) **Error Handling**

- [ ] Try-catch en operaciones async
- [ ] NO usa `console.error()` (usar logger apropiado)
- [ ] Errores específicos, no genéricos
- [ ] Mensajes de error útiles para debugging

**Ejemplo de violación:**

```typescript
// ❌ MAL
async function fetchData() {
  const data = await fetch('/api/data'); // Sin error handling
  console.error('Error'); // No específico
}

// ✅ BIEN
async function fetchData(): Promise<Data[]> {
  try {
    const response = await fetch('/api/data');
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    logger.error('Failed to fetch data', { error });
    throw error;
  }
}
```

#### E) **Magic Numbers y Hardcoding**

- [ ] No valores hardcodeados (usar constants/env vars)
- [ ] No API keys/secrets en código
- [ ] Configuración en archivos apropiados

**Ejemplo de violación:**

```typescript
// ❌ MAL
const apiKey = 'sk-1234567890'  // Hardcoded secret
if (users.length > 50) {  // Magic number

// ✅ BIEN
const apiKey = process.env.API_KEY
const MAX_USERS_PER_PAGE = 50
if (users.length > MAX_USERS_PER_PAGE) {
```

---

### 4. 🏗️ **Architecture & Structure**

**Revisar:**

- [ ] Estructura de carpetas correcta (según proyecto)
- [ ] Separación de concerns:
  - UI (componentes) ≠ Logic (hooks, utils) ≠ Data (API calls)
- [ ] Componentes reutilizables (no duplicados)
- [ ] Imports organizados (React → libraries → local)

**Ejemplo de buena estructura:**

```
app/
├── [feature]/
│   ├── page.tsx          # UI (componente)
│   └── components/
│       └── [DomainCard].tsx
lib/
├── api/
│   └── [domain-entity].ts        # Data (API calls)
└── hooks/
    └── use[DomainEntity].ts     # Logic (custom hook)
```

(Donde [feature], [DomainCard], [domain-entity] se determinan según el dominio del proyecto. Ejemplos: mentors/MentorCard/useMentors en MYM, products/ProductCard/useProducts en SHOP)

---

### 5. 🔒 **Security** (CRÍTICO)

**Revisar:**

- [ ] **NO secrets hardcodeados** (API keys, tokens, passwords)
- [ ] **Validación de inputs de usuario** (sanitización)
- [ ] **SQL injection prevention** (si usa queries SQL directas)
- [ ] **XSS prevention** (no `dangerouslySetInnerHTML` sin sanitizar)
- [ ] **Auth checks** (rutas protegidas tienen auth)

**Ejemplo de violación:**

```typescript
// ❌ MAL - Secret hardcodeado
const dbUrl = 'postgresql://user:password@localhost/db'

// ✅ BIEN - Env var
const dbUrl = process.env.DATABASE_URL

// ❌ MAL - No validación de input
function createUser(email: string) {
  db.query(`INSERT INTO users (email) VALUES ('${email}')`)  // SQL injection

// ✅ BIEN - Input validado y query parametrizada
function createUser(email: string) {
  if (!isValidEmail(email)) throw new Error('Invalid email')
  db.query('INSERT INTO users (email) VALUES ($1)', [email])
}
```

**Si encuentras secret hardcodeado:**

- 🚨 **CRITICAL** - Blocker absoluto para approval

---

### 6. ⚡ **Performance Básico**

**Revisar:**

- [ ] No loops innecesarios o anidados complejos (O(n²))
- [ ] React: Usa `useMemo`/`useCallback` si hay cálculos costosos
- [ ] No refetch innecesario de datos
- [ ] Queries optimizadas (no N+1 queries)
- [ ] Lazy loading de componentes pesados (si aplica)

**Ejemplo de problema:**

```typescript
// ❌ MAL - N+1 queries
users.forEach(user => {
  const posts = await fetchPostsByUser(user.id); // N queries
});

// ✅ BIEN - Una query
const allPosts = await fetchAllPosts();
const postsByUser = groupBy(allPosts, 'userId');
```

---

### 7. 🎨 **UI/UX** (Si la story tiene interfaz)

**Revisar:**

- [ ] **Usa componentes del design system** (Button, Card, Input, etc.)
- [ ] **Paleta de colores correcta** (`bg-primary`, no `bg-blue-500`)
- [ ] **Responsive design** (mobile, tablet, desktop)
- [ ] **Loading states** (skeleton, spinner)
- [ ] **Error states** (mensaje + retry)
- [ ] **Empty states** (mensaje + CTA)
- [ ] **Accesibilidad básica:**
  - Labels en inputs
  - Alt text en imágenes
  - Keyboard navigation funciona

**Ejemplo de violación:**

```tsx
// ❌ MAL - No usa design system, color hardcodeado
<button className="bg-blue-500 px-4 py-2">Click me</button>;

// ✅ BIEN - Usa design system
import { Button } from '@/components/ui/button';
<Button variant="primary">Click me</Button>;
```

---

### 8. 🧪 **Data-TestID para Identidad de Componentes**

**Revisar según `references/data-testid-standards.md`:**

- [ ] **Componentes de dominio** (MentorCard, LoginForm, etc.) tienen `data-testid` en su **definición**
- [ ] **Componentes UI base** (Button, Card, Input de shadcn) reciben `data-testid` donde se **usan**, NO en su definición
- [ ] **Nomenclatura correcta:**
  - Root del componente: `camelCase` (`data-testid="mentorCard"`)
  - Elementos internos: `snake_case` (`data-testid="submit_button"`)
- [ ] **NO hay IDs dinámicos:** ❌ `data-testid={`card-${id}`}`

**Ejemplo de violación:**

```tsx
// ❌ MAL - ID dinámico (impredecible para tests)
<Card data-testid={`mentor-${mentor.id}`}>

// ❌ MAL - data-testid en definición de componente UI base
// components/ui/button.tsx
export function Button({ children }) {
  return <button data-testid="button">{children}</button>  // NO
}

// ✅ BIEN - Componente de dominio con data-testid en definición
export function MentorCard({ mentor }) {
  return (
    <Card data-testid="mentorCard">
      <h3 data-testid="mentor_name">{mentor.name}</h3>
      <Button data-testid="book_session_button">Agendar</Button>
    </Card>
  )
}
```

**Si falta data-testid en componentes UI críticos:**

- ⚠️ **MEDIUM** - Reduce la estabilidad de selectores y dificulta la automatización futura

---

### 9. 📝 **Code Quality General**

**Revisar:**

- [ ] Funciones pequeñas (< 50 líneas idealmente)
- [ ] Comentarios solo donde necesario (código auto-explicativo)
- [ ] No código comentado (borrar, no comentar)
- [ ] No console.logs olvidados
- [ ] Imports no usados eliminados

---

## ⚠️ LO QUE NO REVISA ESTA FASE

**Tests automatizados:**

- ❌ NO revisar tests unitarios (ya creados durante la implementación)
- ❌ NO revisar tests de integración / E2E (fuera del alcance del code review estático)
- ❌ NO revisar test coverage (se evalúa en otro proceso)

**Razón:** Este review se enfoca en la calidad del código, AC y arquitectura. Los tests automatizados de capas superiores se manejan en su propio flujo.

---

## 💬 OUTPUT ESPERADO (Reporte Completo)

```markdown
# Code Review: STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}

**Reviewer:** [Tu rol: Tech Lead]
**Date:** [Fecha]

---

## 🎯 Decisión

- [ ] ✅ **APPROVED** - Listo para integrar / desplegar
- [ ] ⚠️ **APPROVED with comments** - Merge + crear issues para mejoras menores
- [ ] ❌ **CHANGES REQUESTED** - Corregir critical/medium issues antes de continuar

---

## ✅ Cumplimiento de Acceptance Criteria

**Story:** [Título de la story]

| AC                 | Status         | Notas                         |
| ------------------ | -------------- | ----------------------------- |
| AC1: [Descripción] | ✅ Cumplido    | [Comentario opcional]         |
| AC2: [Descripción] | ✅ Cumplido    | [Comentario opcional]         |
| AC3: [Descripción] | ❌ NO cumplido | **Razón:** [Explicar por qué] |

---

## 🔍 Issues Encontrados

### 🚨 CRITICAL (debe corregirse - blocker):

1. **`app/api/users/route.ts:15`** - API key hardcodeada
   - **Problema:** `const apiKey = 'sk-123456'`
   - **Razón:** Security risk
   - **Sugerencia:** Mover a `process.env.API_KEY`

2. **`lib/db.ts:23`** - SQL injection vulnerability
   - **Problema:** Query no parametrizada
   - **Razón:** Security risk
   - **Sugerencia:** Usar queries parametrizadas

### ⚠️ MEDIUM (debería corregirse):

3. **`components/[EntityList].tsx:45`** - Código duplicado
   - **Problema:** Lógica de filtrado repetida en 3 lugares
   - **Razón:** Viola DRY
   - **Sugerencia:** Extraer a hook `use[Entity]Filters()`

4. **`app/[feature]/page.tsx:12`** - Hardcoded color
   - **Problema:** `className="bg-blue-500"`
   - **Razón:** No usa design system
   - **Sugerencia:** Usar `bg-primary` del design system

(Donde [EntityList], [Entity], [feature] se determinan según el dominio. Ejemplos: MentorList/useMentorFilters/mentors en MYM, ProductList/useProductFilters/products en SHOP)

### 💡 NITPICKS (opcional - mejoras):

5. **`lib/utils.ts:8`** - Nombre de variable poco descriptivo
   - **Problema:** `const data = fetchData()`
   - **Sugerencia:** `const [entity]Data = fetch[Entity]Data()`

6. **`components/[DomainCard].tsx:15`** - Console.log olvidado
   - **Problema:** `console.log('[entity]:', [entity])`
   - **Sugerencia:** Eliminar

(Donde [entity], [Entity], [DomainCard] se determinan según el dominio. Ejemplos: mentorData/fetchMentorData/MentorCard en MYM)

---

## ✅ Aspectos Positivos

- ✅ Buena separación de concerns (UI / Logic / Data)
- ✅ Componentes del design system usados correctamente
- ✅ Error handling implementado en API calls
- ✅ TypeScript strict mode respetado
- ✅ Responsive design implementado

---

## 🔧 Linting & Build

- **ESLint:** ✅ Sin errores / ❌ 3 errores (detallar)
- **TypeScript:** ✅ Sin errores / ❌ 2 errores (detallar)
- **Build:** ✅ Exitoso / ❌ Falla (detallar)

---

## 📊 Métricas

- **Archivos creados:** X
- **Archivos modificados:** Y
- **Líneas agregadas:** +Z
- **Líneas eliminadas:** -W

---

## 💬 Comentarios Adicionales

[Feedback general para el developer]

---

## 🎯 Próximos Pasos

**Si APPROVED:**

- Proceder a integrar / desplegar la story

**Si CHANGES REQUESTED:**

- Developer corrige critical/medium issues
- Re-review después de correcciones
```

---

## 🎯 EJEMPLO DE USO

```markdown
Revisa el código implementado para STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}.

**Contexto:**

- Story: .context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/story.md
- Implementation plan: .../ implementation-plan.md
- Code standards: .claude/skills/sprint-development/references/ (code-standards.md, error-handling.md, data-testid-standards.md)

(Donde {PROJECT_KEY}, {ISSUE_NUM}, {nombre} se obtienen de la story que estás revisando)

**Proceso:**

1. Valida que AC se cumplen
2. Ejecuta linting + build (o instruye al usuario)
3. Revisa código según checklist completo
4. Genera reporte con decisión: APPROVE / CHANGES REQUESTED

**Importante:**

- Usa Context7 MCP si dudas de best practices
- NO revises tests automatizados aquí (este flujo solo cubre el code review estático)
- Sé específico en feedback (archivo:línea)
```

---

**Nota:** Este flujo revisa código estáticamente. Los unit tests son responsabilidad de la implementación; los integration/E2E tests viven en su propio proceso.
