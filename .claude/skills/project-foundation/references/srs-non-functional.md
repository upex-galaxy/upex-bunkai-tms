Actúa como Software Architect y Performance Engineer.

**Input:**

- PRD: [usar .context/PRD/executive-summary.md]
- Tech Stack: [especificar stack tecnológico del proyecto]

**Genera archivo: non-functional-specs.md**

Define NFRs (Non-Functional Requirements) en categorías:

**1. Performance**

- **Page Load Time:** < 2s (LCP - Largest Contentful Paint)
- **API Response Time:** < 500ms (p95 percentile)
- **Time to Interactive (TTI):** < 3s
- **Concurrent Users:** [número] (MVP), [número] (v2)
- **Database Query Time:** < 100ms para queries simples

**2. Security**

- **Authentication:** JWT tokens via Supabase Auth (o alternativa)
- **Authorization:** RBAC (roles: user, admin, etc.)
- **Data Encryption:**
  - At rest: Supabase encryption automática
  - In transit: HTTPS/TLS 1.3
- **Input Validation:** Server-side + client-side
- **Password Policy:** Min 8 chars, 1 mayúscula, 1 número, 1 símbolo (opcional)
- **Session Management:** Token expiration [tiempo], refresh token strategy
- **OWASP Top 10:** Mitigaciones para vulnerabilidades comunes

**3. Scalability**

- **Database:** PostgreSQL con Row Level Security (RLS)
- **CDN:** Vercel Edge Network (o alternativa)
- **Caching Strategy:**
  - ISR (Incremental Static Regeneration) para páginas
  - API caching con headers (Cache-Control)
- **Horizontal Scaling:** Stateless API routes (listo para múltiples instancias)
- **Database Connection Pooling:** Via Supabase (o configuración específica)

**4. Accessibility**

- **WCAG Compliance:** Level AA (WCAG 2.1)
- **Keyboard Navigation:** Todas las funcionalidades accesibles por teclado
- **Screen Reader Support:** ARIA labels en elementos críticos
- **Color Contrast:** Mínimo 4.5:1 para texto normal
- **Focus Indicators:** Visibles en todos los elementos interactivos

**5. Browser Support**

- **Desktop:**
  - Chrome (últimas 2 versiones)
  - Firefox (últimas 2 versiones)
  - Safari (últimas 2 versiones)
  - Edge (últimas 2 versiones)
- **Mobile:**
  - iOS Safari (últimas 2 versiones)
  - Android Chrome (últimas 2 versiones)

**6. Reliability**

- **Uptime:** 99.9% (objetivo)
- **Error Rate:** < 1% de requests
- **Recovery Time:** < 5 min para incidentes críticos

**7. Maintainability**

- **Code Coverage:** > 80% para tests unitarios
- **Documentation:** README, API docs, architecture diagrams
- **Linting:** ESLint/Prettier configured
- **TypeScript:** Strict mode habilitado

**Formato:** Markdown estructurado, listo para copiar a .context/SRS/non-functional-specs.md

**Restricciones:**

- Métricas cuantificables (no "debe ser rápido")
- Realistas para MVP (no sobre-engineering)
- Alineadas con tech stack elegido
