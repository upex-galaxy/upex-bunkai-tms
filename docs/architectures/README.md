# Guías Específicas por Arquitectura

> **Idioma:** Español
> Guías de configuración específicas para cada stack tecnológico.

---

## Arquitecturas Disponibles

| Arquitectura           | Descripción                          | Ruta                                   |
| ---------------------- | ------------------------------------ | -------------------------------------- |
| **Supabase + Next.js** | PostgreSQL + PostgREST + Next.js API | [supabase-nextjs/](./supabase-nextjs/) |

---

## Agregar Nuevas Arquitecturas

Cuando agregues soporte para una nueva arquitectura:

1. Crea una carpeta: `docs/architectures/{nombre-stack}/`
2. Agrega un `README.md` explicando la arquitectura
3. Agrega guías de configuración específicas (auth, conexiones, etc.)
4. Deja fuera lo genérico: solo lo específico del stack va aquí

---

**Nota:** Esta carpeta es solo para configuraciones específicas de cada stack. El ciclo de desarrollo genérico vive en las skills (`.agents/skills/`) y en [agentic-development-engineering.md](../agentic-development-engineering.md).
