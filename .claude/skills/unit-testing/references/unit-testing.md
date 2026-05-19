Actúa como Senior QA Engineer y Test Automation Expert especializado en unit testing con Jest/Vitest.

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

- `src/**/*.ts` - Archivos TypeScript implementados en esta story
- `src/**/*.tsx` - Componentes React implementados
- `lib/**/*.ts` - Helpers y utilidades creadas
- `utils/**/*.ts` - Funciones de transformación o cálculo

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

**Verificar setup existente:**

- `package.json` - ¿Jest o Vitest instalado?
- `jest.config.js` o `vitest.config.ts` - Configuración del framework
- Archivos `.test.ts` o `.spec.ts` existentes - Patrones actuales

**Qué identificar:**

1. ¿Qué testing framework usa el proyecto? (Jest / Vitest)
2. ¿Existe configuración de coverage?
3. ¿Qué patrones de naming se usan?

---

## ⚙️ VERIFICACIÓN DE HERRAMIENTAS (MCP)

### MCP Recomendados:

1. **MCP Context7** - ALTAMENTE RECOMENDADO
   - Consultar docs oficiales antes de escribir tests
   - Queries recomendadas:
     - "Jest latest best practices"
     - "Vitest setup Next.js App Router"
     - "React Testing Library latest API"
     - "Jest mock functions examples"

2. **NO se requieren otros MCP** para esta fase

### Herramientas Locales:

- Testing framework instalado (Jest/Vitest)
- Package manager (npm/pnpm/yarn/bun)

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
- ✅ Alcanzar mínimo 80% cobertura en funciones críticas

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
- ✅ Coverage report generado (mínimo 80% en funciones críticas)

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
- **Mockear dependencias externas** - APIs, DB, servicios externos
- **Validar cobertura** - Mínimo 80% en funciones críticas
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

**Objetivo:** Asegurar que Jest/Vitest está configurado correctamente.

### Paso 2.1: Verificar Testing Framework

**Acción:**

```bash
# Verificar package.json
cat package.json | grep -E "(jest|vitest)"
```

**Si NO está instalado:**

1. **Preguntar al usuario:**
   "¿Qué testing framework prefieres?"
   - a) Jest (más común, más plugins)
   - b) Vitest (más rápido, mejor con Vite)

2. **Consultar Context7:**
   - "Jest setup Next.js latest"
   - O "Vitest setup Next.js latest"

3. **Instalar:**
   ```bash
   [package-manager] add -D jest @types/jest ts-jest
   # O: [package-manager] add -D vitest
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
  - coverageThreshold: 80%

SI framework = Vitest:
  Crear vitest.config.ts con:
  - test.globals: true
  - test.environment: node
  - coverage.provider: v8
  - coverage.reporter: text, html
```

---

### Paso 2.3: Agregar Scripts

**En `package.json`, agregar:**

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

```
✅ Testing framework configurado
✅ Scripts de test agregados
✅ Coverage configurado (threshold: 80%)
```

---

## ✍️ PASO 3: ESCRIBIR UNIT TESTS

**Objetivo:** Crear tests para cada función crítica identificada.

### Paso 3.1: Crear Archivos de Test

**Convención de naming:**

- `src/lib/discount-calculator.ts` → `src/lib/discount-calculator.test.ts`
- `src/utils/format-currency.ts` → `src/utils/format-currency.test.ts`

---

### Paso 3.2: Estructura de Tests (AAA Pattern)

**Para cada función crítica:**

**Template:**

```typescript
import { functionName } from './module';

describe('functionName', () => {
  // Happy path tests
  describe('when input is valid', () => {
    it('should return expected result for typical case', () => {
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
    it('should handle boundary value X', () => {
      // ...
    });

    it('should handle empty/null/undefined', () => {
      // ...
    });
  });

  // Error cases
  describe('error handling', () => {
    it('should throw error for invalid input Y', () => {
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
    it('should apply 10% discount', () => {
      // Arrange
      const orderAmount = 150;

      // Act
      const result = calculateDiscount(orderAmount);

      // Assert
      expect(result).toBe(135); // 150 - 15 = 135
    });

    it('should apply 10% discount for $1000 order', () => {
      expect(calculateDiscount(1000)).toBe(900);
    });
  });

  describe('when order is under $100', () => {
    it('should not apply discount', () => {
      expect(calculateDiscount(50)).toBe(50);
    });

    it('should not apply discount for $99.99', () => {
      expect(calculateDiscount(99.99)).toBe(99.99);
    });
  });

  describe('edge cases', () => {
    it('should handle exactly $100 (boundary)', () => {
      expect(calculateDiscount(100)).toBe(90);
    });

    it('should handle $0 order', () => {
      expect(calculateDiscount(0)).toBe(0);
    });

    it('should handle very large orders', () => {
      expect(calculateDiscount(1_000_000)).toBe(900_000);
    });
  });

  describe('error handling', () => {
    it('should throw error for negative amounts', () => {
      expect(() => calculateDiscount(-50)).toThrow('Order amount must be positive');
    });

    it('should throw error for NaN', () => {
      expect(() => calculateDiscount(NaN)).toThrow();
    });
  });
});
```

---

### Paso 3.4: Tests con Mocks (Si necesario)

**Si la función depende de servicios externos:**

```typescript
// src/lib/user-service.test.ts
import { getUserById } from './user-service';
import { supabase } from '@/lib/supabase/client';

// Mock Supabase client
jest.mock('@/lib/supabase/client', () => ({
  supabase: {
    from: jest.fn().mockReturnValue({
      select: jest.fn().mockReturnValue({
        eq: jest.fn().mockResolvedValue({
          data: { id: '123', name: 'John' },
          error: null,
        }),
      }),
    }),
  },
}));

describe('getUserById', () => {
  it('should return user data from Supabase', async () => {
    const result = await getUserById('123');

    expect(result).toEqual({ id: '123', name: 'John' });
    expect(supabase.from).toHaveBeenCalledWith('users');
  });
});
```

**Explicar al usuario:**

```markdown
**🔧 Mocking:**

- **Cuándo mockear:** Dependencias externas (APIs, DB, filesystem)
- **Qué mockear:** `supabase`, `fetch`, `axios`, etc.
- **Cómo mockear:** `jest.mock()` o `vi.mock()` (Vitest)
- **Por qué:** Tests unitarios deben ser rápidos y no depender de servicios externos
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

- ✅ Funciones críticas: mínimo 80% coverage
- ✅ Branch coverage: cubrir todos los if/else
- ✅ Functions coverage: todas las funciones exportadas testeadas

**Si cobertura baja:**

1. Identificar líneas no cubiertas
2. Agregar tests para esas líneas
3. Re-ejecutar coverage

---

### Paso 4.3: Validar Calidad de Tests

**Checklist de calidad:**

- [ ] ¿Tests tienen nombres descriptivos?
- [ ] ¿Se usa AAA pattern (Arrange, Act, Assert)?
- [ ] ¿Se testean casos felices Y edge cases?
- [ ] ¿Se testean error cases?
- [ ] ¿Mocks solo para dependencias externas?
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
# Run all tests
npm run test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```
````

### Coverage Requirements

- Minimum 80% coverage for business logic functions
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
npm run test

# Watch mode (útil durante desarrollo)
npm run test:watch

# Coverage report
npm run test:coverage
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
- [ ] Coverage mínimo 80% en funciones críticas
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
it('should apply 10% discount for orders over $100', () => { ... })
```

---

### **2. AAA Pattern (Arrange, Act, Assert)**

```typescript
it('should format currency correctly', () => {
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
it('should create user', () => {
  user = createUser();
});
it('should delete user', () => {
  deleteUser(user.id);
});
```

✅ Bien (cada test es independiente):

```typescript
it('should create user', () => {
  const user = createUser();
  expect(user).toBeDefined();
});

it('should delete user', () => {
  const user = createUser();
  deleteUser(user.id);
  expect(getUser(user.id)).toBeNull();
});
```

---

### **4. Mock Solo lo Necesario**

❌ Mal (mockear funciones internas):

```typescript
jest.mock('./discount-calculator'); // NO mockear lo que estás testeando
```

✅ Bien (mockear dependencias externas):

```typescript
jest.mock('@/lib/supabase/client'); // Mockear servicios externos
```

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
