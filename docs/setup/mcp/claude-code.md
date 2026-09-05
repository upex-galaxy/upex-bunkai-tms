# Configuración de MCP para Claude Code

**Claude Code** es la herramienta CLI oficial de Anthropic para codificación asistida directamente desde la terminal.

> 💡 Para conceptos generales de MCP, consulta [MCP - Guía General](./README.md)

---

## 🚀 Quick Start

### Setup Inicial

La primera vez que uses Claude Code basta con lanzarlo — el login y la inicialización son automáticos:

```bash
claude
```

> ⚠️ El flag `--dangerously-skip-permissions` NO es parte del setup: desactiva TODOS los prompts de permisos y solo tiene sentido en sandboxes desechables. No lo uses en tu máquina de trabajo.

**En este boilerplate**: lanza Claude Code con `bun run claude` — es un wrapper con `dotenv-cli` que carga `.env` antes de arrancar, para que los `${VAR}` del `.mcp.json` resuelvan.

**Tres harnesses, un solo inventario**: los servidores que declara `.mcp.json` (el boilerplate trae `context7`, `tavily`, `supabase`, `n8n`) viven también en `opencode.jsonc` (OpenCode) y en `.codex/config.toml` (Codex CLI + Desktop, ver [codex.md](./codex.md)). `bun run agents:compat:check` toma `.mcp.json` como conjunto canónico, normaliza los tres formatos y falla si un servidor falta en otro host, existe en un solo host o depende de otras variables de `.env`; esos cuatro ids conocidos reciben además un chequeo estricto de forma por host cuando el proyecto los declara, y cualquier otro servidor solo el chequeo genérico. Si agregás un servidor acá, agregalo en los otros dos. Las instrucciones (`AGENTS.md`, que Claude Code lee vía el shim `CLAUDE.md`) y las skills (`.agents/skills/`, alias generado `.claude/skills`) también son una sola copia: ver `AGENTS.md` §5.5.

### Archivos de Configuración

Claude Code usa un sistema jerárquico:

1. **Local** (scope `local`, guardado en `~/.claude.json` por-proyecto) - Mayor prioridad
2. **Proyecto** (`.mcp.json` en la raíz del proyecto, commiteado al repo)
3. **Usuario** (scope `user` en `~/.claude.json`) - Configuración global

### Scopes de Configuración

- `user`: Global para todos los proyectos
- `project`: Específico del proyecto actual (archivo `.mcp.json`, compartido con el equipo)
- `local`: Privado tuyo para el proyecto actual

---

## 📝 Configuración de MCPs

### Método 1: Mediante CLI (Recomendado)

#### Agregar servidor stdio

```bash
claude mcp add -t stdio -s user mi-servidor -- npx -y @paquete/servidor
```

#### Agregar servidor HTTP

```bash
claude mcp add --transport http --scope user firebase https://firebase.mcp.com
```

#### Listar servidores

```bash
claude mcp list
```

#### Eliminar servidor

```bash
claude mcp remove mi-servidor
```

### Método 2: Edición Manual

#### ~/.claude.json

**Servidor stdio Local**:

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

**Servidor HTTP con Autenticación**:

```json
{
  "mcpServers": {
    "postman": {
      "type": "http",
      "url": "https://mcp.postman.com/mcp",
      "headers": {
        "Authorization": "Bearer ${POSTMAN_API_KEY}"
      }
    }
  }
}
```

> **Nota**: Claude Code NO soporta el bloque `inputs` / `${input:...}` (eso es sintaxis de VS Code). Los secretos se referencian como `${VAR}` (o `${VAR:-default}`) y se expanden desde el entorno del proceso — si la variable falta, el servidor falla al arrancar. Por eso este repo lanza `bun run claude`, que carga `.env` primero.

**Servidor con npx**:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

---

## 🔧 Transportes Soportados

- ✅ **stdio**: Totalmente soportado
- ⚠️ **SSE**: **Eliminado en versiones >2.0.9** (deprecado del estándar MCP)
- ✅ **HTTP Streamable**: Totalmente soportado

### ⚠️ Cambio Importante en Versión 2.0.9+

Claude Code eliminó soporte para SSE en versiones superiores a 2.0.9.

**Si tienes servidores SSE**:

**Solución 1**: Usar versión anterior de Claude Code

```bash
npm install -g @anthropic-ai/claude-code@2.0.9
```

**Solución 2**: Migrar a HTTP Streamable (recomendado)

**Solución 3**: Usar proxy stdio-to-SSE

---

## 📋 Ejemplos Prácticos

### Ejemplo 1: Supabase MCP

```bash
# Mediante CLI
claude mcp add -t stdio -s user supabase -- npx -y @supabase/mcp-server-supabase@latest
```

**O manualmente en ~/.claude.json**:

```json
{
  "mcpServers": {
    "supabase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

### Ejemplo 2: GitHub MCP

```json
{
  "mcpServers": {
    "github": {
      "type": "http",
      "url": "https://api.githubcopilot.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    }
  }
}
```

### Ejemplo 3: Playwright MCP

```bash
claude mcp add -t stdio -s user playwright -- npx -y @playwright/mcp@latest
```

### Ejemplo 4: Context7 (Documentación)

Este repo ya lo trae en `.mcp.json` como servidor stdio (`bunx -y @upstash/context7-mcp`). Para agregarlo global como servidor remoto:

```bash
claude mcp add --transport http --scope user context7 https://mcp.context7.com/mcp
```

---

## 🎯 Características Especiales

### Sistema Jerárquico

Local > Project > User

Ante nombres repetidos, el scope local gana sobre el `.mcp.json` del proyecto, y este sobre la configuración global de usuario.

### Gestión de Permisos

Control granular de acceso a recursos del sistema.

### Registry de MCP

Acceso a servidores verificados desde el registro oficial.

### Variables de Entorno

Expansión de `${VAR}` y `${VAR:-default}` en `.mcp.json` desde el entorno del proceso (no hay inputs interactivos — eso es sintaxis de VS Code):

```json
{
  "env": {
    "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
  }
}
```

---

## 🐛 Troubleshooting

### "Permission denied"

**Solución**: revisar los permisos configurados (`/permissions` dentro de la sesión, o `settings.json` / `settings.local.json` en `.claude/`). NO uses `--dangerously-skip-permissions` como atajo fuera de un sandbox desechable.

### "SSE transport not supported"

**Causa**: Versión >2.0.9 no soporta SSE

**Solución**:

```bash
# Downgrade
npm install -g @anthropic-ai/claude-code@2.0.9

# O migrar a HTTP
```

### Servidor no se encuentra

**Solución**: Usar rutas absolutas

```json
{
  "command": "/usr/local/bin/node",
  "args": ["/ruta/completa/a/servidor.js"]
}
```

**Verificar PATH**:

```bash
which npx
which node
```

### Herramientas no aparecen

**Diagnóstico**:

```bash
claude mcp list
```

**Soluciones**:

1. Reiniciar Claude Code completamente
2. Verificar que el servidor use scope correcto
3. Revisar logs de MCP

---

## 💡 Tips y Mejores Prácticas

### 1. Usar Proyecto para Configuración Específica

`.mcp.json` en raíz del proyecto:

```json
{
  "mcpServers": {
    "project-specific": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "custom-mcp-server"]
    }
  }
}
```

### 2. Variables de Entorno para Secrets

```json
{
  "env": {
    "API_KEY": "${API_KEY}"
  }
}
```

### 3. Combinar Global + Proyecto

- Global (`~/.claude.json`): MCPs comunes (context7, memory)
- Proyecto (`.mcp.json`): MCPs específicos (supabase para este proyecto)

### 4. Usar Registry Oficial

No hay subcomando `claude mcp registry` — explora servidores verificados en el registro oficial y agrégalos con `claude mcp add`:

- https://github.com/modelcontextprotocol/servers

---

## 📊 Configuración Recomendada

### Para Desarrollo Backend

```json
{
  "mcpServers": {
    "supabase": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    },
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

### Para Desarrollo Frontend

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "context7": {
      "type": "http",
      "url": "https://mcp.context7.com/mcp"
    }
  }
}
```

### Para Testing

```json
{
  "mcpServers": {
    "playwright": {
      "type": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "postman": {
      "type": "http",
      "url": "https://mcp.postman.com/mcp",
      "headers": {
        "Authorization": "Bearer ${POSTMAN_API_KEY}"
      }
    }
  }
}
```

---

## 📚 Recursos Adicionales

- **Documentación Oficial**: https://docs.claude.com/en/docs/claude-code
- **Conceptos MCP**: [MCP - Guía General](./README.md)

---

**Última actualización**: 2025-10-29
**Versión Claude Code**: 2.0.9+
