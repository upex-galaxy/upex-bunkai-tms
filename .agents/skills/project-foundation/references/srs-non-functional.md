Define the non-functional requirements of the project, as a software architect and performance engineer would.

**Input:**

- PRD: [use .context/PRD/executive-summary.md]
- Tech Stack: [specify the project's tech stack]

**Generate file: non-functional-specs.md**

Define the NFRs (Non-Functional Requirements) in these categories:

**1. Performance**

- **Page Load Time:** < 2s (LCP, Largest Contentful Paint)
- **API Response Time:** < 500ms (p95)
- **Time to Interactive (TTI):** < 3s
- **Concurrent Users:** [number] (MVP), [number] (v2)
- **Database Query Time:** < 100ms for simple queries

**2. Security**

- **Authentication:** JWT tokens via Supabase Auth (or an alternative)
- **Authorization:** RBAC (roles: user, admin, and so on)
- **Data Encryption:**
  - At rest: Supabase automatic encryption
  - In transit: HTTPS/TLS 1.3
- **Input Validation:** server-side and client-side
- **Password Policy:** min 8 chars, 1 uppercase letter, 1 number, 1 symbol (optional)
- **Session Management:** token expiration [time], refresh token strategy
- **OWASP Top 10:** mitigations for the common vulnerabilities

**3. Scalability**

- **Database:** PostgreSQL with Row Level Security (RLS)
- **CDN:** Vercel Edge Network (or an alternative)
- **Caching Strategy:**
  - ISR (Incremental Static Regeneration) for pages
  - API caching with headers (Cache-Control)
- **Horizontal Scaling:** stateless API routes (ready for multiple instances)
- **Database Connection Pooling:** via Supabase (or a specific configuration)

**4. Accessibility**

- **WCAG Compliance:** Level AA (WCAG 2.1)
- **Keyboard Navigation:** every feature reachable by keyboard
- **Screen Reader Support:** ARIA labels on critical elements
- **Color Contrast:** at least 4.5:1 for normal text
- **Focus Indicators:** visible on every interactive element

**5. Browser Support**

- **Desktop:**
  - Chrome (last 2 versions)
  - Firefox (last 2 versions)
  - Safari (last 2 versions)
  - Edge (last 2 versions)
- **Mobile:**
  - iOS Safari (last 2 versions)
  - Android Chrome (last 2 versions)

**6. Reliability**

- **Uptime:** 99.9% (target)
- **Error Rate:** < 1% of requests
- **Recovery Time:** < 5 min for critical incidents

**7. Maintainability**

- **Code Coverage:** > 80% for unit tests
- **Documentation:** README, API docs, architecture diagrams
- **Linting:** ESLint/Prettier configured
- **TypeScript:** strict mode enabled

**Format:** structured Markdown, ready to copy into `.context/SRS/non-functional-specs.md`

**Constraints:**

- Quantifiable metrics (never "must be fast")
- Realistic for an MVP (no over-engineering)
- Aligned with the chosen tech stack
