Actúa como UX Designer y Product Manager.

**Input:**

- User Personas: [usar .context/PRD/user-personas.md]
- MVP Scope: [usar .context/PRD/mvp-scope.md]

**Genera archivo: user-journeys.md**

Mapea 2-3 user journeys principales:

**Por cada journey:**

1. **Journey Title** (ej: "Registro y primer uso")

2. **Persona:** [Cuál de las personas del PRD]

3. **Scenario:** [Contexto inicial del usuario]

4. **Steps** (flujo completo):

   **Step 1:**
   - User Action: [Qué hace el usuario]
   - System Response: [Cómo responde el sistema]
   - Pain Point: [Dónde puede fallar o frustrarse]

   **Step 2:**
   - User Action: ...
   - System Response: ...
   - Pain Point: ...

   (Continuar hasta completar el journey)

5. **Expected Outcome:** [Qué logra el usuario al final]

6. **Alternative Paths / Edge Cases:**
   - ¿Qué pasa si [error común]?
   - ¿Qué pasa si [acción no esperada]?

**Journeys recomendados:**

1. **Happy Path** (flujo ideal sin errores)
2. **Edge Case 1** (ej: error de validación, campos faltantes)
3. **Edge Case 2** (ej: usuario sin permisos, timeout)

**Formato:** Markdown estructurado, listo para copiar a .context/PRD/user-journeys.md

**Restricciones:**

- Journeys realistas (no idealizados)
- Identificar pain points en cada paso
- Cubrir tanto happy path como edge cases
