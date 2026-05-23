Actúa como Software Architect y Business Analyst.

**Input:**

- PRD completo: [usar .context/PRD/mvp-scope.md]
- User Stories: [listar todas las User Stories del PRD]

**Genera archivo: functional-specs.md**

Mapea cada User Story del PRD a Functional Requirements (FR):

**Formato por FR:**

**FR-[NUM]: [Feature] debe permitir [acción específica]**

- **Relacionado a:** Epic X, US Y.Z (del PRD)
- **Input:** [Datos de entrada esperados - tipos, formatos, validaciones]
- **Processing:** [Lógica de negocio - qué hace el sistema con el input]
- **Output:** [Resultado esperado - formato de respuesta, datos retornados]
- **Validations:** [Reglas de validación - qué debe cumplir el input]

**Ejemplo:**

**FR-001: El sistema debe permitir registro de usuarios con email**

- **Relacionado a:** EPIC-001 (User Authentication), US 1.1
- **Input:**
  - email (string, formato RFC 5321, max 254 chars)
  - password (string, min 8 chars, al menos 1 mayúscula, 1 número)
- **Processing:**
  - Validar formato de email
  - Validar fortaleza de password
  - Verificar que email no existe en DB
  - Hash password con bcrypt
  - Crear usuario en tabla users
  - Enviar email de verificación
- **Output:**
  - Success: User object con id, email, created_at
  - Error: Código de error + mensaje descriptivo
- **Validations:**
  - Email único en sistema
  - Password cumple policy de seguridad
  - Email válido según RFC

**Restricciones:**

- Mapeo 1:1 con User Stories del PRD
- FRs numerados secuencialmente (FR-001, FR-002, etc.)
- Específicos y no ambiguos
- Incluir validaciones de negocio

**Formato:** Markdown estructurado, listo para copiar a .context/SRS/functional-specs.md
