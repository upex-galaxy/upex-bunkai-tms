Actúa como Software Architect y Tech Lead.

**Input:**

- PRD completo: [usar .context/PRD/*.md]
- Functional Specs: [usar .context/SRS/functional-specs.md]
- Tech Stack: [especificar stack del proyecto]

**Genera archivo: architecture-specs.md**

Incluye:

**1. System Architecture** (diagrama C4 Level 1-2 en Mermaid)

Genera diagrama Mermaid que muestre:

- Usuario (actor)
- Frontend (Next.js App)
- Backend API (Next.js API Routes)
- Database (Supabase/PostgreSQL)
- External Services (Auth, Email, etc.)

Relaciones entre componentes con flechas indicando flujo de datos.

**2. Database Design** (ERD en Mermaid)

Genera Entity-Relationship Diagram en Mermaid que muestre:

- Entidades principales (basadas en FRs del SRS)
- Atributos clave (id, campos principales, timestamps)
- Relaciones (1:1, 1:N, N:M)
- Cardinalidad

**IMPORTANTE:** NO generar SQL schemas estáticos. Indicar que se usará Supabase MCP para obtener schema real en tiempo real.

**3. Tech Stack Justification**

Por cada componente del stack, incluir:

- **Componente:** (ej: Next.js 15)
- **Por qué elegido:**
  - ✅ Ventaja 1
  - ✅ Ventaja 2
  - ❌ Trade-off / Desventaja

**Ejemplo:**

- **Frontend: Next.js 15 (App Router)**
  - ✅ React Server Components (mejor performance)
  - ✅ Routing file-based (DX mejorada)
  - ✅ Full-stack framework (API routes integrados)
  - ❌ Trade-off: Curva de aprendizaje App Router vs Pages Router

**4. Data Flow** (request → response flow)

Describir flujo típico de una operación:

**Ejemplo: User Registration Flow**

1. User submits form (Frontend)
2. Client-side validation (Zod schema)
3. POST request to /api/auth/register
4. Server-side validation (Zod schema)
5. Check email uniqueness (Supabase query)
6. Create user (Supabase Auth)
7. Send verification email (Supabase Email)
8. Return response (201 success or 400 error)
9. Frontend handles response (redirect or show error)

**5. Security Architecture**

Incluir:

- **Auth Flow Diagram:** (login, registration, token refresh)
- **RBAC Implementation:** (cómo se manejan roles y permisos)
- **Data Protection:** (encryption, input sanitization)

**Formato:** Markdown con diagramas Mermaid embebidos, listo para copiar a .context/SRS/architecture-specs.md

**Restricciones:**

- Diagramas Mermaid válidos y renderizables
- Arquitectura escalable para MVP
- Decisiones justificadas (no solo "porque sí")

---

## 6. Seed the first ADRs (Architecture Decision Records)

Esta es la fase donde se toman las decisiones más difíciles de revertir. Después de redactar `architecture-specs.md`, promové cada decisión que pase el **doble filtro** (es **arquitectónica** Y **difícil de revertir**) a un registro permanente `ADR-NNNN-<slug>.md` bajo `.context/ADR/`, y referenciá esos ADRs desde este documento.

Candidatos típicos en esta fase: modelo de auth/authorization, patrón de data-access, contrato de error/response, modelo de tenancy, topología de deployment, y elecciones de framework/librería con lock-in real (lo mismo que la sección **Tech Stack Justification** documenta con sus trade-offs).

- **Detección + procedimiento de autoría**: `agentic-dev-core/references/adr-doctrine.md` (los dos filtros, regla de promoción, paso a paso).
- **Template + lifecycle + índice**: `.context/ADR/README.md`.
- **Lo que NO es un ADR**: trade-offs locales de una story (van en su `implementation-plan.md`), bugfixes, refactors locales, naming.
- **Append-only**: un ADR Accepted no se reescribe; se **supersede** con uno nuevo que enlaza de vuelta.
- La IA redacta como `Proposed`; el humano lo pasa a `Accepted`. Persistí la decisión en engram (`mem_save`, type `architecture`).
