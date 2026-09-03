# Configuración de MCP para Gemini CLI

**Gemini CLI** es la herramienta oficial de Google para interactuar con Gemini desde la terminal.

> 💡 Para conceptos generales de MCP, consulta [MCP - Guía General](./README.md)

> ⚠️ **En este boilerplate, Gemini CLI no tiene adapter en runtime.** Los harnesses soportados con config commiteada y verificada en paridad son Claude Code (`.mcp.json`), OpenCode (`opencode.jsonc`) y Codex CLI + Desktop (`.codex/config.toml`); ver la matriz en [README](./README.md). Esta guía es referencia manual: si la usás, replicá los cuatro servidores canónicos (`context7`, `tavily`, `supabase`, `n8n`) a mano y no esperes que `bun run agents:compat:check` los vea.

---

## 🚀 Quick Start

### Archivos de Configuración

- **macOS/Linux**: `~/.gemini/settings.json`
- **Windows**: `%USERPROFILE%\.gemini\settings.json`
- **Proyecto específico**: `.gemini/settings.json` (en la raíz del proyecto)

---

## 📝 Configuración de MCPs

### Método 1: Mediante CLI (Recomendado)

#### Agregar servidor stdio local

```bash
gemini mcp add myserver python3 my_server.py
```

#### Agregar servidor HTTP remoto

```bash
gemini mcp add --transport http context7 https://mcp.context7.com/mcp
```

#### Listar servidores configurados

```bash
gemini mcp list
```

#### Eliminar servidor

```bash
gemini mcp remove myserver
```

### Método 2: Edición Manual de settings.json

#### Servidor stdio Local

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

#### Servidor HTTP/SSE Remoto

```json
{
  "mcpServers": {
    "postman": {
      "httpUrl": "https://mcp.postman.com/mcp",
      "headers": {
        "Authorization": "Bearer ${POSTMAN_API_KEY}"
      }
    }
  }
}
```

#### Servidor con Variables de Entorno

```json
{
  "mcpServers": {
    "database-tools": {
      "command": "python",
      "args": ["server.py"],
      "env": {
        "DB_HOST": "localhost",
        "DB_PORT": "5432",
        "DB_USER": "admin",
        "DB_PASSWORD": "${DB_PASSWORD}"
      },
      "cwd": "./mcp_tools/python",
      "timeout": 15000
    }
  }
}
```

---

## 🔧 Transportes Soportados

- ✅ **stdio**: Totalmente soportado
- ✅ **SSE**: Soportado (en deprecación)
- ✅ **HTTP Streamable**: Totalmente soportado

---

## 📋 Ejemplos Prácticos

### Ejemplo 1: Supabase MCP

**Mediante CLI**:

```bash
gemini mcp add supabase -e SUPABASE_ACCESS_TOKEN=$SUPABASE_ACCESS_TOKEN -- npx -y @supabase/mcp-server-supabase@latest
```

**O manualmente en ~/.gemini/settings.json**:

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    }
  }
}
```

### Ejemplo 2: Context7 (Documentación)

```bash
gemini mcp add --transport http context7 https://mcp.context7.com/mcp
```

### Ejemplo 3: Playwright MCP

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

### Ejemplo 4: GitHub MCP con OAuth

```json
{
  "mcpServers": {
    "github": {
      "httpUrl": "https://api.githubcopilot.com/mcp",
      "headers": {
        "Authorization": "Bearer ${GITHUB_TOKEN}"
      }
    }
  }
}
```

---

## 🎯 Comandos en Sesión

Una vez iniciada una sesión de Gemini:

### Ver servidores disponibles

```bash
/mcp
```

### Ver descripción de servidor específico

```bash
/mcp desc nombre-servidor
```

### Autenticar servidor con OAuth

```bash
/mcp auth nombre-servidor
```

### Listar todos los servidores

```bash
/mcp list
```

---

## 🌟 Extensiones de Gemini CLI

Gemini CLI soporta **extensiones** que empaquetan:

- Uno o más servidores MCP
- Archivos de contexto personalizados
- Comandos slash personalizados
- Herramientas excluidas/incluidas

### Instalar extensión

```bash
gemini extensions install https://github.com/gemini-cli-extensions/firebase
```

### Listar extensiones instaladas

```bash
gemini extensions list
```

### Ejemplo: Instalar Firebase Extension

**Opción 1**: Via extensión (recomendado)

```bash
gemini extensions install https://github.com/gemini-cli-extensions/firebase
```

**Opción 2**: Configuración manual

```bash
# Editar ~/.gemini/settings.json
```

```json
{
  "mcpServers": {
    "firebase": {
      "command": "npx",
      "args": ["-y", "firebase-tools@latest", "mcp"]
    }
  }
}
```

---

## 🔑 Características Especiales

### Auto-discovery

Detecta automáticamente configuraciones de otros clientes MCP (Claude, Cursor, etc.)

### Gestión de Contexto

Memoria conversacional y ramificación de conversaciones.

### Integración VS Code

Extensión disponible para VS Code.

### Custom Slash Commands

Permite crear comandos personalizados:

```json
{
  "commands": {
    "/deploy": {
      "description": "Deploy to production",
      "prompt": "Deploy the current project to production using best practices"
    }
  }
}
```

---

## 🐛 Troubleshooting

### "Servidor no se encuentra"

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

### "Token inválido" en HTTP

**Soluciones**:

1. Verificar formato de header
2. Comprobar expiración del token
3. Regenerar token en servicio origen

### Herramientas no aparecen

**Diagnóstico**:

```bash
gemini --debug
/mcp list
```

**Soluciones**:

1. Reiniciar Gemini CLI
2. Verificar logs: `gemini --debug`
3. Probar servidor manualmente:
   ```bash
   npx -y @paquete/servidor
   ```

---

## 💡 Tips y Mejores Prácticas

### 1. Usar Variables de Entorno para Secrets

```bash
# ~/.bashrc o ~/.zshrc
export SUPABASE_ACCESS_TOKEN="sbp_your_token"
export POSTMAN_API_KEY="pmk_your_key"
```

```json
{
  "env": {
    "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
  }
}
```

### 2. Organizar por Proyecto

Crear `.gemini/settings.json` en cada proyecto:

```json
{
  "mcpServers": {
    "project-supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_TOKEN_PROJECT_A}"
      }
    }
  }
}
```

### 3. Usar Extensiones para Configuración Común

```bash
# En lugar de configurar manualmente
gemini extensions install https://github.com/gemini-cli-extensions/firebase
gemini extensions install <url-del-repo-de-la-extension>
```

### 4. Debugging

```bash
# Ver logs detallados
gemini --debug

# Ver configuración activa
gemini mcp list
```

---

## 📊 Configuración Recomendada

### Para Desarrollo Backend

```json
{
  "mcpServers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${SUPABASE_ACCESS_TOKEN}"
      }
    },
    "context7": {
      "httpUrl": "https://mcp.context7.com/mcp"
    }
  }
}
```

### Para Desarrollo Frontend

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "devtools": {
      "command": "npx",
      "args": ["-y", "chrome-devtools-mcp"]
    },
    "context7": {
      "httpUrl": "https://mcp.context7.com/mcp"
    }
  }
}
```

### Para Testing

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "postman": {
      "httpUrl": "https://mcp.postman.com/mcp",
      "headers": {
        "Authorization": "Bearer ${POSTMAN_API_KEY}"
      }
    },
    "context7": {
      "httpUrl": "https://mcp.context7.com/mcp"
    }
  }
}
```

### Para Documentación

```json
{
  "mcpServers": {
    "notion": {
      "httpUrl": "https://mcp.notion.com/mcp"
    },
    "context7": {
      "httpUrl": "https://mcp.context7.com/mcp"
    },
    "tavily": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://mcp.tavily.com/mcp/?tavilyApiKey=${TAVILY_API_KEY}"]
    }
  }
}
```

---

## 📚 Recursos Adicionales

- **Documentación Oficial**: https://github.com/google-gemini/gemini-cli
- **Conceptos MCP**: [MCP - Guía General](./README.md)

---

**Última actualización**: 2025-10-29
**Versión Gemini CLI**: Latest
