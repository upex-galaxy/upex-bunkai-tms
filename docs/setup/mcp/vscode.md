# Configuración de MCP para VS Code con GitHub Copilot

**VS Code con GitHub Copilot** ofrece integración nativa de MCP directamente en el editor.

> 💡 Para conceptos generales de MCP, consulta [MCP - Guía General](./README.md)

---

## 🚀 Quick Start

### Archivos de Configuración

- **Workspace**: `.vscode/mcp.json` (en la raíz del workspace)
- **Global**: Configuración de usuario de VS Code

---

## 📝 Configuración de MCPs

### Método 1: Mediante Command Palette

```
Ctrl/Cmd + Shift + P
> MCP: Add Server
```

Luego:

1. Seleccionar tipo de servidor (Command/HTTP/SSE)
2. Ingresar comando o URL
3. Elegir scope (Global/Workspace)

### Método 2: Creación Manual de .vscode/mcp.json

#### Servidor stdio Local

```json
{
  "servers": {
    "memory": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-memory"]
    }
  }
}
```

#### Servidor HTTP con OAuth

```json
{
  "servers": {
    "github-mcp": {
      "type": "http",
      "url": "https://mcp.github.com/"
    }
  },
  "inputs": [
    {
      "id": "github-token",
      "type": "promptString",
      "description": "GitHub Personal Access Token",
      "password": true
    }
  ]
}
```

#### Servidor con Variables

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "apiKey",
      "description": "Enter your API key",
      "password": true
    }
  ],
  "servers": {
    "custom-server": {
      "command": "npx",
      "args": ["-y", "@company/mcp-server"],
      "env": {
        "API_KEY": "${input:apiKey}"
      }
    }
  }
}
```

### Método 3: Mediante CLI (Instalación Global)

```bash
# Instalar servidor globalmente
code --add-mcp '{"name":"my-server","command":"uvx","args":["mcp-server-fetch"]}'

# VS Code Insiders
code-insiders --add-mcp '{"name":"repomix","command":"npx","args":["-y","repomix","--mcp"]}'
```

---

## 🔧 Transportes Soportados

- ✅ **stdio**: Totalmente soportado
- ⚠️ **SSE**: Soporte legacy (se prefiere HTTP)
- ✅ **HTTP Streamable**: Totalmente soportado (recomendado)

---

## 📋 Ejemplos Prácticos

### Ejemplo 1: Supabase MCP

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "supabase-token",
      "description": "Enter your Supabase access token",
      "password": true
    }
  ],
  "servers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${input:supabase-token}"
      }
    }
  }
}
```

### Ejemplo 2: Playwright MCP

```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    }
  }
}
```

### Ejemplo 3: Context7 (HTTP)

```json
{
  "servers": {
    "context7": {
      "type": "http",
      "url": "https://context7.mcp.io"
    }
  }
}
```

### Ejemplo 4: Figma Dev Mode MCP

```json
{
  "servers": {
    "figma-dev-mode": {
      "type": "http",
      "url": "http://localhost:9339/mcp"
    }
  }
}
```

**Nota**: Requiere Figma Desktop con "Enable local MCP Server" activado.

---

## 🎯 Uso de MCP en Agent Mode

Una vez configurado:

1. Abrir **GitHub Copilot Chat**
2. Seleccionar **Agent** del dropdown de modo
3. Click en icono de herramientas para ver MCPs disponibles
4. Usar `#` para referenciar herramientas específicas

```
@workspace usa #github-search para encontrar issues relacionados con MCP
```

---

## 🌟 Características Especiales

### IntelliSense

Autocompletado en `mcp.json` con validación de esquema.

### Botones de Control

Start/Stop/Restart servers desde el editor.

### Agent Mode

Uso de herramientas en contexto de chat.

### Dev Containers

Soporte para configuración en contenedores.

#### En .devcontainer/devcontainer.json:

```json
{
  "customizations": {
    "vscode": {
      "mcp": {
        "servers": {
          "container-server": {
            "command": "python",
            "args": ["/workspace/mcp-server.py"]
          }
        }
      }
    }
  }
}
```

### Autodiscovery

VS Code puede detectar automáticamente configuraciones de:

- Claude Desktop (`claude_desktop_config.json`)
- Cursor (`.cursor/mcp.json`)
- Otros clientes MCP compatibles

#### Habilitar en settings:

```json
{
  "chat.mcp.discovery.enabled": true
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

### Herramientas no aparecen

**Soluciones**:

1. Reiniciar VS Code
2. Verificar que el servidor esté en `mcp.json`
3. Revisar Output panel: `Output > MCP`

### Variables no se solicitan

**Causa**: Inputs mal configurados

**Solución**: Verificar estructura

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "unique-id",
      "description": "Clear description",
      "password": true
    }
  ]
}
```

### Figma MCP no funciona

**Requisitos**:

1. Figma Desktop instalado
2. Seat Dev/Full (Pro/Org/Enterprise)
3. "Enable local MCP Server" en Preferences

---

## 💡 Tips y Mejores Prácticas

### 1. Usar Workspace Config para Proyectos

`.vscode/mcp.json` en cada proyecto:

```json
{
  "servers": {
    "project-specific": {
      "command": "npx",
      "args": ["-y", "custom-mcp"]
    }
  }
}
```

### 2. Variables para Secrets

```json
{
  "inputs": [
    {
      "type": "promptString",
      "id": "api-key",
      "password": true
    }
  ]
}
```

### 3. Combinar Global + Workspace

- **Global**: MCPs comunes (context7, memory)
- **Workspace**: MCPs específicos del proyecto

### 4. Aprovechar Autodiscovery

```json
{
  "chat.mcp.discovery.enabled": true
}
```

### 5. Usar Agent Mode

En Copilot Chat:

```
@workspace #playwright "crea un test para login"
```

---

## 📊 Configuración Recomendada

### Para Desarrollo Full-Stack

```json
{
  "servers": {
    "supabase": {
      "command": "npx",
      "args": ["-y", "@supabase/mcp-server-supabase@latest"],
      "env": {
        "SUPABASE_ACCESS_TOKEN": "${input:supabase-token}"
      }
    },
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "context7": {
      "type": "http",
      "url": "https://context7.mcp.io"
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "supabase-token",
      "description": "Supabase access token",
      "password": true
    }
  ]
}
```

### Para Testing

```json
{
  "servers": {
    "playwright": {
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"]
    },
    "postman": {
      "type": "http",
      "url": "https://mcp.postman.com/mcp",
      "headers": {
        "Authorization": "Bearer ${input:postman-key}"
      }
    }
  },
  "inputs": [
    {
      "type": "promptString",
      "id": "postman-key",
      "description": "Postman API key",
      "password": true
    }
  ]
}
```

### Para Diseño (Figma)

```json
{
  "servers": {
    "figma": {
      "type": "http",
      "url": "http://localhost:9339/mcp"
    },
    "context7": {
      "type": "http",
      "url": "https://context7.mcp.io"
    }
  }
}
```

---

## 🎯 Comandos Útiles

### Via Command Palette

```
Ctrl/Cmd + Shift + P
```

- `MCP: Add Server` - Agregar nuevo servidor
- `MCP: Remove Server` - Eliminar servidor
- `MCP: Restart Server` - Reiniciar servidor
- `MCP: Show Output` - Ver logs de MCP

### Via Settings UI

```
File > Preferences > Settings
Search: "mcp"
```

---

## 📚 Recursos Adicionales

- **Documentación Oficial**: https://code.visualstudio.com/docs/copilot/customization/mcp-servers
- **Conceptos MCP**: [MCP - Guía General](./README.md)

---

**Última actualización**: 2025-10-29
**Versión VS Code**: 1.90+
