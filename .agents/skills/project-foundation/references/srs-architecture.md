Write the architecture specification of the project, as a software architect and tech lead would.

**Input:**

- Full PRD: [use .context/PRD/*.md]
- Functional Specs: [use .context/SRS/functional-specs.md]
- Tech Stack: [specify the project's stack]

**Generate file: architecture-specs.md**

Include:

**1. System Architecture** (C4 Level 1-2 diagram in Mermaid)

Generate a Mermaid diagram that shows:

- User (actor)
- Frontend (Next.js app)
- Backend API (Next.js API Routes)
- Database (Supabase/PostgreSQL)
- External Services (Auth, Email, and so on)

Draw the relationships between components with arrows that show the data flow.

**2. Database Design** (ERD in Mermaid)

Generate an Entity-Relationship Diagram in Mermaid that shows:

- Main entities (based on the SRS FRs)
- Key attributes (id, main fields, timestamps)
- Relationships (1:1, 1:N, N:M)
- Cardinality

**IMPORTANT:** do not generate static SQL schemas: they drift from the real database the moment a migration lands. State that the real schema is read and changed through the DB MCP (`agentic-dev-core/references/db-change-doctrine.md`).

**3. Tech Stack Justification**

For each stack component, include:

- **Component:** (for example, Next.js)
- **Why it was chosen:**
  - ✅ Advantage 1
  - ✅ Advantage 2
  - ❌ Trade-off / disadvantage

**Example:**

- **Frontend: Next.js (App Router)**
  - ✅ React Server Components (better performance)
  - ✅ File-based routing (better DX)
  - ✅ Full-stack framework (API routes built in)
  - ❌ Trade-off: App Router has a steeper learning curve than Pages Router

**4. Data Flow** (request to response)

Describe the typical flow of one operation.

**Example: User Registration Flow**

1. User submits form (Frontend)
2. Client-side validation (Zod schema)
3. POST request to /api/auth/register
4. Server-side validation (Zod schema)
5. Check email uniqueness (Supabase query)
6. Create user (Supabase Auth)
7. Send verification email (Supabase Email)
8. Return response (201 success or 400 error)
9. Frontend handles response (redirect or show error)

**5. Code Architecture**

Name GUARD as the product architecture: four layers (app, features, adapters, platform), one direction, one door per feature, a registry. Link `agentic-dev-core/references/guard-architecture.md` instead of restating it, and list the project's first features by their business names, since each becomes a `src/features/<name>/` folder.

**6. Security Architecture**

Include:

- **Auth Flow Diagram:** (login, registration, token refresh)
- **RBAC Implementation:** (how roles and permissions are handled)
- **Data Protection:** (encryption, input sanitization)

**Format:** Markdown with embedded Mermaid diagrams, ready to copy into `.context/SRS/architecture-specs.md`

**Constraints:**

- Valid Mermaid diagrams that render
- An architecture that scales for an MVP
- Justified decisions (never "just because")

---

## 6. Seed the first ADRs (Architecture Decision Records)

This phase is where the decisions that are hardest to reverse get made. After you write `architecture-specs.md`, promote each architectural decision that passes the three gates of `adr-doctrine.md` (hard to reverse, surprising without context, a real trade-off) to a permanent record `ADR-NNNN-<slug>.md` under `.context/ADR/`, and reference those ADRs from this document.

Typical candidates in this phase: the auth and authorization model, the data-access pattern, the error and response contract, the tenancy model, the deployment topology, and framework or library choices with real lock-in (the same ones the **Tech Stack Justification** section documents with their trade-offs).

- **Detection and authoring procedure**: `agentic-dev-core/references/adr-doctrine.md` (the three gates, the promotion rule, the steps).
- **Template, lifecycle and index**: `.context/ADR/README.md`.
- **What is not an ADR**: a story's local trade-offs (they go in its `implementation-plan.md`), bug fixes, local refactors, naming.
- **Append-only**: an Accepted ADR is never rewritten. A new ADR supersedes it and links back.
- Status: a decision the human already approved (it is in the SRS or PRD they signed, or they decided it in chat or in a deck) is written `Accepted` from the start, citing where it was approved. Only a question that is still open goes in as `Proposed`. Save the decision to engram (`mem_save`, type `architecture`).
