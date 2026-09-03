Actúa como Product Manager con enfoque en priorización.

**Input:**

- Executive Summary: [usar .context/PRD/executive-summary.md]
- User Personas: [usar .context/PRD/user-personas.md]
- Business Model: [usar .context/business/business-model.md]

**Genera archivo: mvp-scope.md**

Define:

1. **In Scope (Must Have)** - Features core del MVP

   Organizado por épicas (5-7 épicas recomendadas)

   **Por cada épica:**
   - Epic ID: EPIC-[PROYECTO]-[NUM]
   - Epic Title: [Categoría funcional]
   - User Stories (3-5 user stories high-level):
     - US ID.SubID: Como [user], quiero [action], para [benefit]

   **Ejemplo:**
   - Epic 1: User Authentication & Authorization
     - US 1.1: Como usuario, quiero registrarme con email para acceder a la plataforma
     - US 1.2: Como usuario, quiero hacer login con mis credenciales para acceder a mi cuenta
     - US 1.3: Como usuario, quiero recuperar mi contraseña si la olvido

2. **Out of Scope (Nice to Have)** - Para v2+
   - Features que no son críticos para MVP
   - Mejoras futuras
   - Integraciones avanzadas

3. **Success Criteria** - ¿Cuándo consideramos el MVP exitoso?
   - Criterios de aceptación del MVP completo
   - Métricas mínimas a alcanzar
   - Condiciones para lanzamiento

**Formato:** Markdown estructurado con bullets, listo para copiar a .context/PRD/mvp-scope.md

**Restricciones:**

- Épicas balanceadas (no muy grandes ni muy pequeñas)
- User Stories en formato estándar: "Como [rol], quiero [acción], para [beneficio]"
- Priorización clara (must have vs nice to have)
