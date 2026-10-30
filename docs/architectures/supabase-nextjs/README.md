# Arquitectura Supabase + Next.js

> **Idioma:** Español
> Guías de configuración específicas para proyectos Supabase (PostgreSQL + PostgREST) y Next.js.

---

## Vista General de la Arquitectura

```
┌─────────────────────────────────────────────────────────────┐
│                        Next.js App                          │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │   API Routes    │    │   React/Pages   │                │
│  │  /api/custom/*  │    │   SSR/SSG/CSR   │                │
│  └────────┬────────┘    └────────┬────────┘                │
│           │                      │                          │
└───────────┼──────────────────────┼──────────────────────────┘
            │                      │
            ▼                      ▼
┌─────────────────────────────────────────────────────────────┐
│                     Plataforma Supabase                     │
│  ┌─────────────────┐    ┌─────────────────┐                │
│  │    PostgREST    │    │   Supabase Auth │                │
│  │  REST API auto  │    │   JWT tokens    │                │
│  └────────┬────────┘    └────────┬────────┘                │
│           │                      │                          │
│           ▼                      ▼                          │
│  ┌─────────────────────────────────────────┐               │
│  │              PostgreSQL                  │               │
│  │        (con políticas RLS)               │               │
│  └─────────────────────────────────────────┘               │
└─────────────────────────────────────────────────────────────┘
```

---

## Contenido

| Documento                                    | Descripción                                    | Estado        |
| -------------------------------------------- | ---------------------------------------------- | ------------- |
| [connection-setup.md](./connection-setup.md) | Strings de conexión Supabase, config de pooler | ✅ Disponible |
| [auth-tokens.md](./auth-tokens.md)           | Cómo obtener tokens de autenticación Supabase  | ✅ Disponible |
| [troubleshooting.md](./troubleshooting.md)   | Problemas comunes y soluciones                 | ✅ Disponible |

---

## Conceptos Clave

### Dos APIs en Un Proyecto

1. **Supabase REST API** (PostgREST)
   - Auto-generada desde el schema de la base de datos
   - URL: `https://<proyecto>.supabase.co/rest/v1/`
   - Usa `apikey` + JWT para autenticación

2. **Next.js API Routes**
   - Lógica de negocio personalizada
   - URL: `https://tu-app.com/api/`
   - Puede usar el mismo JWT o autenticación custom

### Flujo de Autenticación

```
Login Usuario → Supabase Auth → JWT Token → Usar para ambas APIs
```

---

## Inicio Rápido

1. **Obtener string de conexión:** Ver [connection-setup.md](./connection-setup.md)
2. **Obtener tokens de auth:** Ver [auth-tokens.md](./auth-tokens.md)
3. **Tienes problemas?** Revisa [troubleshooting.md](./troubleshooting.md)

---

**Ver También:**

- Skill `/project-bootstrap`: scaffolding de auth, rutas de API, OpenAPI y tipos de Supabase (`.agents/skills/project-bootstrap/references/`)
- `.agents/skills/sprint-development/references/live-ui-identity.md`: con qué cuenta se valida la UI en vivo (`testing.automation_identity` en `.agents/project.yaml`)
