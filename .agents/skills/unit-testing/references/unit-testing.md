Actúa como Senior QA Engineer y Test Automation Expert especializado en unit testing con el runner que la app ya usa (`stack.test_runner` en `.agents/project.yaml`: Vitest, Jest, Bun test, …).

---

## 🎯 TAREA

**FASE 7: UNIT TESTING (Durante Implementation)**

Crear unit tests para funciones y lógica de negocio implementadas en la story actual, asegurando cobertura de casos críticos y edge cases.

**Este prompt se ejecuta DURANTE o INMEDIATAMENTE DESPUÉS de implementar una story** en Fase 7: Implementation.

---

## 📥 INPUT REQUERIDO

### 1. Story Actual

**Leer TODOS estos archivos:**

- `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/story.md` - **CRÍTICO** - Descripción de la story, criterios de aceptación
- `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/implementation-plan.md` - Plan técnico, módulos a crear
- `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/acceptance-test-plan.md` - (Optional) Acceptance test cases, if available from upstream planning

**Qué identificar:**

1. **Funcionalidad implementada:** Qué hace la story
2. **Criterios de aceptación:** Qué debe cumplir
3. **Módulos creados:** Qué archivos se implementaron

### 2. Código Implementado

**Buscar y analizar:**

- Los archivos que la story creó o cambió (`git diff --name-only` contra la rama base), bajo `{{stack.app_root}}`
- Componentes, helpers, utilidades y funciones de transformación o cálculo entre esos archivos

Las carpetas de los ejemplos de abajo (`src/lib/`, `src/utils/`) son ilustrativas: la app adoptada puede tener otra estructura (`lib/` en la raíz, paquetes de un monorepo) y se respeta la suya.

**Qué identificar:**

1. **Funciones con lógica de negocio compleja:**
   - Cálculos matemáticos o financieros
   - Transformaciones de datos
   - Validaciones complejas
   - Algoritmos de negocio

2. **Funciones críticas:**
   - Helpers reutilizables en múltiples partes
   - Utilidades de formateo o parsing
   - Validadores de datos

3. **Funciones que NO necesitan unit tests:**
   - Componentes React simples (solo presentacionales)
   - Código que solo llama APIs (eso es integration test)
   - Configuraciones o constantes
   - Wrappers triviales

### 3. Testing Framework

**Leer primero el bloque `stack:` de `.agents/project.yaml`:**

- `stack.test_runner` - el runner de la app (`vitest`, `jest`, `bun`, `playwright`, `other`, `none`; `null` = todavía no se eligió)
- `stack.scripts.test` - el NOMBRE del script de tests en el `package.json` de la app; el comando es `{{stack.package_manager}} run {{stack.scripts.test}}`
- `stack.app_root` - dónde vive la app (y su `package.json`)

**Después verificar el setup existente bajo `{{stack.app_root}}`:**

- La config del runner (`vitest.config.*`, `jest.config.*`, `bunfig.toml`, …) - entorno, setup files, aliases, coverage
- Archivos `*.test.*` / `*.spec.*` existentes - ubicación (colocados, `__tests__/`, `tests/`) y naming actuales

**Qué identificar:**

1. ¿El runner de `stack.test_runner` coincide con lo que el repo muestra? Si no coincide, decirlo y correr `bun run setup:doctor` (reporta el drift); nunca cambiar de runner por cuenta propia
2. ¿Existe configuración de coverage?
3. ¿Qué patrones de ubicación y naming se usan? Los tests nuevos los siguen

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

### MCP Recomendados:

1. **MCP Context7** - ALTAMENTE RECOMENDADO
   - Consultar docs oficiales antes de escribir tests
   - Queries recomendadas:
     - "<runner de stack.test_runner> latest best practices"
     - "<runner> setup <stack.framework>"
     - "React Testing Library latest API"
     - "<runner> mock functions examples"

2. **NO se requieren otros MCP** para esta fase

### Herramientas Locales:

- El runner de `stack.test_runner`
- El package manager de `stack.package_manager`

---

## 🎯 OBJETIVO DE UNIT TESTING

Crear unit tests que:

**Incluye:**

- ✅ Testear funciones con lógica de negocio compleja
- ✅ Testear helpers y utilidades reutilizables
- ✅ Testear transformaciones de datos y cálculos
- ✅ Cubrir casos felices (happy paths)
- ✅ Cubrir edge cases (límites, vacíos, nulls)
- ✅ Cubrir error cases (inputs inválidos)
- ✅ Cubrir cada branch con significado de las funciones críticas (objetivos por tipo de código en `references/test-coverage.md` § Targets by code type; la cobertura es un piso, no una meta: SKILL.md U6)

**NO incluye:**

- ❌ Tests de componentes React (eso es component testing, opcional)
- ❌ Tests de integración con APIs (out of scope — separate integration test layer)
- ❌ Tests E2E (out of scope — separate E2E test layer)
- ❌ Testear código trivial sin lógica

**Resultado:** Funciones críticas testeadas con alta cobertura y confianza en refactorings.

---

## 📤 OUTPUT GENERADO

### Archivos de Tests:

- ✅ `src/lib/[module].test.ts` - Unit tests para helpers/utilities
- ✅ `src/utils/[function].test.ts` - Unit tests para funciones de transformación
- ✅ (Más archivos según módulos implementados)

### Configuración (Si no existe):

- ✅ `jest.config.js` o `vitest.config.ts` - Configuración del testing framework
- ✅ `package.json` - Scripts de test actualizados

### Reports:

- ✅ Tests pasando localmente (100% pass rate)
- ✅ Coverage report generado (branch coverage leído contra `references/test-coverage.md` § Targets by code type)

### Documentación:

- ✅ README.md actualizado con comando de tests (si aplica)

---

## 🚨 RESTRICCIONES CRÍTICAS

### ❌ NO HACER:

- **NO testear TODO** - Solo funciones con lógica compleja
- **NO testear componentes UI triviales** - Focus en lógica de negocio
- **NO testear código de terceros** - Ya está testeado por sus autores
- **NO crear tests que solo verifican implementación** - Tests deben verificar comportamiento
- **NO hardcodear valores** - Usa variables descriptivas
- **NO ejecutar comandos interactivos** - Solo comandos que terminen
- **NO mockear sin razón** - Solo mockea dependencias externas

### ✅ SÍ HACER:

- **Usar Context7 MCP** - Consultar docs de Jest/Vitest antes de escribir
- **Identificar funciones críticas** - Analizar qué necesita tests
- **Escribir tests descriptivos** - Nombres claros de qué testea
- **Cubrir edge cases** - Valores límite, vacíos, nulls, undefined
- **Cubrir error cases** - Inputs inválidos, excepciones
- **Usar AAA pattern** - Arrange, Act, Assert
- **Aislar dependencias externas** - APIs, DB, servicios externos: inyección en el seam primero, `jest.mock` / `vi.mock` solo si el seam es inevitable
- **Validar cobertura** - Branch coverage por tipo de código (`references/test-coverage.md`), nunca un número global como meta
- **Documentar tests complejos** - Comentarios si el test no es obvio

---

## 🔄 WORKFLOW

El proceso se divide en 5 pasos ejecutados secuencialmente.

---

## 📋 PASO 1: ANÁLISIS DE CÓDIGO IMPLEMENTADO

**Objetivo:** Identificar qué funciones necesitan unit tests.

### Paso 1.1: Leer Story y Código

**Acción:**

1. Leer `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/story.md`
2. Leer `.context/PBI/epics/EPIC-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/stories/STORY-{PROJECT_KEY}-{ISSUE_NUM}-{nombre}/implementation-plan.md`
3. Buscar archivos implementados en esta story:
   ```bash
   # El AI puede usar grep/find para identificar módulos nuevos
   ```

**Output interno (no mostrar):**

- Lista de archivos implementados
- Lista de funciones en cada archivo
- Clasificación: ¿necesita test? ¿por qué?

---

### Paso 1.2: Clasificar Funciones

**Para cada función encontrada, clasificar en:**

**🟢 CRÍTICA - Requiere unit test:**

- Lógica de negocio compleja
- Cálculos matemáticos o financieros
- Transformaciones de datos
- Validaciones complejas
- Helpers reutilizables

**🟡 OPCIONAL - Test recomendado pero no crítico:**

- Funciones simples pero reutilizadas
- Formatters y parsers básicos

**🔴 NO TESTEAR:**

- Componentes React solo presentacionales
- Código que solo llama APIs
- Configuraciones o constantes
- Wrappers triviales sin lógica

---

### Paso 1.3: Crear Lista de Tests a Implementar

**Mostrar al usuario:**

```markdown
## 📊 Análisis de Funciones Implementadas

### Archivos revisados:

- src/lib/discount-calculator.ts
- src/utils/format-currency.ts
- src/components/PriceCard.tsx (solo UI - sin tests)

### Funciones CRÍTICAS que requieren unit tests:

#### 1. `calculateDiscount()` - `src/lib/discount-calculator.ts`

**Razón:** Lógica de negocio crítica (cálculo de precios)
**Casos a testear:**

- ✅ Happy path: descuento aplicado correctamente
- ✅ Edge case: orden de exactamente $100
- ✅ Edge case: orden de $0
- ✅ Error case: valores negativos

#### 2. `formatCurrency()` - `src/utils/format-currency.ts`

**Razón:** Helper reutilizable en múltiples componentes
**Casos a testear:**

- ✅ Happy path: formato correcto con decimales
- ✅ Edge case: valores muy grandes
- ✅ Edge case: null/undefined
- ✅ Diferentes monedas

### Funciones que NO necesitan tests:

- `PriceCard.tsx` - Componente presentacional (solo renderiza props)
```

---

## 🧪 PASO 2: SETUP DEL TESTING FRAMEWORK (Si no existe)

**Objetivo:** Asegurar que el runner de la app está configurado correctamente.

**Este paso corre SOLO cuando `stack.test_runner` es `null`** (proyecto nuevo, runner sin elegir). Con cualquier otro valor la app ya decidió: se usa su runner, su config y su script tal como están, y este paso se salta entero. Nunca se instala un segundo runner al lado del existente ni se reemplaza uno por otro.

### Paso 2.1: Verificar Testing Framework

**Acción:**

```bash
# Confirmar en el package.json de la app (bajo stack.app_root) que no hay runner
grep -E '"(jest|vitest)"|bun test' {{stack.app_root}}/package.json
```

**Si NO está instalado:**

1. **Preguntar al usuario:**
   "¿Qué testing framework prefieres?"
   - a) Jest (más común, más plugins)
   - b) Vitest (más rápido, mejor con Vite)

2. **Consultar Context7:**
   - "Jest setup Next.js latest"
   - O "Vitest setup Next.js latest"

3. **Instalar** con el package manager de la app:
   ```bash
   {{stack.package_manager}} add -D jest @types/jest ts-jest
   # O: {{stack.package_manager}} add -D vitest
   ```

---

### Paso 2.2: Crear Configuración

**Si no existe `jest.config.js` o `vitest.config.ts`:**

**Pseudocódigo:**

```
SI framework = Jest:
  Crear jest.config.js con:
  - preset: ts-jest
  - testEnvironment: node
  - collectCoverageFrom: src/**/*.ts (excluir .test.ts)
  - coverageThreshold: SOLO por archivo para los critical paths que el equipo nombre explícitamente
    (sin umbral global: `references/test-coverage.md` § Coverage in CI usa gates por delta en el PR)

SI framework = Vitest:
  Crear vitest.config.ts con:
  - test.globals: true
  - test.environment: node
  - coverage.provider: v8
  - coverage.reporter: text, html
  - coverage.thresholds: mismo criterio que Jest (solo critical paths nombrados, sin umbral global)
```

---

### Paso 2.3: Agregar Scripts

**Solo si `stack.scripts.test` es `null`**: un script que la app ya declara no se renombra ni se reemplaza. En el `package.json` de la app, agregar:

```json
{
  "scripts": {
    "test": "jest", // O "vitest"
    "test:watch": "jest --watch", // O "vitest --watch"
    "test:coverage": "jest --coverage" // O "vitest --coverage"
  }
}
```

**Output:**

Después, registrar la elección en el bloque `stack:`: `bun run agents:setup --stack` (detecta el runner y el script nuevos y propone los valores con su evidencia).

```
✅ Testing framework configurado
✅ Scripts de test agregados
✅ stack.test_runner + stack.scripts.test registrados
✅ Coverage configurado (umbrales solo en critical paths nombrados; gates por delta en CI)
```

---

## ✍️ PASO 3: ESCRIBIR UNIT TESTS

**Objetivo:** Crear tests para cada función crítica identificada.

### Paso 3.1: Crear Archivos de Test

**Convención de naming:** la que ya usan los tests hermanos de la app (Paso 3 del input). Sin precedente, colocado junto al módulo:

- `src/lib/discount-calculator.ts` → `src/lib/discount-calculator.test.ts`
- `src/utils/format-currency.ts` → `src/utils/format-currency.test.ts`

---

### Paso 3.2: Estructura de Tests (AAA Pattern)

**Para cada función crítica:**

**Template** (nombres en presente indicativo, `returns` y no `should return`: `references/test-naming.md` § Naming heuristics):

```typescript
import { functionName } from './module';

describe('functionName', () => {
  // Happy path tests
  describe('when input is valid', () => {
    it('returns expected result for typical case', () => {
      // Arrange
      const input = validInput;
      const expected = expectedOutput;

      // Act
      const result = functionName(input);

      // Assert
      expect(result).toBe(expected);
    });
  });

  // Edge cases
  describe('edge cases', () => {
    it('handles boundary value X', () => {
      // ...
    });

    it('handles empty/null/undefined', () => {
      // ...
    });
  });

  // Error cases
  describe('error handling', () => {
    it('throws for invalid input Y', () => {
      expect(() => functionName(invalidInput)).toThrow();
    });
  });
});
```

---

### Paso 3.3: Ejemplo Completo

**Mostrar al usuario un ejemplo completo:**

```typescript
// src/lib/discount-calculator.test.ts
import { calculateDiscount } from './discount-calculator';

describe('calculateDiscount', () => {
  describe('when order is over $100', () => {
    it('applies 10% discount', () => {
      // Arrange
      const orderAmount = 150;

      // Act
      const result = calculateDiscount(orderAmount);

      // Assert
      expect(result).toBe(135); // 150 - 15 = 135
    });

    it('applies 10% discount for $1000 order', () => {
      expect(calculateDiscount(1000)).toBe(900);
    });
  });

  describe('when order is under $100', () => {
    it('does not apply discount', () => {
      expect(calculateDiscount(50)).toBe(50);
    });

    it('does not apply discount for $99.99', () => {
      expect(calculateDiscount(99.99)).toBe(99.99);
    });
  });

  describe('edge cases', () => {
    it('applies discount at exactly $100 (boundary)', () => {
      expect(calculateDiscount(100)).toBe(90);
    });

    it('returns 0 for a $0 order', () => {
      expect(calculateDiscount(0)).toBe(0);
    });

    it('applies discount to very large orders', () => {
      expect(calculateDiscount(1_000_000)).toBe(900_000);
    });
  });

  describe('error handling', () => {
    it('throws for negative amounts', () => {
      expect(() => calculateDiscount(-50)).toThrow('Order amount must be positive');
    });

    it('throws for NaN', () => {
      expect(() => calculateDiscount(NaN)).toThrow();
    });
  });
});
```

---

### Paso 3.4: Tests con dependencias externas (Si necesario)

**Si la función depende de servicios externos, primero inyección de dependencias en el seam** (SKILL.md U7, `references/mocking-patterns.md` § Dependency injection makes mocking easier): la función recibe el cliente como parámetro y el test le pasa un fake explícito.

```typescript
// src/lib/user-service.ts
import { supabase as defaultClient } from '@/lib/supabase/client';

export async function getUserById(id: string, client = defaultClient) {
  const { data, error } = await client.from('users').select('id, name').eq('id', id).single();
  if (error) throw new Error(error.message);
  return data;
}

// src/lib/user-service.test.ts
import { getUserById } from './user-service';

function fakeClient(result: { data: unknown; error: { message: string } | null }) {
  return {
    from: () => ({ select: () => ({ eq: () => ({ single: async () => result }) }) }),
  } as unknown as Parameters<typeof getUserById>[1];
}

describe('getUserById', () => {
  it('returns the user row', async () => {
    const client = fakeClient({ data: { id: '123', name: 'John' }, error: null });
    expect(await getUserById('123', client)).toEqual({ id: '123', name: 'John' });
  });

  it('throws the Supabase error message', async () => {
    const client = fakeClient({ data: null, error: { message: 'not found' } });
    await expect(getUserById('123', client)).rejects.toThrow('not found');
  });
});
```

**Explicar al usuario:**

```markdown
**🔧 Dependencias externas:**

- **Cuándo reemplazarlas:** APIs, DB, filesystem, tiempo, aleatoriedad (límites reales del sistema)
- **Cómo, en orden:** 1) inyección de dependencias en el seam + fake explícito; 2) `jest.mock()` / `vi.mock()` solo cuando el seam es inevitable (side effects a nivel de módulo, SDK de terceros que no se puede inyectar)
- **Qué afirmar:** el resultado y el error observables, no la cadena de llamadas al cliente (SKILL.md U1)
- **Por qué:** tests unitarios rápidos, sin servicios externos y sin acoplarse a la implementación
```

---

## ✅ PASO 4: VALIDAR TESTS

**Objetivo:** Asegurar que tests pasan y cobertura es adecuada.

### Paso 4.1: Ejecutar Tests

```bash
[package-manager] run test
```

**Verificar:**

- ✅ Todos los tests pasan (100% pass rate)
- ✅ No hay errores de importación
- ✅ No hay warnings críticos

**Si fallan tests:**

1. Leer error message
2. Identificar qué test falló
3. Debuggear:
   - ¿El test está mal escrito?
   - ¿La función tiene un bug?
4. Corregir y re-ejecutar

---

### Paso 4.2: Validar Cobertura

```bash
[package-manager] run test:coverage
```

**Analizar reporte:**

```
----------------------|---------|----------|---------|---------|
File                  | % Stmts | % Branch | % Funcs | % Lines |
----------------------|---------|----------|---------|---------|
lib/discount-calculator.ts | 100    | 100      | 100     | 100     |
utils/format-currency.ts   | 95     | 87.5     | 100     | 95      |
----------------------|---------|----------|---------|---------|
```

**Validaciones:**

- ✅ Funciones críticas: branch coverage dentro del rango de su tipo de código (`references/test-coverage.md` § Targets by code type), y ningún error path sin test
- ✅ Branch coverage: cubrir todos los if/else
- ✅ Functions coverage: todas las funciones exportadas testeadas

**Si cobertura baja:**

1. Identificar los branches no cubiertos
2. Agregar tests para los que tienen comportamiento propio (no tests de relleno para subir el número: SKILL.md U6)
3. Re-ejecutar coverage

---

### Paso 4.3: Validar Calidad de Tests

**Checklist de calidad:**

- [ ] ¿Tests tienen nombres descriptivos?
- [ ] ¿Se usa AAA pattern (Arrange, Act, Assert)?
- [ ] ¿Se testean casos felices Y edge cases?
- [ ] ¿Se testean error cases?
- [ ] ¿Dependencias externas reemplazadas por inyección en el seam, con `jest.mock` / `vi.mock` solo donde el seam es inevitable?
- [ ] ¿Tests son independientes (no dependen de orden)?
- [ ] ¿Tests son rápidos (< 1 segundo cada uno)?

---

## 📚 PASO 5: DOCUMENTACIÓN

**Objetivo:** Documentar cómo ejecutar tests.

### Paso 5.1: Actualizar README (Si aplica)

**Si el proyecto tiene README.md, agregar sección:**

````markdown
## 🧪 Running Tests

### Unit Tests

```bash
# Run all tests (the app's own script: stack.scripts.test)
{{stack.package_manager}} run {{stack.scripts.test}}

# Watch / coverage: the app's own scripts when it declares them; otherwise pass the runner flag
{{stack.package_manager}} run {{stack.scripts.test}} --watch
{{stack.package_manager}} run {{stack.scripts.test}} --coverage
```
````

### Coverage Requirements

- Coverage is a floor, not a target: CI gates on the coverage delta of each PR, not on a global number
- All critical paths must be tested

````

---

## 🎉 REPORTE FINAL

**Mostrar al usuario:**

```markdown
# ✅ UNIT TESTS COMPLETADOS

## Tests Creados:

### 1. `src/lib/discount-calculator.test.ts`
- ✅ 8 test cases
- ✅ 100% coverage
- ✅ Happy paths, edge cases, error cases cubiertos

### 2. `src/utils/format-currency.test.ts`
- ✅ 6 test cases
- ✅ 95% coverage
- ✅ Diferentes monedas testeadas

## Métricas:

- **Total tests:** 14
- **Pass rate:** 100% (14/14 passing)
- **Coverage:** 97.5% average
  - Statements: 98%
  - Branches: 95%
  - Functions: 100%
  - Lines: 97%

## Comandos:

```bash
# Run tests
{{stack.package_manager}} run {{stack.scripts.test}}

# Watch mode (útil durante desarrollo)
{{stack.package_manager}} run {{stack.scripts.test}} --watch

# Coverage report
{{stack.package_manager}} run {{stack.scripts.test}} --coverage
````

## Próximos Pasos:

1. ✅ Tests unitarios completados
2. ⏭️ Continuar con implementación de features
3. ⏭️ Integration / E2E tests are handled separately (out of scope for this skill)

---

**🎊 Funciones críticas testeadas con alta cobertura!**

````

---

## 📋 CHECKLIST INTERNO (NO MOSTRAR)

**Validaciones antes de finalizar:**

### Análisis:
- [ ] Story actual leída y comprendida
- [ ] Código implementado analizado
- [ ] Funciones críticas identificadas
- [ ] Funciones triviales descartadas

### Setup:
- [ ] Testing framework instalado (Jest/Vitest)
- [ ] Configuración creada
- [ ] Scripts de test agregados a package.json
- [ ] Coverage configurado

### Tests:
- [ ] Archivos .test.ts creados
- [ ] Convención de naming seguida
- [ ] AAA pattern usado
- [ ] Happy paths cubiertos
- [ ] Edge cases cubiertos
- [ ] Error cases cubiertos
- [ ] Mocks usados apropiadamente

### Validación:
- [ ] Todos los tests pasan (100%)
- [ ] Branch coverage de funciones críticas leído contra `references/test-coverage.md` (piso, no meta)
- [ ] No hay warnings críticos
- [ ] Tests son rápidos (< 1s cada uno)

### Documentación:
- [ ] README actualizado (si aplica)
- [ ] Reporte final mostrado al usuario

---

## 💡 MEJORES PRÁCTICAS

### **1. Test Names Descriptivos**

❌ Mal:
```typescript
it('test 1', () => { ... })
````

✅ Bien:

```typescript
it('applies 10% discount for orders over $100', () => { ... })
```

---

### **2. AAA Pattern (Arrange, Act, Assert)**

```typescript
it('formats USD amount with thousands separator', () => {
  // Arrange - Setup
  const amount = 1234.56;
  const currency = 'USD';

  // Act - Execute
  const result = formatCurrency(amount, currency);

  // Assert - Verify
  expect(result).toBe('$1,234.56');
});
```

---

### **3. Test Isolation**

❌ Mal (tests dependen de orden):

```typescript
let user;
it('creates user', () => {
  user = createUser();
});
it('deletes user', () => {
  deleteUser(user.id);
});
```

✅ Bien (cada test es independiente):

```typescript
it('creates user', () => {
  const user = createUser({ name: 'Ana' });
  expect(user).toEqual({ id: expect.any(String), name: 'Ana' });
});

it('deletes user', () => {
  const user = createUser();
  deleteUser(user.id);
  expect(getUser(user.id)).toBeNull();
});
```

---

### **4. Mock Solo lo Necesario**

❌ Mal (mockear lo que estás testeando):

```typescript
jest.mock('./discount-calculator'); // NO mockear la unidad bajo test
```

✅ Bien (inyectar la dependencia externa en el seam):

```typescript
const client = fakeClient({ data: { id: '1', name: 'Ana' }, error: null });
expect(await getUserById('1', client)).toEqual({ id: '1', name: 'Ana' });
```

`jest.mock('@/lib/supabase/client')` queda para cuando el seam es inevitable (SKILL.md U7).

---

## 📚 REFERENCIAS

**Jest Documentation:**

- https://jestjs.io/docs/getting-started
- https://jestjs.io/docs/expect

**Vitest Documentation:**

- https://vitest.dev/guide/
- https://vitest.dev/api/

**Testing Best Practices:**

- https://kentcdodds.com/blog/common-mistakes-with-react-testing-library
- https://testingjavascript.com/

---

**✅ Unit tests = Confianza en refactorings + Documentación viva del comportamiento esperado**
