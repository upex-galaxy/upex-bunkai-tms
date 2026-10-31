Actúa como Senior Backend Architect, Database Engineer, y DevOps experto.

---

## 🎯 TAREA

**🔄 FASE 3: BACKEND & DATABASE SETUP (Sincrónica - UNA sola vez)**

Crear la **infraestructura de backend base** (Database + Auth + API Layer) que será REUTILIZADA en todas las stories del MVP.

---

## ⛔ GUARD DE ENTRADA: SOLO GREENFIELD

Esta fase SOLO crea (tablas, RLS, seed, Supabase clients, `src/lib/config.ts`, `middleware.ts`, upgrades de dependencias). Antes de cualquier paso, confirmar el veredicto del guard (`SKILL.md` → "Entry gate", anti-pattern **B0**):

- Hay `.session/project-bootstrap/plan.md` con la línea `Bootstrap guard: greenfield, exit 0` → continuar.
- No hay plan (pedido suelto, subagente con solo esta referencia) → correr `bun run bootstrap:guard`. Exit 0 → continuar. Exit 2 → **DETENER**.
- Veredicto `existing-app`, ilegible o ausente → **DETENER** sin tocar nada: citar las señales que imprimió el script, decir qué habría pisado esta fase y derivar a `/project-adoption` (y a `/design-system extract` si el pedido era sobre el aspecto de la UI). Las add-ons de la Fase 3 siguen disponibles y leen el bloque `stack:`.

Nunca reemplazar el veredicto mirando el árbol a mano, ni aceptar "es greenfield" como dispensa del usuario.

---

## 📥 INPUT REQUERIDO

### 1. Contexto del Proyecto

**Leer TODOS estos archivos:**

- `.context/SRS/architecture-specs.md` - **CRÍTICO** - ERD completo, tech stack, database schema
- `.context/SRS/functional-specs.md` - Requerimientos funcionales, features
- `.context/SRS/non-functional-specs.md` - Security, performance requirements
- `.context/PRD/executive-summary.md` - Nombre del proyecto, descripción
- `.context/PRD/mvp-scope.md` - Épicas del MVP, funcionalidades principales
- `.agents/project.yaml` - Identidad del proyecto, stack y `environments.<env>.db_project_ref` (el Supabase project ref, `{{DB_PROJECT_REF}}`)
- `package.json` - Versiones de Next.js, React, dependencias existentes

**Orden de la skill:** el backend va PRIMERO. El frontend (`frontend-setup.md`) corre después y consume `src/types/supabase.ts` y los Supabase clients que produce esta fase. No hay frontend previo que analizar; si el repo ya tiene código bajo `src/app/`, se detecta para no pisarlo (B3), no como fuente de datos.

### 2. Qué identificar

1. **ERD del SRS:** Todas las tablas, relaciones, constraints del schema completo
2. **Tablas fundacionales:** Las que las épicas del MVP (`mvp-scope.md`) necesitan primero, incluida `profiles` para auth (no todas del ERD)
3. **Roles de usuario:** Admin, user, vendor, etc. (para RLS policies)
4. **Rutas protegidas:** Las que el PRD/SRS marca como autenticadas (las consume el middleware)
5. **Seed data:** Entidades y volúmenes que el PRD/SRS describe, para que el frontend tenga datos reales que mostrar

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

### MCP CRÍTICO REQUERIDO:

1. **MCP Supabase** - OBLIGATORIO
   - Para crear tablas, RLS policies, gestionar database
   - Si NO está disponible → DETENER TODO

2. **MCP Context7** - OBLIGATORIO
   - Para verificar paquetes y APIs actualizadas
   - Consultar ANTES de instalar cualquier dependencia

### Required skills (load BEFORE installing anything or making any DB-MCP call)

- **`/supabase` + `/supabase-postgres-best-practices`** (category `backend-db`): load both before Paso 0.3 (CLI install) and before the first schema, RLS or migration call through the Supabase MCP. They carry the Supabase and Postgres rules (RLS shape, indexes, migration hygiene) this phase writes against.
- Not installed → say so once, point at `bun setup` (project-level list in `cli/install.ts`) or the single `bunx skills add` line from that list, then continue. Never a silent skip, never a hard STOP (`agentic-dev-core/references/skill-composition-strategy.md` §3.5).

### CLIs Requeridos:

- Supabase CLI (se instalará si falta)
- Package manager (npm/yarn/pnpm/bun)
- Git (verificación de estado)

### Credenciales Necesarias:

- Supabase project ref: `.agents/project.yaml` → `environments.<env>.db_project_ref` (se pide al usuario solo si está en `null`)
- Supabase Project URL
- Supabase Publishable Key
- Supabase Secret Key

Nombres canónicos: los de `.env.example` (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`). El par legacy (`NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`) sigue funcionando mientras Supabase lo provisione.

---

## 🎯 OBJETIVO DE FASE 3 - BACKEND

Crear la **infraestructura de backend base** (Database + Auth + API Layer) que será REUTILIZADA en todas las stories del MVP.

**Esta fase se ejecuta UNA SOLA VEZ** antes de comenzar los sprints de implementación de features.

**Incluye:**

- ✅ Configuración de Supabase (proyecto, credenciales, CLI)
- ✅ Database schema (tablas fundacionales que el MVP necesita)
- ✅ Row Level Security (RLS) básico
- ✅ Supabase Auth (configuración, clients, middleware de sesión)
- ✅ API Layer (Supabase clients + tipados)
- ✅ Seed data realista (derivado de las entidades del PRD/SRS)
- ✅ Documentación (`.context/backend-setup.md`, `.context/api-auth.md`)

**NO incluye:**

- ❌ Implementar TODAS las tablas del ERD completo
- ❌ Funcionalidad de negocio compleja
- ❌ Features específicas de cada story (eso es Fase 6)
- ❌ Configuración de múltiples ambientes (dev/staging/prod)

**Resultado:** Backend funcional (DB + Auth + clients + tipos) listo para que `frontend-setup.md` lo consuma.

---

## 📤 OUTPUT GENERADO

### Archivos de Configuración:

- ✅ `.env` - Variables de entorno con credenciales reales (gitignored)
- ✅ `.env.example` - Template descriptivo sin credenciales (commiteado)
- ✅ `src/lib/config.ts` - Configuración centralizada con validaciones

### Supabase Clients:

- ✅ `src/lib/supabase/client.ts` - Browser client con @supabase/ssr
- ✅ `src/lib/supabase/server.ts` - Server client para Server Components
- ✅ `src/lib/supabase/admin.ts` - (Opcional) Admin client con la secret key

### Middleware y Auth:

- ✅ `middleware.ts` - Protección de rutas + refresh de sesión

### TypeScript Types:

- ✅ `src/types/supabase.ts` - Tipos auto-generados desde database schema

### Documentación:

- ✅ `.context/backend-setup.md` - Setup completo documentado
- ✅ `.context/api-auth.md` - Autenticación y autorización para APIs

### Database (en Supabase):

- ✅ Tablas fundacionales creadas con schemas
- ✅ Row Level Security policies configuradas
- ✅ Índices optimizados para performance
- ✅ Seed data realista insertado

### Dependencias:

- ✅ Dependencias actualizadas (@supabase/ssr)

---

## 🚨 RESTRICCIONES CRÍTICAS

### ❌ NO HACER:

- **NO crear tablas que el MVP todavía no necesita** - Solo fundacionales
- **NO hardcodear valores del proyecto** - Leer del contexto
- **NO correr esta fase sobre una app existente** - El guard de entrada (`bun run bootstrap:guard`) la rechaza; la app se adopta con `/project-adoption`
- **NO crear SQL scripts manuales** - Usar MCP de Supabase bajo `agentic-dev-core/references/db-change-doctrine.md` (DDL solo por `apply_migration`, nunca por `execute_sql`)
- **NO proceder sin MCP de Supabase** - Es crítico
- **NO escribir código completo en el prompt** - Usar pseudocódigo + Context7
- **NO hacer commits automáticos** - Solo recomendar
- **NO usar código de ejemplos sin verificar versiones** - Consultar Context7 primero
- **NO crear archivos .env sin consultar al usuario** - Verificar estrategia primero
- **NO asumir nombres de paquetes o imports** - Verificar con Context7 MCP
- **NO sobrescribir trabajo sin verificar git status** - Revisar estado primero

### ✅ SÍ HACER:

- **Verificar herramientas necesarias** - MCP, CLI, credenciales, git
- **Leer contexto completo** - PRD, SRS, `.agents/project.yaml`
- **Usar Context7 MCP SIEMPRE** - Antes de instalar/usar cualquier dependencia
- **Verificar archivo de env existente** - .env, .env.example
- **Centralizar configuración** - Crear archivo config para env vars
- **Crear solo tablas fundacionales** - Las que piden las épicas del MVP
- **Optimizar con índices** - Queries rápidas desde el inicio
- **Aplicar RLS básico** - Seguridad desde el inicio
- **Generar tipados TypeScript** - Supabase CLI
- **Crear seed data realista** - Entidades y volúmenes del PRD/SRS
- **Documentar todo** - Backend setup + API endpoints
- **Validar integración** - Clients, middleware y tipos compilan contra la DB real
- **Verificar versiones de Next.js y React** - Puede afectar el setup de Supabase

---

## 🔄 WORKFLOW

El proceso se divide en 8 fases ejecutadas secuencialmente. Cada fase incluye validaciones y checkpoints.

---

## 📦 FASE 0: VALIDACIONES & SETUP

**Objetivo:** Asegurar que todas las herramientas necesarias están disponibles.

### Paso 0.0: Verificar Estado de Git

**CRÍTICO - Evitar sobrescribir trabajo no guardado**

**Acción:**

```bash
git status
```

**Analizar output:**

1. **Si hay cambios sin commit:**
   - ADVERTIR al usuario claramente
   - Listar archivos modificados
   - **Preguntar:** "Tienes cambios sin commit. ¿Quieres continuar de todas formas?"
   - **Sugerir:** Hacer commit o `git stash` antes de continuar

2. **Si repo está limpio:**
   - Continuar sin avisos

3. **Si no es un repo git:**
   - Solo avisar (no es bloqueante)
   - Sugerir: `git init` si es un proyecto nuevo

**Output esperado:**

```
✅ Git status verificado
   - Estado: [limpio / cambios pendientes / no es repo git]
   - [Advertencias si aplican]
```

---

### Paso 0.1: Verificar MCP de Supabase

**CRÍTICO - Si no está disponible, DETENER TODO.**

**Acción:**

1. Intentar listar herramientas MCP disponibles
2. Buscar MCP de Supabase
3. Si NO está disponible:

   ```
   DETENER EJECUCIÓN

   ❌ MCP de Supabase NO disponible

   Este prompt requiere el MCP de Supabase para crear tablas, RLS, y gestionar la base de datos.

   Por favor:
   1. Configura el MCP de Supabase en tu entorno
   2. Reinicia y vuelve a ejecutar este prompt

   Documentación: [link a docs de MCP Supabase]
   ```

**Si está disponible:** Continuar.

---

### Paso 0.2: Resolver el Supabase project ref

**Leer primero** `.agents/project.yaml` → `environments.<env>.db_project_ref` (`{{DB_PROJECT_REF}}` del ambiente activo). Si tiene valor, usarlo sin preguntar.

**Solo si está en `null`, preguntar:** "¿Cuál es tu Supabase project ref?"

**Opciones:**

1. **Tengo un proyecto existente** → Pedir el ref
2. **Necesito crear un proyecto nuevo** → Mostrar instrucciones

**Guardar el ref en `.agents/project.yaml` (`environments.<env>.db_project_ref`) con OK del usuario**, nunca en `AGENTS.md` ni en un archivo aparte (`.agents/instructions/agent-project-variables.md` §7).

---

### Paso 0.3: Verificar Supabase CLI

**Acción:**

```bash
supabase --version
```

**Si NO está instalado:**

- Consultar Context7 para comando de instalación actualizado
- Preguntar: "¿Puedo instalarlo por ti?"
- Ejecutar instalación o mostrar instrucciones manuales

**Output:**

```
✅ Supabase CLI: v[version]
✅ MCP Supabase disponible
✅ Project ID: [project-id]
```

---

### Paso 0.4: Detectar Estrategia de Variables de Entorno

**CRÍTICO PARA EVITAR ERRORES**

**Acción:**

1. Verificar archivos existentes:

   ```bash
   ls -la | grep -E "^\.env"
   ```

2. Leer contenido de archivos encontrados

3. **Preguntar al usuario:**
   "Detecté [archivos]. ¿Cómo prefieres gestionar las variables de Supabase?"

   **Opciones:**
   - a) Usar `.env` existente
   - b) Usar `.env` (Next.js standard)
   - c) Archivo centralizado de configuración

4. Implementar estrategia elegida

**Output:**

```
✅ Estrategia: [elegida]
✅ Archivos a actualizar: [listar]
```

---

### Paso 0.5: Verificar Versiones del Stack

**CRÍTICO PARA COMPATIBILIDAD**

**Acción:**

1. Leer `package.json` → Next.js, React, TypeScript
2. Usar Context7 MCP:
   - Query: "Supabase auth Next.js [version] React [version] latest setup"
   - Identificar paquetes correctos según versiones

3. Documentar decisión:

   ```
   Versiones detectadas:
   - Next.js: [version]
   - React: [version]

   Paquetes a usar:
   - @supabase/ssr@[version] (verificado con Context7)
   - @supabase/supabase-js@[version]

   Razón: [explicar compatibilidad]
   ```

**Output:**

```
✅ Stack analizado
✅ Paquetes verificados con Context7
✅ Compatibilidad confirmada
```

---

## 📊 FASE 1: ANÁLISIS DE CONTEXTO

**Objetivo:** Comprender el proyecto y decidir qué tablas crear.

### Paso 1.1: Leer Documentación del Proyecto

**Archivos a leer:**

- `.context/SRS/architecture-specs.md` → ERD completo, tech stack
- `.context/SRS/functional-specs.md` → Requerimientos funcionales
- `.context/PRD/mvp-scope.md` → Funcionalidades principales

**Qué identificar:**

1. **ERD del SRS:** Todas las tablas, relaciones, constraints
2. **Tablas fundacionales:** Las que piden las épicas del MVP
3. **Roles de usuario:** Admin, user, vendor, etc.
4. **Seed data:** Entidades, volúmenes y rangos realistas que describe el PRD/SRS

**Output interno (no mostrar):**

- ERD completo
- Tablas fundacionales a crear
- Plan de seed data por entidad

---

### Paso 1.2: Consultar Documentación Oficial (Context7 MCP)

**OBLIGATORIO ANTES DE CUALQUIER IMPLEMENTACIÓN**

**Queries necesarias:**

1. "Supabase JavaScript client Next.js [version] App Router latest package"
2. "Supabase Auth Next.js [version] App Router setup authentication"
3. "Supabase Next.js [version] middleware authentication refresh session"
4. "Supabase Row Level Security policies best practices"
5. "Supabase CLI generate types TypeScript command"
6. "Next.js [version] environment variables best practices"
7. (Si Next.js 15+) "Next.js 15 cookies async breaking changes"

**IMPORTANTE:** NO escribir código hasta completar todas las queries.

**Output al usuario:**

````markdown
## 📚 Análisis Completado

### ERD Identificado:

- Tablas totales en SRS: [número]
- Tablas fundacionales a crear: [listar con razón]

Ejemplo:

```pseudocode
- `profiles` - Requerida por: auth
- `[entidad_core]` - Requerida por: [épica del MVP]
```
````

### Plan de Seed Data:

```pseudocode
- [entity1]: [X] registros (fuente: [sección del PRD/SRS])
- [entity2]: [Y] registros, vinculados a [entity1]
```

### Stack Técnico Verificado:

- Framework: Next.js [version] (App Router)
- Database: Supabase PostgreSQL
- Auth: Supabase Auth
- Client: @supabase/ssr@[version] (verificado con Context7)

### Decisiones:

- Paquete: @supabase/ssr (no auth-helpers - deprecado)
- Cookies: [async/sync según version]
- Env vars: [estrategia del paso 0.4]

```

---

## 🔧 FASE 1.5: INSTALACIÓN DE DEPENDENCIAS

**Objetivo:** Instalar paquetes correctos verificados con Context7.

### Paso 1.5.1: Verificar Dependencias Existentes

1. Leer `package.json` completo
2. Identificar conflictos:
   - ¿Existe `@supabase/auth-helpers-nextjs`? → Remover (deprecado)
   - ¿Existe `@supabase/supabase-js`? → Verificar versión

3. Mostrar plan:
```

Plan de dependencias:

A remover:

- @supabase/auth-helpers-nextjs (deprecado)

A instalar:

- @supabase/ssr@[version]
- @supabase/supabase-js@[version]

````

### Paso 1.5.2: Instalar Dependencias Verificadas

```bash
# Remover dependencias deprecadas (si existen)
[package-manager] remove @supabase/auth-helpers-nextjs

# Instalar versiones estables actuales
[package-manager] add @supabase/ssr@latest @supabase/supabase-js@latest
````

**Validar versiones instaladas:**

```bash
[package-manager] list | grep supabase
```

**Output esperado:**

```
✅ Dependencias Supabase instaladas:
   - @supabase/ssr@0.x.x (estable)
   - @supabase/supabase-js@2.x.x (estable)
✅ Deprecados removidos: @supabase/auth-helpers-nextjs

📋 Versiones instaladas:
   @supabase/ssr: ^0.x.x
   @supabase/supabase-js: ^2.x.x

⚠️ Si las versiones son diferentes:
   - Verificar compatibilidad con Context7
   - Asegurar que @supabase/ssr es 0.x+ (no alpha/beta)
   - Asegurar que @supabase/supabase-js es 2.x+ (no 1.x)
```

**Verificación adicional de compatibilidad:**

```bash
# Verificar versión de Next.js
[package-manager] list next

# Compatibilidad validada:
# - Next.js 15.x + @supabase/ssr 0.x ✅
# - Next.js 14.x + @supabase/ssr 0.x ✅
# - Next.js 13.x + @supabase/ssr 0.x ✅
```

---

## 🏗️ FASE 2: DATABASE SCHEMA

**Objetivo:** Crear tablas fundacionales usando MCP de Supabase.

### Paso 2.0: Leer el historial antes de escribir

**Doctrina:** `agentic-dev-core/references/db-change-doctrine.md`. Con `/supabase` + `/supabase-postgres-best-practices` ya cargadas:

1. `list_migrations` sobre el project ref del Paso 0.2: en un proyecto greenfield el historial está vacío o solo trae lo que el usuario aplicó a mano. Si trae migraciones que esta sesión no conoce, **DETENER** y mostrárselas al usuario: la base no es nueva.
2. `list_tables` (verbose) para confirmar que las tablas que se van a crear no existen.
3. Decir en voz alta el ambiente y el ref antes de la primera escritura.

### Paso 2.1: Crear Tablas Fundacionales

**IMPORTANTE:** Usar MCP de Supabase, NO scripts SQL manuales. Cada cambio de schema (tabla + sus índices, o el RLS de una tabla) es UNA migración con `apply_migration` y un nombre snake_case que diga qué cambia, así queda en el historial (`list_migrations`). `execute_sql` nunca lleva DDL. Si `stack.database.migrations_tool` es `supabase-cli`, el mismo SQL se escribe además en `stack.database.migrations_dir` como `<version>_<name>.sql` (versión leída de `list_migrations`).

**Para cada tabla fundacional:**

**Pseudocódigo:**

```
Para tabla [TABLE_NAME] del ERD:

  1. Preparar definición:
     - Nombre: [table_name] (snake_case)
     - Columnas: [según ERD + timestamps]
     - PK: id (uuid, gen_random_uuid())
     - FKs: [según relaciones]
     - Constraints: [unique, not null, defaults]

  2. Crear via MCP Supabase, como migración registrada:
     MCP_CALL: apply_migration(name: "create_[table_name]", query: [DDL])

  3. Validar creación en el destino:
     list_migrations muestra "create_[table_name]"; list_tables (verbose) muestra la tabla
```

**Convenciones:**

```pseudocode
- snake_case: `user_profiles`, `[entity]_[subentity]`
- UUID para IDs: `gen_random_uuid()`
- Timestamps: `created_at TIMESTAMPTZ DEFAULT now()`
- Soft deletes (si aplica): `deleted_at TIMESTAMPTZ`
```

**Output por tabla:**

```
✅ Tabla `[table_name]` creada
   - Columnas: [número]
   - PKs: id
   - FKs: [listar]
   - Índices: [listar]
```

---

### Paso 2.1.5: Optimizar con Índices

**NUEVO - Para performance desde el inicio**

**Para cada tabla, considerar índices en:**

- Columnas de búsqueda frecuente (email, username, slug)
- Foreign keys (automático en algunos casos)
- Campos de ordenamiento (created_at, rating, price)
- Campos de filtrado (status, category, is_active)

**Pseudocódigo:**

```
Para cada tabla:
  Analizar queries esperadas del frontend

  SI columna usada en WHERE/ORDER BY frecuentemente:
    Crear índice: CREATE INDEX idx_[table]_[column] ON [table]([column])

  SI columna es FK:
    Verificar que índice existe (debería ser automático)

  Documentar: Qué índices se crearon y razón
```

**Output:**

```pseudocode
✅ Índices optimizados:
   - profiles.email (búsquedas de login)
   - [entity_table].[sort_column] (ordenamiento)
   - [entity_table].[fk_column] (FK + filtros)
```

---

### Paso 2.2: Configurar Row Level Security (RLS)

**Para cada tabla creada:**

**Pseudocódigo:**

```
1. Habilitar RLS (DDL: va por apply_migration, nunca por execute_sql):
   MCP_CALL: apply_migration(name: "rls_[table_name]", query: "ALTER TABLE ... ENABLE ROW LEVEL SECURITY; CREATE POLICY ...")

2. Crear políticas según tipo de tabla:

   SI tabla_pública (catálogos, listados):
     POLICY: SELECT permitir a todos

   SI tabla_autenticada (perfiles, datos user):
     POLICY: SELECT solo autenticados
     POLICY: INSERT solo autenticados
     POLICY: UPDATE solo si user_id = auth.uid()
     POLICY: DELETE solo si user_id = auth.uid()

   SI tabla_admin (configuración, reportes):
     POLICY: SELECT solo si role = 'admin'
     POLICY: INSERT/UPDATE/DELETE solo admin

3. Validar políticas:
   Probar con query simulado
   get_advisors (security), si el MCP lo expone: reportar cada hallazgo nuevo
```

**ADR:** el schema fundacional y su modelo de RLS (quién lee qué en toda la app) pasan las dos compuertas de `adr-doctrine.md`. Registrar un ADR que nombre las migraciones (`<version>_<name>` de `list_migrations`), el ambiente donde se aplicaron y el statement de rollback (`db-change-doctrine.md` §4).

**Security Checklist:**

- [ ] ¿Users pueden leer datos ajenos? (Si no deben, política restrictiva)
- [ ] ¿Policies son lo más restrictivas posible?
- [ ] ¿Secret key nunca expuesta en frontend?

**Output:**

```
✅ RLS configurado en [table_name]
   - SELECT: [público/autenticado/propio]
   - INSERT: [descripción]
   - UPDATE: [descripción]
   - DELETE: [descripción]

🔒 Security verified:
   - Policies restrictivas aplicadas
   - No data leaks identificados
```

---

### Paso 2.3: Seed Data Inteligente

**Objetivo:** Que el frontend (que se scaffoldea después) tenga datos reales y creíbles que mostrar desde el primer día.

**Acción:**

**Pseudocódigo:**

````
1. Derivar el plan de seed del PRD/SRS (Fase 1):
   - Entidades fundacionales y sus relaciones
   - Volumen razonable por entidad para una demo
   - Rangos y valores realistas del dominio

2. Preguntar al usuario:
   "Propongo [X] [entidad1], [Y] [entidad2] como seed data.
    ¿Lo creo en la DB?"

   Opciones:
   a) Sí, el plan propuesto (recomendado)
   b) Crear mínimo (2-3 registros por tabla)
   c) No, dejar tablas vacías

3. SI usuario elige (a):
   Para cada entidad:
     - Crear los registros del plan
     - Mantener tipos de datos (nombres realistas, valores apropiados)
     - Preservar relaciones (FK válidos)

4. SI usuario elige (b):
   Crear 2-3 registros básicos por tabla
   Suficiente para validar queries

5. Insertar via MCP Supabase (DML, solo en un ambiente que no sea producción, con los registros aprobados por el usuario):
   MCP_CALL: execute_sql(INSERT ...)

6. Validar inserción:
   Query para confirmar datos en DB
````

**Output:**

```pseudocode
✅ Seed data creado:
   - profiles: [N] registros
   - [entity1]: [X] registros
   - [entity2]: [Y] registros (vinculados a [entity1])

📊 Datos generados:
   - [Atributos] realistas (no Lorem Ipsum)
   - Relaciones válidas (FKs correctos)
```

---

## 🔐 FASE 3: AUTH INTEGRATION

**Objetivo:** Dejar Supabase Auth configurado del lado servidor: clients, config y middleware de sesión. La UI de auth (login, signup) la construye `frontend-setup.md` sobre estos clients.

### Paso 3.1: Configurar Supabase Auth

**En Supabase Dashboard (instrucciones al usuario):**

1. Verificar Email Auth habilitado
2. Configurar redirect URLs: `http://localhost:3000/**`
3. (Opcional) OAuth providers si PRD lo menciona

---

### Paso 3.2: Crear Archivo de Configuración Centralizado

**Archivo:** `src/lib/config.ts`

**⚠️ CRÍTICO - Variables NEXT*PUBLIC*\*:**
En Next.js, las variables `NEXT_PUBLIC_*` se reemplazan **estáticamente durante el build**. NO uses acceso dinámico como `process.env[variableName]`. Siempre accede directamente: `process.env.NEXT_PUBLIC_SUPABASE_URL`.

**Pseudocódigo:**

```
Crear archivo config que:
1. Importa process.env variables con ACCESO ESTÁTICO DIRECTO
2. Exporta constantes tipadas
3. Valida que variables requeridas existen
4. Lanza errores descriptivos si faltan
5. (Opcional) Log en desarrollo sin exponer secrets

Estructura:
- supabaseUrl: NEXT_PUBLIC_SUPABASE_URL
- supabasePublishableKey: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- supabaseSecretKey: SUPABASE_SECRET_KEY (solo server)
- appUrl: NEXT_PUBLIC_APP_URL

Validaciones:
- throw Error si falta supabaseUrl
- throw Error si falta supabaseAnonKey

CORRECTO:
  export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL

INCORRECTO:
  const getEnv = (key: string) => process.env[key]  // ❌ NO funciona en cliente
  export const supabaseUrl = getEnv('NEXT_PUBLIC_SUPABASE_URL')
```

**Output:**

```
✅ Config creado: src/lib/config.ts
✅ Validaciones incluidas
✅ Type-safe exports
```

---

### Paso 3.3: Actualizar Archivos de Environment

**Según estrategia elegida en Paso 0.4:**

**Pseudocódigo:**

```
SI estrategia = "usar .env existente":
  Agregar variables a .env:
  - NEXT_PUBLIC_SUPABASE_URL=...
  - NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
  - SUPABASE_SECRET_KEY=...

SI estrategia = "usar .env":
  Crear/actualizar .env con variables

SIEMPRE:
  Verificar que .env.example ya declara estas variables (vienen en el template).
  NUNCA reescribirlo: se mantiene en paridad con cli/lib/variables-manifest.ts.
  Variable nueva → agregarla en .env.example Y en el manifest (ver Paso 6.3).
```

**Mostrar al usuario:**

```
✅ Variables de entorno configuradas
   - Archivo: .env
   - Template: .env.example verificado (sin reescribir)

⚠️ ACCIÓN REQUERIDA:
   Agrega tus credenciales reales al archivo [.env]

   Obtener credenciales:
   1. https://supabase.com/dashboard/project/[PROJECT_ID]/settings/api
   2. Copiar: URL, publishable key, secret key
   3. Pegar en tu archivo de env
```

---

### Paso 3.4: Crear Supabase Clients

**USAR CÓDIGO VERIFICADO CON CONTEXT7**

**⚠️ IMPORTANTE - Sobre config.ts:**
El archivo `config.ts` se importa tanto en cliente como servidor. Asegúrate de que las variables públicas (`NEXT_PUBLIC_*`) usen acceso estático directo, no funciones helper que lean dinámicamente de `process.env`.

**Archivos a crear:**

**1. Browser client:** `src/lib/supabase/client.ts`

**Pseudocódigo:**

```
Importar:
- createBrowserClient desde @supabase/ssr
- Database type desde @/types/supabase
- Config desde ../config

Exportar función createClient():
  Retornar: createBrowserClient<Database>(supabaseUrl, supabaseAnonKey)

NOTA: Verificar API con Context7 (puede cambiar según versión)
```

---

**2. Server client:** `src/lib/supabase/server.ts`

**Pseudocódigo (Next.js 15+ con async cookies):**

```
Importar:
- createServerClient desde @supabase/ssr
- cookies desde next/headers
- Database type, config

Exportar función createServer() async:
  cookieStore = await cookies()  // async en Next.js 15+

  Retornar createServerClient<Database>(url, key, {
    cookies: {
      getAll(): cookieStore.getAll(),
      setAll(cookies):
        try {
          cookies.forEach -> cookieStore.set()
        } catch {
          // Ignorar si llamado desde Server Component
        }
    }
  })

NOTA: Si Next.js 13-14, cookies() es sync (sin await)
```

---

**3. (Opcional) Admin client:** `src/lib/supabase/admin.ts`

**Pseudocódigo:**

```
Crear solo si necesario (bypass RLS)
Usar secret key (`SUPABASE_SECRET_KEY`)
Advertir: NUNCA usar en frontend
```

**Output:**

```
✅ Supabase clients creados:
   - client.ts (browser)
   - server.ts (server components)
   - [admin.ts] (opcional)
✅ Importan config centralizado
✅ Tipados con Database
```

---

### Paso 3.5: Crear Middleware

**Archivo:** `middleware.ts` (raíz)

**Pseudocódigo:**

```
Importar: createServerClient, NextResponse

Función middleware(req):
  1. Crear response inicial: NextResponse.next()

  2. Crear cliente Supabase con cookies del request:
     - getAll() desde req.cookies
     - setAll() actualiza req y response cookies

  3. Obtener sesión: supabase.auth.getSession()

  4. Definir rutas protegidas (del análisis de Fase 1):
     protectedRoutes = ['/[ruta_protegida_1]', '/[ruta_protegida_2]', ...]

  5. Lógica de redirect:
     SI no hay sesión Y ruta es protegida:
       Redirect a /login con param ?redirect=[ruta]

     SI hay sesión Y ruta es /login o /signup:
       Redirect a /[ruta_principal]

  6. Retornar response con cookies actualizadas

Config matcher:
  Excluir: _next/static, _next/image, favicon, assets
```

**Output:**

```
✅ Middleware creado
   - Refresh automático de sesión
   - Rutas protegidas: [listar]
   - Redirects configurados
```

---

### Paso 3.6: Hand-off de auth al frontend

No se crea ni se refactoriza ningún AuthContext en esta fase: todavía no hay frontend. Lo que esta fase entrega para que `frontend-setup.md` (Paso 5.1, página de login con `supabase.auth.signInWithPassword()`) lo use:

```
✅ src/lib/supabase/client.ts y server.ts listos
✅ middleware.ts refrescando la sesión
✅ Rutas protegidas listadas (Fase 1) para el middleware
```

---

## ✅ FASE 5: TIPADOS & VALIDACIÓN

**Objetivo:** Generar tipos TypeScript y validar integración.

**⚠️ CRÍTICO - Después de cambios en .env:**
Next.js NO detecta cambios en variables de entorno automáticamente durante desarrollo. SIEMPRE ejecutar:

```bash
rm -rf .next && [package-manager] run dev
```

para limpiar caché después de modificar `.env`.

### Paso 5.1: Verificar Versiones de Dependencias

**CRÍTICO - Validar antes de generar tipos:**

```markdown
## 🔍 Verificando Versiones de Dependencias Backend

**Propósito:** Asegurar compatibilidad entre Next.js y Supabase.
```

**Comando:**

```bash
[package-manager] list | grep -E "(next|react|supabase)"
```

**Output esperado (ejemplo; las versiones reales son las que imprime el comando):**

```
✅ Versiones Validadas:

Stack Base:
- next: 15.x.x ✓ (estable)
- react: 19.x.x ✓ (estable)
- react-dom: 19.x.x ✓ (estable)

Stack Supabase:
- @supabase/ssr: 0.x.x ✓ (estable)
- @supabase/supabase-js: 2.x.x ✓ (estable)

⚠️ Si alguna versión NO coincide:
1. Consultar Context7 MCP: "[paquete] latest stable version compatibility"
2. Actualizar: [pm] add [paquete]@latest
3. Re-ejecutar esta validación

📋 Compatibilidad crítica verificada:
- ✅ Next.js 15.x + @supabase/ssr 0.x → async cookies compatible
- ✅ React 19.x + Next.js 15.x → compatible oficialmente
```

---

### Paso 5.2: Generar Tipos de Supabase

**Comando (verificar con Context7):**

```bash
supabase gen types typescript --project-id [PROJECT_ID] > src/types/supabase.ts
```

**Validar:**

- Archivo creado: `src/types/supabase.ts`
- Contiene tipos de todas las tablas
- No hay errores de sintaxis
- El archivo no está vacío

**Explicar:**

```
✅ Tipados generados: src/types/supabase.ts

Contiene:
- Interfaces de tablas
- Tipos Row, Insert, Update
- Enums de DB
- Type-safety en queries

Uso:
import { Database } from '@/types/supabase'
type [Entity] = Database['public']['Tables']['[table_name]']['Row']

⚠️ Regenerar tipos cada vez que cambies el schema:
   supabase gen types typescript --project-id [PROJECT_ID] > src/types/supabase.ts
```

---

### Paso 5.3: Validar TypeScript

```bash
[package-manager] run types:check
# O: npx tsc --noEmit
```

**Verificar:**

- ✅ Sin errores TypeScript
- ✅ Imports correctos
- ✅ Config.ts valida
- ✅ Tipos de Supabase accesibles

**Si errores:** Revisar y corregir.

**Problemas comunes:**

```markdown
❌ Error: Cannot find module '@/types/supabase'
→ Verificar que el archivo existe
→ Verificar alias @ en tsconfig.json

❌ Error: Property 'X' does not exist on type 'Database'
→ Regenerar tipos (schema cambió)
→ Verificar nombre de tabla en minúsculas/snake_case
```

---

### Paso 5.4: Validar Build Completo

```bash
[package-manager] run build
```

**Verificar:**

- ✅ Build exitoso
- ✅ Sin warnings de env vars
- ✅ Middleware compila correctamente
- ✅ Server Components OK (sin errores de cookies)

**Si errores:** Analizar, corregir, documentar.

**Problemas comunes:**

```markdown
❌ Error: cookies() expects to be called within a request scope
→ Verificar que usas await cookies() en Next.js 15
→ Código correcto: const cookieStore = await cookies()

❌ Error: Environment variables missing
→ Verificar .env existe
→ Verificar config.ts lee correctamente
→ Verificar nombres: NEXT_PUBLIC_SUPABASE_URL (con prefijo)

❌ Error: Module not found '@supabase/ssr'
→ Re-instalar: [pm] add @supabase/ssr@latest
→ Limpiar cache: rm -rf node_modules && [pm] install
```

**Output esperado:**

```
✅ Versiones validadas (Next 15 + Supabase SSR 0.x)
✅ TypeScript validated (sin errores)
✅ Production build successful
✅ Ready for development
```

---

## 📚 FASE 6: DOCUMENTACIÓN

**Objetivo:** Documentar setup para el equipo.

### Paso 6.1: Crear backend-setup.md

**Archivo:** `.context/backend-setup.md`

**Contenido (estructura):**

```markdown
# Backend Setup - [Proyecto]

## Database Schema

[Tabla por tabla: propósito, columnas, relaciones, RLS]

## Authentication

[Provider, flujo, archivos clave]

## API Layer

[Paquetes, config, clients, uso]

## Variables de Entorno

[Estrategia, cómo obtenerlas, validación]

## Comandos Útiles

[Regenerar tipos, build, dev, etc.]

## Troubleshooting

[Errores comunes y soluciones]

## Próximos Pasos

[Features a implementar, sugerencias]
```

---

### Paso 6.2: Crear api-auth.md

**Archivo:** `.context/api-auth.md`

**Contenido (estructura):**

```markdown
# API Authentication - [Proyecto]

## Métodos de Autenticación

- Supabase Auth (cookie-based sessions)
- Flujo de autenticación (signup → login → session)

## Para Desarrolladores

### Acceder al usuario autenticado en API routes

[Código de ejemplo con getAuthenticatedUser()]

### Proteger endpoints

[Uso de middleware y RLS]

### Auth en componentes

[Cómo leer la sesión desde Server Components (server client) y Client Components (browser client)]

## Para QA/Testing

### Autenticación al probar APIs

- Las APIs protegidas requieren cookies de sesión válidas
- Login via web → Las cookies se setean automáticamente
- Para Postman: Copiar cookies desde DevTools

### Obtener tokens para testing manual

1. Hacer login en la aplicación web
2. Abrir DevTools → Application → Cookies
3. Copiar cookies `sb-*` relevantes

### Testing con DevTools

[Instrucciones para Network tab]

## Consideraciones de Seguridad

- RLS policies aplicadas a todas las tablas
- NUNCA exponer secret key en frontend
- Validar permisos en cada endpoint
```

**Nota:** La documentación de endpoints (rutas, parámetros, respuestas) se maneja via OpenAPI + Scalar UI (`/api/docs`) si se ejecutó `openapi-setup.md`.

---

### Paso 6.3: Verificar .env.example (no reescribir)

`.env.example` ya trae el bloque de Supabase y se mantiene en paridad con `cli/lib/variables-manifest.ts` (`scripts/check-vars.ts` falla si divergen). NUNCA lo reescribas con un bloque propio: borraría las demás variables del template.

- Verifica que declara `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` y `SUPABASE_SECRET_KEY`.
- Si el backend agrega una variable que el template no tiene, agrégala en `.env.example` Y en `cli/lib/variables-manifest.ts`, en el mismo commit.

---

## 🎉 FASE 7: REPORTE FINAL

### Paso 7.1: Resumen Ejecutivo

**Mostrar al usuario:**

````markdown
# 🎉 BACKEND SETUP COMPLETADO

## ✅ Lo Implementado

### 1. Database Schema

**Tablas creadas:** [número]
[Listar con propósito]

### 2. Row Level Security

- RLS habilitado
- Políticas configuradas
- Security validated

### 3. Authentication

- Supabase Auth con @supabase/ssr
- Middleware de protección

### 4. API Layer

- Clients configurados
- Config centralizado: src/lib/config.ts

### 5. Seed Data

- [x] registros creados
- Datos realistas

### 6. TypeScript

- Tipos generados: src/types/supabase.ts
- Build validated

### 7. Documentación

- .context/backend-setup.md
- .context/api-auth.md
- .env.example actualizado

---

## 🚀 Próximos Pasos INMEDIATOS

### 1️⃣ Configurar Variables (AHORA)

```bash
cp .env.example .env  # (o .env)
```
````

Edita y agrega credenciales de:
https://supabase.com/dashboard/project/[PROJECT_ID]/settings/api

El archivo src/lib/config.ts validará automáticamente.

---

### 2️⃣ Probar Integración (AHORA)

```bash
[package-manager] run dev
```

**Checklist:**

1. ✅ App inicia sin errors de env
2. ✅ Una query con el server client devuelve el seed data
3. ✅ Redirects de middleware funcionan en una ruta protegida
4. ✅ Signup / login / logout se prueban cuando `frontend-setup.md` cree la página de login

---

### 3️⃣ Verificar Database (RECOMENDADO)

1. https://supabase.com/dashboard/project/[PROJECT_ID]/editor
2. Ver tablas creadas
3. Ver seed data insertado
4. Verificar usuario en auth.users después de signup

---

### 4️⃣ Commit (RECOMENDADO)

Hacerlo con `/git-flow-master` (rutas explícitas, nunca `git add .`). Mensaje sugerido:

```
feat: Supabase backend setup

- Database schema con [X] tablas
- RLS policies configuradas
- Auth con @supabase/ssr + middleware de sesión
- Config centralizado
- Seed data realista
- Documentación completa
```

### 5️⃣ Siguiente fase

Frontend setup (`frontend-setup.md`): consume `src/types/supabase.ts` y los clients de esta fase. Requiere `DESIGN.md` (B5).

---

## 💎 Valor Generado

**Antes:**

- ❌ Sin auth
- ❌ Sin API real
- ❌ Sin DB

**Ahora:**

- ✅ Auth real (JWT, sessions)
- ✅ PostgreSQL con RLS
- ✅ API REST auto-generada
- ✅ Type-safety completo
- ✅ Config centralizado
- ✅ Dependencias actualizadas
- ✅ Lista para features

---

## 📚 Documentación

- .context/backend-setup.md
- .context/api-auth.md
- .env.example
- src/lib/config.ts

---

## 🎯 Stack Final

- Next.js [version] (App Router)
- Supabase PostgreSQL
- @supabase/ssr@[version]
- TypeScript full type-safety

---

**🎊 Backend completado exitosamente!**

Ahora implementa features con:

- ✅ DB funcional
- ✅ Auth real
- ✅ API documentada
- ✅ Type-safety garantizado


---

## 🔄 VALIDACIONES FINALES (Checklist Interno)

**NO mostrar al usuario, uso interno:**

### Pre-ejecución:
- ✅ Git status verificado
- ✅ Supabase CLI instalado
- ✅ MCP Supabase disponible
- ✅ Context7 MCP disponible

### Backend:
- ✅ Tablas fundacionales creadas
- ✅ Índices optimizados
- ✅ RLS configurado
- ✅ Security validated
- ✅ Seed data realista

### Dependencias:
- ✅ Context7 consultado ANTES de instalar
- ✅ @supabase/ssr instalado (NO auth-helpers)
- ✅ Compatibilidad verificada
- ✅ Deprecados removidos

### Environment:
- ✅ Estrategia definida con usuario
- ✅ Config centralizado creado
- ✅ .env.example actualizado
- ✅ Validaciones funcionando

### Auth:
- ✅ Supabase Auth configurado
- ✅ Middleware con patrón actualizado

### API:
- ✅ Clients configurados
- ✅ Server client async (si Next.js 15+)

### Validaciones:
- ✅ TypeScript check passed
- ✅ Build passed
- ✅ Sin errors de env vars

### Documentación:
- ✅ backend-setup.md creado
- ✅ api-auth.md creado
- ✅ .env.example descriptivo
- ✅ Troubleshooting incluido

---
