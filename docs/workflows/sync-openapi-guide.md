# Sincronizar OpenAPI - Guia de Uso

Esta guia explica como usar el script `sync-openapi.ts` para sincronizar especificaciones OpenAPI desde tres fuentes: una URL HTTP, un repositorio de GitHub, o un archivo local.

---

## Cuando usar este script

Usa `sync-openapi.ts` cuando:

- Tu equipo backend mantiene el OpenAPI spec en su repositorio
- Necesitas mantener sincronizado el spec con tu proyecto de testing
- Quieres generar tipos TypeScript desde el spec

**No uses este script si:**

- Defines tus schemas con Zod (usa `zod-to-openapi` en su lugar)
- Usas Supabase (tiene auto-spec en `/rest/v1/?apikey=...`)

---

## Setup Inicial (solo para la fuente GitHub)

### 1. Verificar GitHub CLI

```bash
gh --version
gh auth status
```

Si no esta autenticado:

```bash
gh auth login
```

### 2. Verificar acceso al repositorio

```bash
gh repo view owner/backend-repo
```

---

## Uso del Script

### Modo Interactivo (primera vez)

```bash
bun run api:sync
```

El script te preguntara primero la fuente (`URL / GitHub / Local`) y luego los datos de esa fuente. Para GitHub:

1. **Repository (owner/repo):** Ej. `myorg/backend-api`
2. **Branch:** Ej. `main` o `develop`
3. **Path to OpenAPI file:** Ej. `docs/openapi.yaml`

La configuracion se guarda en `api/.openapi-config.json` para futuras ejecuciones.

### Usar configuracion guardada

```bash
bun run api:sync --config
# o
bun run api:sync -c
```

### Fuentes no interactivas

```bash
bun run api:sync --url http://localhost:3000/api/openapi   # desde una URL
bun run api:sync --file ./backend/docs/openapi.yaml        # desde archivo local
```

### Tipos TypeScript

Cada sync genera `api/openapi-types.ts` **por defecto** usando `openapi-typescript` (no hay flag para pedirlos). Para saltar la generacion:

```bash
bun run api:sync --no-types
```

---

## Archivos generados

| Archivo                     | Descripcion                              |
| --------------------------- | ---------------------------------------- |
| `api/.openapi-config.json`  | Configuracion guardada                   |
| `api/openapi.yaml` / `.json`| Spec descargado (segun formato original) |
| `api/openapi-types.ts`      | Tipos TypeScript (default; `--no-types` los salta) |

---

## Ejemplo de configuracion

```json
{
  "source": "github",
  "repo": "myorg/backend-api",
  "branch": "main",
  "filePath": "docs/openapi.yaml",
  "specFile": "openapi.yaml",
  "lastSync": "2024-01-15T10:30:00.000Z",
  "endpointCount": 42
}
```

---

## Siguientes pasos

Despues de sincronizar, puedes:

### Opcion A: Configurar MCP para testing con AI

Usa el spec descargado con `@ivotoby/openapi-mcp-server`:

```json
{
  "mcpServers": {
    "api": {
      "command": "npx",
      "args": ["-y", "@ivotoby/openapi-mcp-server"],
      "env": {
        "OPENAPI_SPEC_PATH": "./api/openapi.yaml",
        "API_BASE_URL": "https://your-api.com",
        "API_HEADERS": "Authorization:Bearer YOUR_TOKEN"
      }
    }
  }
}
```

### Opcion B: Usar tipos en tests Playwright

```typescript
import type { paths } from '../api/openapi-types';

type UserResponse = paths['/users/{id}']['get']['responses']['200']['content']['application/json'];
```

### Opcion C: Contract testing con Zod

Ver: [OpenAPI + Zod Contract Testing](https://github.com/upex-galaxy/agentic-qa-boilerplate/blob/main/docs/testing/api/openapi-contract-testing.md)

---

## Troubleshooting

### "gh: command not found"

```bash
# Mac
brew install gh

# Windows
winget install GitHub.cli

# Linux
sudo apt install gh
```

### "authentication required"

```bash
gh auth login
```

### "Not Found" al descargar

Verifica:

1. El repositorio existe y tienes acceso
2. El branch es correcto
3. La ruta del archivo es correcta

```bash
# Verificar que el archivo existe
gh api /repos/owner/repo/contents/path/to/openapi.yaml
```

---

## Flujos relacionados

| Flujo               | Cuando usarlo                 | Documento                                                                                                                                   |
| ------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **sync-openapi.ts** | Backend externo tiene el spec | Este documento                                                                                                                              |
| **Zod-to-OpenAPI**  | Tu defines schemas con Zod    | [openapi-contract-testing.md](https://github.com/upex-galaxy/agentic-qa-boilerplate/blob/main/docs/testing/api/openapi-contract-testing.md) |

---

**Ver tambien:**
