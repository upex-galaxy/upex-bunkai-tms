# Supabase: Auth Tokens

> **Idioma:** Español
> **Nivel:** Intermedio
> **Audiencia:** Developers que construyen o exploran la API de un proyecto Supabase + Next.js

---

## Overview

Supabase usa JWT (JSON Web Tokens) para autenticación. El mismo token funciona para:

- Supabase REST API (`/rest/v1/*`)
- Supabase Auth API (`/auth/v1/*`)
- Next.js API Routes (`/api/*`), por header o por la cookie que gestiona el cliente de Supabase

```
┌─────────────────────────────────────────────────────────────────┐
│                  UN TOKEN, MÚLTIPLES USOS                        │
│                                                                  │
│   ┌─────────────────────────────────────────────────────────┐   │
│   │                    JWT Token                             │   │
│   └──────────────┬─────────────────────┬────────────────────┘   │
│                  │                     │                         │
│          ┌───────▼───────┐     ┌───────▼───────┐                │
│          │ REST API      │     │ Next.js API   │                │
│          │ (Header)      │     │ (Header/Cookie)│               │
│          │               │     │               │                │
│          │ Authorization:│     │ Authorization:│                │
│          │ Bearer <JWT>  │     │ Bearer <JWT>  │                │
│          └───────────────┘     └───────────────┘                │
└─────────────────────────────────────────────────────────────────┘
```

> **Nota:** si tus API Routes aceptan Bearer token además de la cookie, explorarlas con `curl` es directo. El scaffold de `/project-bootstrap` lo documenta en `.agents/skills/project-bootstrap/references/bearer-token-support.md`.

---

## Keys de Supabase

Supabase proporciona dos tipos de API keys. Este repo usa los nombres del par moderno **publishable + secret** (ver `.env.example`):

| Key           | Variable en `.env`                                                  | Propósito                                     |
| ------------- | ------------------------------------------------------------------- | --------------------------------------------- |
| **Publishable** | `SUPABASE_PUBLISHABLE_KEY` / `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Acceso público, respeta RLS (el antiguo anon key) |
| **Secret**    | `SUPABASE_SECRET_KEY`                                               | Bypass de RLS, solo servidor (el antiguo service role key) |

Las encuentras en: **Dashboard → Project Settings → API**

### Publishable key

- ✅ Segura para exponer en frontend
- ✅ Respeta las RLS policies
- ⚠️ Solo ve los datos que las policies permiten

### Secret key

- ❌ **NUNCA** exponer en frontend
- ❌ **NUNCA** commitear a Git
- ✅ Bypass completo de RLS
- ✅ Solo para backend/admin

---

## Obtener Access Token (Login)

### Via API

```http
POST https://<project-ref>.supabase.co/auth/v1/token?grant_type=password
Content-Type: application/json
apikey: <SUPABASE_PUBLISHABLE_KEY>

{
  "email": "<email de la cuenta>",
  "password": "<password de la cuenta>"
}
```

Las credenciales nunca se escriben en un archivo commiteado: salen de `.env`. Para validar la app en vivo, la cuenta es la que declara `testing.automation_identity` en `.agents/project.yaml` (nombres de variables, no valores); el contrato completo está en `.agents/skills/sprint-development/references/live-ui-identity.md`.

### Response

```json
{
  "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "token_type": "bearer",
  "expires_in": 3600,
  "expires_at": 1703123456,
  "refresh_token": "abc123...",
  "user": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "email": "user@example.com",
    "user_metadata": { "name": "Example User" }
  }
}
```

**Guardar:**

- `access_token` → Para requests autenticados
- `refresh_token` → Para renovar cuando expire
- `user.id` → Para filtros y validaciones

---

## Usar el Token en REST API

### Headers Requeridos

```http
GET https://<project-ref>.supabase.co/rest/v1/orders
apikey: <SUPABASE_PUBLISHABLE_KEY>
Authorization: Bearer <ACCESS_TOKEN>
```

### cURL Ejemplo

```bash
curl -X GET \
  'https://<project-ref>.supabase.co/rest/v1/orders?user_id=eq.123' \
  -H 'apikey: eyJhbGciOiJIUzI1NiIs...' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...'
```

### JavaScript Ejemplo

```javascript
const response = await fetch(`${SUPABASE_URL}/rest/v1/orders?user_id=eq.${userId}`, {
  headers: {
    apikey: SUPABASE_PUBLISHABLE_KEY,
    Authorization: `Bearer ${accessToken}`,
  },
});
```

---

## Usar el Token en Next.js API Routes

### Opción A: Bearer Token

El mismo formato que la REST API de Supabase:

```bash
curl -X GET \
  'http://localhost:3000/api/clients' \
  -H 'Authorization: Bearer eyJhbGciOiJIUzI1NiIs...'
```

Funciona igual en `curl`, Postman o un cliente móvil.

### Opción B: Cookie (la gestiona el cliente de Supabase)

En el browser, el cliente de Supabase guarda la sesión en una cookie `sb-<project-ref>-auth-token` después del login y la envía sola. Esa cookie la escribe el login de la app: no se construye a mano. Las skills de este repo prohíben fabricar cookies de sesión o sesiones locales para saltarse el login (`live-ui-identity.md`); para un request fuera del browser, usa la Opción A.

---

## Refresh Token

Cuando el `access_token` expira (1 hora por defecto), usa el `refresh_token`:

```http
POST https://<project-ref>.supabase.co/auth/v1/token?grant_type=refresh_token
Content-Type: application/json
apikey: <SUPABASE_PUBLISHABLE_KEY>

{
  "refresh_token": "abc123..."
}
```

Response: nuevos `access_token` y `refresh_token`.

---

## Decodificar JWT (Debug)

### Opción 1: jwt.io

Visita https://jwt.io y pega el token. Solo con tokens de un ambiente que no sea producción.

### Opción 2: JavaScript

```javascript
const [header, payload, signature] = accessToken.split('.');
const decoded = JSON.parse(atob(payload));
console.log(decoded);
// {
//   sub: "550e8400-...",  // User ID
//   email: "user@example.com",
//   exp: 1703123456,      // Expiration
//   role: "authenticated"
// }
```

### Campos Importantes

| Campo           | Descripción                   |
| --------------- | ----------------------------- |
| `sub`           | User ID (UUID)                |
| `email`         | Email del usuario             |
| `exp`           | Timestamp de expiración       |
| `role`          | `authenticated` o `anon`      |
| `user_metadata` | Datos adicionales del usuario |

---

## Resumen de Endpoints Auth

| Acción             | Method | Endpoint                                  |
| ------------------ | ------ | ----------------------------------------- |
| **Login**          | POST   | `/auth/v1/token?grant_type=password`      |
| **Refresh**        | POST   | `/auth/v1/token?grant_type=refresh_token` |
| **Logout**         | POST   | `/auth/v1/logout`                         |
| **User Info**      | GET    | `/auth/v1/user`                           |
| **Reset Password** | POST   | `/auth/v1/recover`                        |

---

## Próximos Pasos

1. **Connection Setup:** [connection-setup.md](./connection-setup.md) - Configurar conexión DB
2. **Troubleshooting:** [troubleshooting.md](./troubleshooting.md) - Problemas comunes

---

## Referencias

- [Supabase Auth Documentation](https://supabase.com/docs/guides/auth)
- [Supabase JavaScript Client](https://supabase.com/docs/reference/javascript/auth-signinwithpassword)
- [JWT.io](https://jwt.io/)
