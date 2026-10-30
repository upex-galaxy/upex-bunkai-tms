# Supabase: Connection Setup

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** Developers que trabajan con proyectos Supabase

---

## Overview

Supabase ofrece varias formas de conectarse a la base de datos PostgreSQL. Este documento explica cuál usar desde la app, desde scripts y migraciones, y cómo llega la AI a la base de datos.

```
┌─────────────────────────────────────────────────────────────────┐
│                    OPCIONES DE CONEXIÓN                          │
│                                                                  │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐     │
│   │   Direct    │      │  Session    │      │ Transaction │     │
│   │ Connection  │      │   Pooler    │      │   Pooler    │     │
│   └──────┬──────┘      └──────┬──────┘      └──────┬──────┘     │
│          │                    │                    │             │
│          ▼                    ▼                    ▼             │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    PostgreSQL                            │   │
│   └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Tipos de Connection String

Supabase proporciona tres tipos de connection strings. Los encuentras en:

**Dashboard → Project Settings → Database → Connection string**

### 1. Direct Connection

Conexión directa al servidor PostgreSQL, sin pooler:

```
postgresql://postgres:<password>@db.<project-ref>.supabase.co:5432/postgres
```

| Característica     | Valor                                         |
| ------------------ | --------------------------------------------- |
| Puerto             | `5432`                                        |
| Red                | IPv6 (IPv4 solo con el IPv4 Add-on)           |
| Mejor para         | Migraciones, `pg_dump`, backends de larga vida |

### 2. Session Pooler

Conexión a través del pooler (Supavisor) en modo sesión:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:5432/postgres
```

| Característica | Valor                                                    |
| -------------- | -------------------------------------------------------- |
| Puerto         | `5432`                                                   |
| Modo           | Session (cada cliente mantiene su conexión)              |
| Red            | IPv4                                                     |
| Mejor para     | Clientes persistentes que necesitan `SET`, prepared statements, `LISTEN/NOTIFY` |

### 3. Transaction Pooler

Conexión optimizada para muchas conexiones cortas:

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
```

| Característica | Valor                                                 |
| -------------- | ----------------------------------------------------- |
| Puerto         | **`6543`** (diferente!)                               |
| Modo           | Transaction                                           |
| Red            | IPv4                                                  |
| Mejor para     | **Serverless (Vercel), edge functions, muchos clientes** |
| Limitación     | Sin features de sesión (`SET`, `LISTEN/NOTIFY`, advisory locks) |

---

## Componentes del Connection String

```
postgresql://postgres.<project-ref>:<password>@aws-0-<region>.pooler.supabase.com:6543/postgres
└────┬────┘ └─────────┬─────────┘ └────┬────┘ └───────────────┬──────────────────┘ └─┬─┘ └──┬───┘
  protocolo         user              pass                   host                   port    db
```

| Componente   | Descripción                                        | Ejemplo                                 |
| ------------ | -------------------------------------------------- | --------------------------------------- |
| **User**     | `postgres.<project-ref>` en el pooler; `postgres` en la conexión directa | `postgres.<project-ref>`  |
| **Password** | Tu database password                               | (establecido al crear el proyecto)      |
| **Host**     | Pooler endpoint o `db.<project-ref>.supabase.co`   | `aws-0-<region>.pooler.supabase.com`    |
| **Port**     | 5432 (session / directa) o 6543 (transaction)      | `6543`                                  |
| **Database** | Siempre `postgres`                                 | `postgres`                              |

Ninguno de estos valores se commitea: el password vive en `.env`, nunca en un archivo versionado.

### Extraer el Project Reference

El **Project Reference** es el identificador único de tu proyecto Supabase, y es el subdominio de `NEXT_PUBLIC_SUPABASE_URL`:

```typescript
// Desde la URL del proyecto
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!; // https://<project-ref>.supabase.co
const PROJECT_REF = SUPABASE_URL.split('//')[1].split('.')[0];
```

---

## Cómo llega la AI a la base de datos

La AI no usa un connection string. Pide la capability `db` (`.agents/instructions/agent-skills-and-mcps.md` §5, "MCPs"), que en este repo la provee el servidor MCP `supabase` declarado en `.mcp.json`, `opencode.jsonc` y `.codex/config.toml`. Lee una sola credencial, `SUPABASE_ACCESS_TOKEN`, que el loader de `.env` (`varlock run --filter SUPABASE_ACCESS_TOKEN`) toma de `.env` al arrancar el servidor; la URL y las keys del proyecto nunca le llegan. No hay archivo TOML ni rol de base de datos que crear.

Para verificar que está activo, dentro de la sesión:

```
/mcp
```

Un valor faltante en `.env` no rompe el arranque: el servidor arranca sin la variable y falla recién en su primera llamada autenticada (`AGENTS.md` Regla #9). Si ves un 401/403, revisa `.env` y reinicia la sesión. Los lanzamientos sin línea de comandos (app de escritorio, workers supervisados) no necesitan nada extra: el loader lee `.env` igual.

Quien prefiera DBHub para consultas SQL directas puede agregarlo como MCP opt-in: el bloque `sql` de `docs/mcp/` y un `dbhub.toml` que parte de `docs/mcp/dbhub.example.toml`, solo con referencias `${VAR}`; los valores literales van en `dbhub.local.toml` (gitignored). Ver [docs/mcp/README.md](../../mcp/README.md). Un servidor agregado a un harness tiene que existir en los tres, o falla `bun run agents:compat:check`.

---

## IPv4 vs IPv6

La conexión directa (`db.<project-ref>.supabase.co`) resuelve solo a **IPv6**. Los dos poolers (Supavisor, en `5432` y `6543`) aceptan **IPv4**.

Si tu red no tiene IPv6:

1. Usa el Session Pooler o el Transaction Pooler en vez de la conexión directa
2. O activa el **IPv4 Add-on** (Dashboard → Project Settings → Add-ons) para seguir usando la directa

### Verificar Soporte IPv6

```bash
# Verificar si tu máquina tiene IPv6
ping6 google.com

# Si falla, usa un pooler
```

---

## Roles y Permisos

Supabase tiene varios roles predefinidos:

| Rol             | Descripción      | Uso                       |
| --------------- | ---------------- | ------------------------- |
| `postgres`      | Superuser        | Admin tasks, migraciones  |
| `anon`          | Usuario anónimo  | Public API (con RLS)      |
| `authenticated` | Usuario logueado | API autenticada (con RLS) |
| `service_role`  | Bypass RLS       | Backend, admin APIs       |

Las RLS policies se escriben contra `anon` y `authenticated`. El rol `service_role` (la secret key) salta RLS: solo en código de servidor, nunca para conseguir una sesión de usuario.

---

## Múltiples Ambientes

Cada ambiente es un proyecto Supabase distinto, con su propio `<project-ref>` y sus propias keys. Los valores viven en `.env` (local) y en las variables de Vercel por scope (Preview / Production); las URLs de cada ambiente están en `.agents/project.yaml` → `environments`. Ver [environments.md](../../workflows/environments.md).

Para desarrollo local con la CLI de Supabase (`supabase start`), la base escucha en `localhost:54322` con usuario y password `postgres`.

---

## Troubleshooting

### Error: Connection refused

```
FATAL: Connection refused
```

**Soluciones:**

1. Verificar que el host y puerto son correctos
2. Para transaction pooler, usar puerto `6543`
3. Verificar que no hay firewall bloqueando

### Error: Password authentication failed

```
FATAL: password authentication failed for user "postgres"
```

**Soluciones:**

1. Verificar password en Dashboard → Settings → Database
2. En los poolers, el formato del user es `postgres.<project-ref>`; en la conexión directa es `postgres`
3. Resetear password si es necesario

### Error: SSL required

```
FATAL: SSL connection is required
```

**Solución:** agregar `sslmode=require` al connection string.

### Error: Too many connections

```
FATAL: too many connections
```

**Soluciones:**

1. Usar Transaction Pooler (puerto 6543), sobre todo desde funciones serverless
2. Cerrar conexiones después de usarlas
3. Reutilizar un solo cliente por proceso

Más casos en [troubleshooting.md](./troubleshooting.md).

---

## Próximos Pasos

1. **Auth Tokens:** [auth-tokens.md](./auth-tokens.md) - Autenticación con Supabase
2. **Troubleshooting:** [troubleshooting.md](./troubleshooting.md) - Problemas comunes

---

## Referencias

- [Supabase Database Connections](https://supabase.com/docs/guides/database/connecting-to-postgres)
- [Supabase IPv4 Address](https://supabase.com/docs/guides/platform/ipv4-address)
