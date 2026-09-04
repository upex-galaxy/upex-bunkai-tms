Actúa como Senior DevOps Engineer y Code Quality Expert.

---

## 🎯 TAREA

Configurar **ESLint + Prettier** en el proyecto actual (si no está configurado).

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

### Context7 MCP (Recomendado)

**¿Está disponible?** [Verificar si puedes acceder a `[DOCS_TOOL]`]

**Si ESTÁ disponible:**

- Consultar docs oficiales de ESLint, Prettier, y framework del proyecto

**Si NO está disponible:**

```
⚠️ MCP Context7 no detectado

Para configurar linting con best practices actuales, recomiendo conectar Context7 MCP.

**¿Continuar sin Context7?**
Puedo continuar, pero usaré configuración genérica (puede no ser óptima).
```

---

## 🔍 PASO 1: Detectar Framework y Estado Actual

### 1.1 Identificar framework del proyecto

**Lee estos archivos:**

- `package.json` - Identificar framework (Next.js, React+Vite, etc.)
- `.eslintrc.*` o `eslint.config.js` - Ver si ya existe configuración
- `.prettierrc.*` - Ver si ya existe Prettier

**Output:**

```markdown
## Análisis del Proyecto

**Framework detectado:** [Next.js / React+Vite / etc.]
**Package manager:** [npm / pnpm / bun]

**Estado actual:**

- ESLint: ✅ Configurado / ❌ No configurado
- Prettier: ✅ Configurado / ❌ No configurado

**Próximo paso:** [Configurar desde cero / Actualizar / Ya está OK]
```

---

## 📦 PASO 2: Instalar Dependencias (Si no están)

**⚠️ IMPORTANTE:** NO ejecutar scripts interactivos como `npm init @eslint/config`.

### 2.1 Instalar packages manualmente

**Comando a ejecutar:**

```bash
[npm/pnpm/bun] install -D eslint prettier eslint-config-prettier eslint-plugin-prettier
```

**Para Next.js:**

```bash
[npm/pnpm/bun] install -D eslint-config-next
```

**Para React (sin Next.js):**

```bash
[npm/pnpm/bun] install -D eslint-plugin-react eslint-plugin-react-hooks
```

**Para TypeScript:**

```bash
[npm/pnpm/bun] install -D @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

---

## ⚙️ PASO 3: Crear Archivos de Configuración

**⚠️ CRÍTICO:** Crear archivos manualmente, NO ejecutar scripts interactivos.

### 3.1 Crear `.eslintrc.json` (o `.eslintrc.js`)

**Consulta Context7 MCP:** Buscar configuración oficial del framework.

**Ejemplo para Next.js:**

```json
{
  "extends": ["next/core-web-vitals", "plugin:@typescript-eslint/recommended", "prettier"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

**Ejemplo para React+Vite:**

```json
{
  "env": {
    "browser": true,
    "es2021": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaFeatures": {
      "jsx": true
    },
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": ["react", "react-hooks", "@typescript-eslint"],
  "rules": {
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-explicit-any": "error",
    "no-console": "warn"
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
```

---

### 3.2 Crear `.prettierrc` (o `.prettierrc.json`)

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "avoid"
}
```

**Nota:** Ajustar según preferencias del equipo.

---

### 3.3 Crear `.eslintignore`

```
node_modules
.next
out
dist
build
.env*
*.config.js
```

---

### 3.4 Crear `.prettierignore`

```
node_modules
.next
out
dist
build
*.md
pnpm-lock.yaml
package-lock.json
```

---

## 📝 PASO 4: Agregar Scripts a `package.json`

**Edita `package.json` y agrega:**

```json
{
  "scripts": {
    "lint": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "format": "prettier --write \"**/*.{ts,tsx,js,jsx,json,css,md}\""
  }
}
```

---

## ✅ PASO 5: Validar Configuración

**Ejecutar comandos:**

### 5.1 Probar linting

```bash
[npm/pnpm/bun] run lint:check
```

**Resultado esperado:**

- ✅ Se ejecuta sin errores de configuración
- Puede mostrar warnings/errors de código (eso es normal)

### 5.2 Probar fix automático

```bash
[npm/pnpm/bun] run lint:fix
```

**Resultado esperado:**

- Corrige issues automáticamente (formateo, imports, etc.)

### 5.3 Probar Prettier

```bash
[npm/pnpm/bun] run format:fix
```

**Resultado esperado:**

- Formatea todos los archivos según reglas

---

## 📋 PASO 6: Setup de Editor (Recomendaciones para el usuario)

**Recomienda al usuario:**

### Para VS Code:

1. **Instalar extensiones:**
   - ESLint (dbaeumer.vscode-eslint)
   - Prettier (esbenp.prettier-vscode)

2. **Configurar auto-format on save:**
   - Crear `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

---

## 💬 OUTPUT ESPERADO

````markdown
## ✅ Linting Configurado Exitosamente

### Dependencias instaladas:

- eslint
- prettier
- eslint-config-prettier
- eslint-plugin-prettier
- [Otros según framework]

### Archivos creados:

- `.eslintrc.json` - Configuración ESLint
- `.prettierrc` - Configuración Prettier
- `.eslintignore` - Archivos ignorados por ESLint
- `.prettierignore` - Archivos ignorados por Prettier

### Scripts agregados a `package.json`:

- `npm run lint:check` - Ejecutar linting
- `npm run lint:fix` - Fix automático
- `npm run format:fix` - Formatear código

### ✅ Validación:

- ✅ `npm run lint:check` ejecuta sin errores de configuración
- ✅ `npm run format:fix` formatea archivos

### 📋 Próximos Pasos:

1. **Ejecutar linting en código existente:**
   ```bash
   npm run lint:check
   ```
````

- Revisar warnings/errors
- Corregir issues críticos

2. **Fix automático (si es seguro):**

   ```bash
   npm run lint:fix
   npm run format:fix
   ```

3. **Configurar editor:**
   - Instalar extensiones ESLint + Prettier
   - Configurar auto-format on save

4. **Continuar con Code Review:**
   - Ahora que linting está configurado
   - Usar `references/review-pr.md` (sibling en este skill)

### ⚠️ Notas:

- Algunos warnings existentes son normales (código legacy)
- Priorizar corregir errors sobre warnings
- Configurar pre-commit hooks (Husky) es recomendado para el futuro

````

---

## 🎯 EJEMPLO DE USO

```markdown
Configura ESLint y Prettier para este proyecto Next.js.

**Proceso:**
1. Detecta el framework y estado actual
2. Instala dependencias necesarias
3. Crea archivos de configuración manualmente (NO scripts interactivos)
4. Agrega scripts a package.json
5. Valida que funciona (npm run lint:check)

**Importante:**
- Usa Context7 MCP para consultar configuración oficial de Next.js
- NO ejecutes scripts interactivos (ej: npm init @eslint/config)
- Crea archivos manualmente
````

---

## ⚠️ TROUBLESHOOTING

### Problema: Script interactivo requerido

**Ejemplo:** `npm init @eslint/config` pide input interactivo

**❌ NO ejecutar**

**✅ Solución:**

```markdown
Este comando requiere input interactivo. En su lugar:

**Opción 1 (Recomendado):** Crear configuración manualmente

- He creado `.eslintrc.json` con configuración apropiada
- Basada en docs oficiales de [Framework]

**Opción 2:** Usuario ejecuta manualmente

1. Abre terminal
2. Ejecuta: npm init @eslint/config
3. Selecciona: [Opciones recomendadas]
```

---

**Nota:** Después de configurar linting, procede con code review (Fase 8) usando `review-pr.md`.
