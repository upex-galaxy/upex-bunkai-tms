# Model Context Protocol (MCP) - Guía General

## 📖 ¿Qué es MCP?

**Model Context Protocol (MCP)** es un estándar abierto que define cómo los modelos de lenguaje (LLMs) se conectan e interactúan con herramientas externas y fuentes de datos.

**Analogía**: MCP es al ecosistema de IA lo que HTTP es a la web. Crea un lenguaje común que permite a cualquier cliente de IA comunicarse con cualquier fuente de datos o herramienta.

## 🏗️ Componentes de MCP

### Cliente MCP

La aplicación que usa el modelo de IA (Claude Code, OpenCode, Codex, Gemini CLI, GitHub Copilot, etc.)

### Servidor MCP

Un programa que expone herramientas, recursos y capacidades específicas al cliente.

### Transporte

El método de comunicación entre cliente y servidor (stdio, SSE, HTTP).

### Herramientas (Tools)

Funciones que el servidor expone y que el modelo puede invocar.

### Recursos (Resources)

Datos que el servidor puede proporcionar (archivos, APIs, bases de datos).

### Prompts

Plantillas predefinidas que el servidor puede ofrecer.

---

## 🚀 Tipos de Transporte MCP

### 1. stdio (Standard Input/Output)

**Uso principal**: Servidores locales que corren en la misma máquina que el cliente.

#### Características

- **Latencia**: Mínima (sin overhead de red)
- **Seguridad**: Alta (comunicación local)
- **Escalabilidad**: Limitada (un proceso por cliente)
- **Autenticación**: No requiere (proceso local)
- **Complejidad**: Baja

#### Cuándo usar stdio

- Desarrollo local y pruebas
- Acceso a recursos del sistema de archivos local
- Herramientas de línea de comandos
- Entornos de un solo usuario
- Cuando el rendimiento es crítico

#### Formato de configuración típico

```json
{
  "mcpServers": {
    "nombre-servidor": {
      "command": "node",
      "args": ["/ruta/a/servidor.js"],
      "env": {
        "API_KEY": "valor"
      }
    }
  }
}
```

### 2. SSE (Server-Sent Events)

**Uso principal**: Servidores remotos con comunicación unidireccional servidor→cliente.

#### Características

- **Latencia**: Media (overhead de red HTTP)
- **Seguridad**: Media (requiere HTTPS en producción)
- **Escalabilidad**: Media (conexiones long-running)
- **Autenticación**: Soporta headers HTTP, tokens bearer
- **Complejidad**: Media

#### Estado actual

⚠️ **IMPORTANTE**: SSE está siendo deprecado en favor de HTTP Streamable. Muchos servidores y clientes están eliminando soporte para SSE.

#### Formato de configuración típico

```json
{
  "mcpServers": {
    "servidor-remoto": {
      "type": "sse",
      "url": "https://api.ejemplo.com/mcp",
      "headers": {
        "Authorization": "Bearer token"
      }
    }
  }
}
```

### 3. HTTP Streamable (Recomendado para Producción)

**Uso principal**: Servidores remotos escalables y stateless.

#### Características

- **Latencia**: Media-baja (HTTP optimizado)
- **Seguridad**: Alta (OAuth 2.0, API keys, tokens)
- **Escalabilidad**: Alta (stateless, balanceo de carga)
- **Autenticación**: OAuth 2.0, API keys, custom headers
- **Complejidad**: Media-alta

#### Cuándo usar HTTP Streamable

- **Producción** (siempre que sea posible)
- Múltiples usuarios
- Servicios en la nube
- Cuando se requiere balanceo de carga
- Integraciones empresariales

#### Formato de configuración típico

```json
{
  "mcpServers": {
    "servidor-http": {
      "type": "http",
      "url": "https://api.ejemplo.com/mcp",
      "headers": {
        "Authorization": "Bearer ${input:token}"
      }
    }
  }
}
```

### Comparativa de Transportes

| Feature           | stdio            | SSE          | HTTP Streamable |
| ----------------- | ---------------- | ------------ | --------------- |
| **Latencia**      | Muy baja         | Media        | Media-baja      |
| **Escalabilidad** | Baja             | Media        | Alta            |
| **Multi-usuario** | ❌               | Limitado     | ✅              |
| **Autenticación** | No necesaria     | Básica       | Robusta (OAuth) |
| **Producción**    | ❌               | ⚠️ Deprecado | ✅ Recomendado  |
| **Uso típico**    | Desarrollo local | Transición   | Servicios cloud |

---

## 🔒 Autenticación y Seguridad

### Métodos de Autenticación

#### 1. API Keys

**Uso**: Autenticación simple para prototipos

```json
{
  "headers": {
    "X-API-Key": "api-key-secreta"
  }
}
```

**Pros**: Fácil de implementar
**Contras**: Menos seguro en producción, sin expiración automática

#### 2. Bearer Tokens

**Uso**: Tokens de autenticación estándar HTTP

```json
{
  "headers": {
    "Authorization": "Bearer eyJhbGciOiJIUzI1NiIs..."
  }
}
```

#### 3. OAuth 2.0 (Recomendado)

**Uso**: Autenticación robusta con delegación de permisos

**Pros**:

- Estándar de la industria
- Tokens con expiración
- Revocación granular
- Soporte multi-tenant

```json
{
  "oauth": {
    "discoveryUrl": "https://mcp.example.com/.well-known/oauth-protected-resource"
  }
}
```

### Mejores Prácticas de Seguridad

#### Para Servidores stdio Locales

✅ **Hacer**:

- Validar inputs del cliente
- Limitar acceso a filesystem
- Usar permisos mínimos necesarios

❌ **Evitar**:

- Ejecutar comandos shell sin sanitizar
- Acceso sin restricciones al filesystem
- Confiar ciegamente en datos del cliente

#### Para Servidores HTTP/SSE Remotos

✅ **Hacer**:

- Usar HTTPS siempre
- Implementar OAuth 2.0
- Validar origen de peticiones (CORS)
- Implementar rate limiting
- Logs de auditoría

❌ **Evitar**:

- HTTP en producción
- API keys hardcodeadas
- Tokens sin expiración
- Aceptar cualquier cliente

### Variables de Entorno y Secretos

#### Approach 1: Variables de Entorno del Sistema

```bash
export API_KEY="mi-clave-secreta"
```

```json
{
  "env": {
    "API_KEY": "${API_KEY}"
  }
}
```

#### Approach 2: Input Prompts

```json
{
  "inputs": [
    {
      "id": "api-token",
      "type": "promptString",
      "description": "Ingresa tu API token",
      "password": true
    }
  ]
}
```

---

## 📊 Casos de Uso Comunes

### 1. Acceso a Base de Datos

**MCP Server**: PostgreSQL, MySQL, Supabase
**Transporte**: stdio (local) o HTTP (remoto)

### 2. Testing Automatizado

**MCP Server**: Playwright, Postman
**Transporte**: stdio

### 3. Gestión de Proyectos

**MCP Server**: GitHub, Atlassian, Notion
**Transporte**: HTTP

### 4. Búsqueda y Documentación

**MCP Server**: Context7, Tavily
**Transporte**: HTTP

### 5. Comunicación en Equipo

**MCP Server**: Slack, Discord
**Transporte**: stdio o HTTP

---

## 🎯 Recomendaciones por Caso de Uso

### Desarrollo Local Individual

- **Transporte**: stdio
- **Por qué**: Latencia mínima, setup simple

### Equipo Pequeño (2-10 personas)

- **Transporte**: stdio para recursos locales, HTTP para compartidos
- **Por qué**: Balance entre simplicidad y colaboración

### Empresa/Producción

- **Transporte**: HTTP Streamable exclusivamente
- **Por qué**: Escalabilidad, OAuth, auditoría

### Experimentación/Prototyping

- **Transporte**: Cualquiera
- **Por qué**: Flexibilidad, rápida iteración

---

## 🛠️ MCPs Populares

### Desarrollo

- **Supabase** - PostgreSQL database y auth
- **Playwright** - E2E testing
- **Postman** - API testing

### Productividad

- **GitHub** - Repositorios y proyectos
- **Atlassian** - Jira y Confluence
- **Notion** - Documentación
- **Slack** - Comunicación

### Información

- **Context7** - Documentación de bibliotecas
- **Tavily** - Web search
- **Memory** - Memoria persistente

### DevOps

- **Vercel** - Deployment
- **Sentry** - Error monitoring

---

## 📚 Recursos

### Documentación Oficial

- **MCP Specification**: https://modelcontextprotocol.io/
- **GitHub MCP Registry**: https://github.com/modelcontextprotocol/servers
- **Awesome MCP Servers**: https://github.com/punkpeye/awesome-mcp-servers

### Configs en este repo

Este boilerplate corre sobre tres harnesses desde una sola fuente de instrucciones y skills (`AGENTS.md` + `.agents/skills/`). El inventario MCP (el que declara `.mcp.json`; el boilerplate trae `context7`, `tavily`, `supabase`, `n8n`) existe una vez por formato de host, commiteado en el repo y verificado en paridad por `bun run agents:compat:check`. Los demás clientes solo tienen template o configuración manual: no hay adapter en runtime.

| Harness                      | Config MCP                                               | Sintaxis de env vars                             | Launcher           |
| ---------------------------- | -------------------------------------------------------- | ------------------------------------------------ | ------------------ |
| Claude Code                  | `.mcp.json` (commiteada)                                 | `${VAR}`                                         | `bun run claude`   |
| OpenCode                     | `opencode.jsonc` (commiteada)                            | `{env:VAR}`                                      | `bun run opencode` |
| Codex CLI + Desktop          | `.codex/config.toml` (commiteada; requiere repo trusted) | `env_vars` / `bearer_token_env_var` (por nombre) | `bun run codex`    |
| Gemini CLI                   | solo template opt-in: `docs/mcp/gemini.template.json`    | `$VAR`                                           | manual             |
| GitHub Copilot CLI / VS Code | manual, según las guías de abajo                         | según la herramienta                             | manual             |

### Herramientas Especificas

Para configuraciones especificas por herramienta, consulta:

- [Claude Code](./claude-code.md)
- [Codex CLI + Desktop](./codex.md)
- [Gemini CLI](./gemini-cli.md) (solo template, sin adapter en runtime)
- [GitHub Copilot CLI](./copilot-cli.md) (manual)
- [VS Code con GitHub Copilot](./vscode.md) (manual)

---

## 🔑 Conceptos Clave

1. **MCP = Estándar Universal**: Un protocolo para conectar IAs con herramientas
2. **Tres Transportes**: stdio (local), SSE (deprecado), HTTP (producción)
3. **Seguridad Primero**: OAuth para producción, variables de entorno para secretos
4. **Stateful Protocol**: Una sesión permite múltiples llamadas RPC
5. **JSON-RPC**: Protocolo subyacente para mensajes

---

**Última actualización**: 2025-10-29
**Referencia**: Documentación oficial de Model Context Protocol
