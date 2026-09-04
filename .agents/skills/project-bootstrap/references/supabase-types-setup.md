Actúa como Senior Backend Developer y TypeScript Expert.

---

## 🎯 TAREA

**🔧 FEATURE: Supabase Types Setup (Fase 3 - Infrastructure)**

Configurar el sistema de **tipado auto-generado** desde Supabase para obtener type-safety completo en todas las queries de base de datos.

---

## 📥 INPUT REQUERIDO

### 1. Contexto del Proyecto

**Leer estos archivos:**

- `package.json` - Verificar dependencias de Supabase
- `src/lib/supabase/client.ts` - Client actual (si existe)
- `src/lib/supabase/server.ts` - Server client actual (si existe)
- `src/types/supabase.ts` - Tipos actuales (si existen)
- `AGENTS.md` - Configuración de Supabase Project ID

### 2. Precondiciones

**OBLIGATORIAS:**

- ✅ Supabase configurado (de `backend-setup.md`)
- ✅ Tablas creadas en la base de datos
- ✅ Supabase Project ID conocido

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS

### MCP Requeridos:

1. **MCP Supabase** - Para verificar conexión y schema

### CLIs Requeridos:

- **Supabase CLI** - Para generar tipos (`supabase gen types`)

**Verificar instalación:**

```bash
supabase --version
```

**Si no está instalado:**

```bash
# macOS/Linux
brew install supabase/tap/supabase

# O con npm
npm install -g supabase
```

---

## 📤 OUTPUT GENERADO

### Archivos:

- ✅ `src/types/supabase.ts` - Tipos auto-generados desde schema
- ✅ `package.json` - Script `db:types` agregado
- ✅ `src/lib/supabase/client.ts` - Actualizado con generic `<Database>`
- ✅ `src/lib/supabase/server.ts` - Actualizado con generic `<Database>`

### Beneficios:

- Type-safety en todas las queries
- Autocompletado de tablas y columnas
- Detección de errores en tiempo de compilación
- Tipos Row, Insert, Update para cada tabla

---

## 🛠️ PASOS DETALLADOS

### FASE 0: Verificación de Precondiciones

**Paso 0.1: Verificar Supabase CLI**

```bash
supabase --version
```

**Si no está instalado:** Mostrar instrucciones de instalación.

**Paso 0.2: Obtener Project ID**

**Buscar en `AGENTS.md`:**

```bash
grep -i "project" AGENTS.md | grep -i "supabase\|id"
```

**Si no está documentado, preguntar al usuario:**

```
¿Cuál es tu Supabase Project ID?

Puedes encontrarlo en:
https://supabase.com/dashboard/project/[TU_PROJECT]/settings/general

El Project ID tiene formato: xxxxxxxxxxxxxxxxxxxxxxxx (24 caracteres)
```

**Guardar Project ID para uso posterior.**

---

### FASE 1: Generar Tipos de Supabase

**Paso 1.1: Ejecutar generación**

```bash
# Reemplazar [PROJECT_ID] con el valor real
bunx supabase gen types typescript --project-id [PROJECT_ID] > src/types/supabase.ts
```

**Paso 1.2: Verificar archivo generado**

```bash
# Verificar que el archivo existe y tiene contenido
wc -l src/types/supabase.ts

# Verificar estructura básica
head -30 src/types/supabase.ts
```

**Output esperado:**

```
✅ Tipos generados: src/types/supabase.ts
   - Líneas: [número] (debe ser > 50)
   - Contiene: Database type, Tables, Enums
```

**Paso 1.3: Verificar contenido**

El archivo debe contener:

```typescript
export type Database = {
  public: {
    Tables: {
      [tabla_name]: {
        Row: { ... }
        Insert: { ... }
        Update: { ... }
      }
      // ... más tablas
    }
  }
}
```

**Si el archivo está vacío o tiene error:**

1. Verificar conexión a Supabase
2. Verificar que existen tablas en la DB
3. Verificar Project ID correcto

---

### FASE 2: Actualizar Supabase Clients

**Paso 2.1: Verificar client.ts actual**

Leer `src/lib/supabase/client.ts`:

**Buscar si ya usa `<Database>`:**

```typescript
// ✅ Correcto - ya tiene generic
createBrowserClient<Database>(...)

// ❌ Incorrecto - falta generic
createBrowserClient(...)
```

**Paso 2.2: Actualizar client.ts (si necesario)**

**ANTES:**

```typescript
import { createBrowserClient } from '@supabase/ssr';

export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**DESPUÉS:**

```typescript
import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/types/supabase';

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
```

**Paso 2.3: Actualizar server.ts (si necesario)**

Aplicar el mismo patrón:

```typescript
import type { Database } from '@/types/supabase'

// En la función createServerClient
return createServerClient<Database>(...)
```

**Paso 2.4: Actualizar admin.ts (si existe)**

Si existe `src/lib/supabase/admin.ts`:

```typescript
import type { Database } from '@/types/supabase';
import { createClient } from '@supabase/supabase-js';

export const adminClient = createClient<Database>(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);
```

---

### FASE 3: Agregar Script a package.json

**Paso 3.1: Leer package.json**

```bash
cat package.json | grep -A5 '"scripts"'
```

**Paso 3.2: Agregar script db:types**

**Editar `package.json` para agregar:**

```json
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "db:types": "bunx supabase gen types typescript --project-id [PROJECT_ID] > src/types/supabase.ts"
  }
}
```

**Paso 3.3: Verificar script**

```bash
bun run db:types
```

**Output esperado:**

```
✅ Script db:types agregado
✅ Ejecutable con: bun run db:types
```

---

### FASE 4: Validación Final

**Paso 4.1: TypeScript Check**

```bash
bun run typecheck
# O: npx tsc --noEmit
```

**Si hay errores de tipos:**

- Verificar imports de `Database`
- Verificar path alias `@/types/supabase`
- Regenerar tipos si el schema cambió

**Paso 4.2: Verificar Type-Safety**

Crear un query de prueba para validar autocompletado:

```typescript
// En cualquier Server Component
const supabase = await createServer();

// Debería tener autocompletado de tablas
const { data } = await supabase
  .from('profiles') // ← Autocompletado de tablas
  .select('id, email'); // ← Autocompletado de columnas
```

**Output esperado:**

```
✅ TypeScript check: PASSED
✅ Autocompletado funcionando
✅ Tipos Row/Insert/Update disponibles
```

---

## 📋 CHECKLIST FINAL

### Archivos:

- [ ] `src/types/supabase.ts` existe y tiene tipos de todas las tablas
- [ ] `src/lib/supabase/client.ts` usa `<Database>` generic
- [ ] `src/lib/supabase/server.ts` usa `<Database>` generic
- [ ] `package.json` tiene script `db:types`

### Validaciones:

- [ ] `bun run typecheck` pasa sin errores
- [ ] `bun run db:types` regenera tipos correctamente
- [ ] Autocompletado funciona en queries

---

## 🎉 REPORTE FINAL

````markdown
# ✅ Supabase Types Setup Completado

## Archivos Creados/Actualizados:

- src/types/supabase.ts (generado)
- src/lib/supabase/client.ts (actualizado)
- src/lib/supabase/server.ts (actualizado)
- package.json (script agregado)

## Tablas Tipadas:

- [listar tablas encontradas en el schema]

## Comandos Disponibles:

- `bun run db:types` - Regenerar tipos después de cambios en DB

## Uso:

```typescript
import type { Database } from '@/types/supabase';

// Tipo de una fila completa
type Profile = Database['public']['Tables']['profiles']['Row'];

// Tipo para insertar
type NewProfile = Database['public']['Tables']['profiles']['Insert'];

// Tipo para actualizar (todo opcional)
type ProfileUpdate = Database['public']['Tables']['profiles']['Update'];
```
````

## Próximo Paso:

Regenerar tipos cada vez que modifiques el schema de la DB:

```bash
bun run db:types
```

````

---

## ❓ PREGUNTAS FRECUENTES

**P: ¿Cuándo debo regenerar los tipos?**
R: Cada vez que cambies el schema de la base de datos (agregar/modificar tablas, columnas, enums).

**P: ¿Qué pasa si el script falla?**
R: Verifica:
1. Conexión a internet
2. Project ID correcto
3. Supabase CLI actualizado (`npm update -g supabase`)

**P: ¿Los tipos incluyen funciones de PostgreSQL?**
R: Sí, las funciones RPC también se tipan automáticamente.

**P: ¿Puedo editar manualmente supabase.ts?**
R: No recomendado. Los cambios se perderán al regenerar. Si necesitas tipos custom, créalos en otro archivo que importe de supabase.ts.

---

## 🔄 MANTENIMIENTO

**Después de cambios en el schema:**

```bash
# 1. Regenerar tipos
bun run db:types

# 2. Verificar TypeScript
bun run typecheck

# 3. Commit
git add src/types/supabase.ts
git commit -m "chore: regenerate supabase types"
````

**Integración con CI/CD (opcional):**

```yaml
# En tu workflow de GitHub Actions
- name: Verify Supabase Types
  run: |
    bun run db:types
    git diff --exit-code src/types/supabase.ts || echo "Types need regeneration!"
```
