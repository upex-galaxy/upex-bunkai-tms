# Non-Functional Specifications — Bunkai MVP

> Quantified targets, MVP-realistic. Refine after design-partner cohort produces real telemetry.
> Stack assumed: Next.js 15 (App Router, RSC) on Vercel + Supabase (PostgreSQL 16, Auth, Realtime, Storage) + Cloudflare R2 (run evidence blobs).

---

## 1. Performance

| Metric                                                                             | Target (MVP)                           |
| ---------------------------------------------------------------------------------- | -------------------------------------- |
| **LCP** (Largest Contentful Paint) on Project View                                 | < 2.0s p75                             |
| **TTI** (Time to Interactive) on Project View                                      | < 3.0s p75                             |
| **API response time** — single-entity reads (`GET /atcs/{id}`)                     | < 200ms p95                            |
| **API response time** — listing endpoints (paged, 50 rows)                         | < 500ms p95                            |
| **API response time** — tree view query (recursive CTE)                            | < 800ms p95 at 500 modules / 5000 ATCs |
| **Realtime propagation latency** (Supabase Realtime row change → connected client) | < 1.5s p95                             |
| **DB query** simple PK reads                                                       | < 50ms p95                             |
| **DB query** complex JOINs (run + run_atcs + run_steps + ATCs + steps)             | < 200ms p95                            |
| **Concurrent active users per workspace**                                          | 50 (MVP target) / 500 (Phase 2)        |
| **Bulk operations** (e.g. import 100 user stories from Jira)                       | < 30s end-to-end                       |

### Performance budgets (frontend)

- Initial JS bundle on Project View ≤ 300KB gzipped (after RSC + code-splitting Monaco + React Flow off-route).
- CSS budget ≤ 60KB gzipped.
- LCP must hit on Vercel free tier from cold cache.

## 2. Security

| Concern                        | Approach                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Authentication**             | Supabase Auth (email + magic link + GitHub OAuth + Google OAuth) for end-users; Bunkai Personal Access Tokens (Bearer, sha-256-hashed at rest) for API/CLI.                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| **Authorization**              | RBAC at Workspace level (`owner                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | admin | member | viewer`) enforced by Supabase Row Level Security (RLS) policies on every table that carries `workspace_id`. Application-layer checks for non-CRUD actions (invite, role change). |
| **Data encryption at rest**    | Supabase-managed (AES-256). R2 blobs encrypted at rest by Cloudflare.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **Data encryption in transit** | HTTPS / TLS 1.3 only. HSTS enabled with 1-year max-age. Vercel-managed cert.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Input validation**           | Zod schemas server-side AND client-side. Markdown sanitized via `rehype-sanitize` before render; user-supplied HTML stripped.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |
| **OWASP Top 10**               | A01 (broken access control) — RLS policies + scoped tokens. A02 (cryptographic failures) — TLS + Supabase encryption. A03 (injection) — parameterized queries via Supabase client, Zod validation. A04 (insecure design) — see Architecture spec §5. A05 (security misconfig) — env-var-driven config; secrets in Vercel/Supabase vaults. A07 (auth failures) — Supabase Auth handles rate-limit + brute-force protection. A08 (data integrity) — idempotency keys + audit-light log. A09 (logging) — Sentry + Supabase logs. A10 (SSRF) — webhook URLs validated against an allowlist (no `localhost`, no private IPs). |
| **Session management**         | Supabase JWT, 1h access token, 30d refresh token, sliding renewal. Logout revokes refresh token server-side.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Password policy**            | Magic-link primary; if password fallback enabled later, min 12 chars + zxcvbn score ≥ 3.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| **API rate limits**            | 100 req/min/token for write endpoints; 600 req/min for reads. 429 responses include `Retry-After`. Token-scoped (per workspace, not global).                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| **Secrets**                    | Never in code. `.env` for local; Vercel env vars for prod/staging. `bunkai vars:check` lints absence.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    |
| **CSP**                        | Strict; `script-src 'self'` + nonces for inline; `connect-src` allowlist (Supabase URL, R2, Sentry, PostHog).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            |

## 3. Scalability

- **Database**: Postgres-only for MVP. Partition `run_steps` by `created_at` month if rows exceed ~20M; not required for MVP cohort.
- **Connection pooling**: Supabase Supavisor (transaction-mode pooler) for serverless Vercel; direct connection limit 60.
- **Caching**:
  - HTTP — `Cache-Control: private, max-age=60, stale-while-revalidate=300` on read endpoints that tolerate eventual consistency (tree view, dashboards).
  - ISR — N/A for MVP (no public-facing pages beyond marketing).
  - In-memory — React Query / TanStack Query for client-side de-duplication and stale-while-revalidate.
- **Horizontal scaling**: API routes are stateless — Vercel handles scale-out automatically. WebSocket / SSE channels in Phase 2 require a Redis pub/sub for multi-instance fan-out.
- **Blob storage**: Cloudflare R2 with signed URLs (5-min expiry) for run evidence — egress-free, predictable cost.
- **Search indexing**: Postgres `tsvector` GIN indexes for {{PROJECT_KEY}}-011 + {{PROJECT_KEY}}-031. Move to Meilisearch / Typesense only if p95 search latency degrades past 500ms.

## 4. Accessibility (WCAG 2.1 AA)

- **Contrast**: every default token combination in DESIGN.md meets AA (verified in §10 of DESIGN.md).
- **Keyboard navigation**: every interactive element reachable + actionable via keyboard. Command palette (Cmd/Ctrl+K) is the keyboard-first entry point.
- **Screen reader support**: ARIA labels on icon-only buttons; semantic HTML for tree (`role="tree"`, `role="treeitem"`), table (native `<table>`), command palette (`role="combobox"` + `aria-activedescendant`).
- **Focus indicators**: 1px accent outline on `:focus-visible`. Never removed.
- **Reduced motion**: `prefers-reduced-motion: reduce` disables caret blink + dot pulse.
- **Skip-to-content** link on every shell-rendered page.

## 5. Browser support

- **Desktop**: latest 2 versions of Chrome, Firefox, Safari, Edge.
- **Mobile**: latest 2 versions of iOS Safari + Android Chrome — read-only acceptable for MVP (run execution is desktop-first). Mobile-optimized run-execution flow targeted Phase 2.

## 6. Reliability

- **Uptime target**: 99.5% in MVP (Vercel + Supabase headline 99.99% each). Reassess to 99.9% post-PMF.
- **Error rate**: < 1% of API requests 5xx.
- **Recovery time** for critical incidents: < 30 min MTTR (paging via Sentry → Slack).
- **Backups**: Supabase daily automated backups, 7-day retention (paid plan). Manual `pg_dump` snapshot before every schema migration.
- **Migrations**: forward-only, backward-compatible. Soft-delete columns added before drops. No destructive migrations.

## 7. Maintainability

- **Code coverage**: ≥ 70% lines / ≥ 65% branches on services + API routes (target raised after MVP). UI components covered via component tests + Playwright e2e.
- **Lint / format**: ESLint + Prettier enforced in pre-commit (Husky) + CI.
- **TypeScript**: strict mode (`"strict": true`), `noUncheckedIndexedAccess`, `noImplicitOverride`, `exactOptionalPropertyTypes`.
- **Documentation**: README, OpenAPI spec, ADRs (`docs/decisions/`) for stack-level decisions, ATC authoring guide.
- **Observability**:
  - Sentry — frontend + backend errors with breadcrumbs.
  - PostHog — product analytics (workspace-scoped, opt-in cohorts).
  - Supabase logs — DB query stats.
  - Vercel Analytics — Web Vitals.
- **Feature flags**: a lightweight in-DB flag table (`feature_flags`) for gating Phase 2 features (semantic search, agentic mode, mind-map). PostHog feature flags secondary, used for cohort-targeted rollouts.

## 8. Internationalization (i18n)

- MVP launches English-only. Spanish-first translation Phase 2 (founder's primary audience).
- Architectural support from day one: `next-intl` (or similar) in place; all UI strings via translation keys, not literals.
- Markdown content (US, AC, ATC steps) is user-generated and not translated — stored as-is.

## 9. Compliance (Enterprise / Phase 3 horizon)

- **SOC 2 Type I/II**: not required for MVP; designed-toward (audit log primitives, encryption, RBAC) so retrofit is bounded.
- **GDPR**: Workspace owners can request data export + deletion via Settings. PII minimized (email, display name, avatar URL only).
- **Self-hosted edition**: when Phase 2 ships, compliance becomes the operator's responsibility — but Bunkai documents the controls.

---

## Cross-references

- API rate-limits and idempotency: `.context/SRS/api-contracts.yaml` + `.context/SRS/functional-specs.md` ({{PROJECT_KEY}}-037).
- Architecture decisions that derive from these NFRs: `.context/SRS/architecture-specs.md`.
- Color contrast and accessibility detail: `DESIGN.md`.
