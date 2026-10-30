# Model Context Protocol (MCP) - Guía General

## 📖 Qué es MCP?

**Model Context Protocol (MCP)** es un estándar abierto que define cómo los modelos de lenguaje (LLMs) se conectan e interactúan con herramientas externas y fuentes de datos.

**Analogía**: MCP es al ecosistema de IA lo que HTTP es a la web. Crea un lenguaje común que permite a cualquier cliente de IA comunicarse con cualquier fuente de datos o herramienta.

## 🏗️ Componentes de MCP

### Cliente MCP

La aplicación que usa el modelo de IA. En este repo, los tres hosts del contrato: Claude Code, OpenCode y Codex CLI + Desktop (`.agents/instructions/agent-harnesses.md` §5.5).

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

⚠️ **IMPORTANTE**: SSE está deprecado en el estándar MCP en favor de HTTP Streamable. Usalo solo cuando un servicio no expone otra cosa.

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
        "Authorization": "Bearer ${API_TOKEN}"
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

Un secreto nunca se escribe en el config y su valor vive en `.env` (gitignored). En los tres hosts, un server stdio que necesita valores arranca con el mismo loader de `.env`:

```
bunx -p varlock@<pin> varlock run --no-redact-stdout --inject vars --filter API_KEY -- <server>
```

El loader lee `.env` (o el gestor de secretos que nombra el schema) al arrancar el server, lo haya lanzado quien sea (terminal, app de escritorio, worker supervisado), y le pasa solo las variables de su `--filter`. No se copia ningún valor a otro archivo. Un server remoto (HTTP) no puede usar el loader: referencia su secreto con `${VAR}` (Claude Code), `{env:VAR}` (OpenCode) o `bearer_token_env_var` (Codex), desde el entorno del proceso del harness, donde `.env` no llega en ningún lanzamiento. Preferí el login OAuth del server (como el MCP remoto de Atlassian vía `mcp-remote`); un server que solo acepta token necesita que exportes esa ÚNICA variable en el shell antes de lanzar, sabiendo que queda en el entorno del agente.

Ningún host avisa cuando falta una variable: el servidor arranca y falla en su primera llamada autenticada. Un 401/403 es la señal; `/mcp` dentro de la sesión es el chequeo (`AGENTS.md` Critical Rule #9).

---

## 🧩 Cómo usa MCP este repo

Las skills no nombran servidores: piden una **capacidad** y el agente la resuelve por el sufijo del nombre de la tool, sea cual sea el prefijo que le dio el host. Si ninguna tool la provee, el agente se detiene en ese paso, dice qué falta y cómo habilitarlo, y espera.

| Capacidad          | Para qué                                        | Dónde vive                                                              |
| ------------------ | ----------------------------------------------- | ----------------------------------------------------------------------- |
| `library-docs`     | documentación oficial de librerías, SDKs y CLIs | servidor commiteado (`.mcp.json` y sus pares)                           |
| `web-search`       | búsqueda web, fixes de la comunidad             | nivel harness, una vez por máquina (Exa primero, Tavily segundo); nunca en un archivo del proyecto |
| `db`               | schema, ledger de migraciones, lecturas         | servidor commiteado                                                     |
| `automation-flows` | workflows de n8n                                | servidor commiteado                                                     |

Qué servidor da cada capacidad, los sufijos y cómo habilitar una que falta: `.agents/skills/agentic-dev-core/references/mcp-capabilities.md`. La automatización de browser no es un MCP: es `playwright-cli` (`.agents/instructions/agent-tool-resolution.md` §6). Jira y Confluence van por `acli`; el MCP de Atlassian es opt-in ([`docs/mcp/README.md`](../../mcp/README.md)).

---

## 📚 Recursos

### Documentación Oficial

- **MCP Specification**: https://modelcontextprotocol.io/
- **GitHub MCP Registry**: https://github.com/modelcontextprotocol/servers

### Configs en este repo

Este boilerplate corre sobre tres harnesses desde una sola fuente de instrucciones y skills (`AGENTS.md` + `.agents/skills/`). El inventario MCP (el que declara `.mcp.json`) existe una vez por formato de host, commiteado en el repo y verificado en paridad por `bun run agents:compat:check`.

| Harness             | Config MCP                                               | Secretos                                          | Cómo se abre                  |
| ------------------- | -------------------------------------------------------- | ------------------------------------------------- | ----------------------------- |
| Claude Code         | `.mcp.json` (commiteada)                                 | loader de `.env` (`--filter`)                     | `claude` o la app de escritorio |
| OpenCode            | `opencode.jsonc` (commiteada)                            | loader de `.env` (`--filter`)                     | `opencode`                    |
| Codex CLI + Desktop | `.codex/config.toml` (commiteada; requiere repo trusted) | loader de `.env` (`--filter`) + `startup_timeout_sec` | `codex` o Codex Desktop       |

Ningún lanzamiento usa un script envoltorio: el binario pelado, la app de escritorio y un worker supervisado no cargan `.env` en el proceso del agente (ADR-0016), y el loader lo lee igual para cada MCP. Después de un cambio de `.env`, reiniciá la sesión (OpenCode: también `opencode service restart`).

### Guías por host

- [Claude Code](./claude-code.md)
- [Codex CLI + Desktop](./codex.md)
- OpenCode: los comentarios de `opencode.jsonc` y la sección OpenCode de [`docs/mcp/mcp-configuration-guide.md`](../../mcp/mcp-configuration-guide.md)
- Templates opt-in y cómo sumar un servidor: [`docs/mcp/README.md`](../../mcp/README.md)

---

## 🔑 Conceptos Clave

1. **MCP = Estándar Universal**: un protocolo para conectar IAs con herramientas
2. **Tres Transportes**: stdio (local), SSE (deprecado), HTTP Streamable (remoto)
3. **Secretos fuera del config**: referencias por host, valores en `.env`
4. **Stateful Protocol**: una sesión permite múltiples llamadas RPC
5. **JSON-RPC**: protocolo subyacente para mensajes

---

**Referencia**: Documentación oficial de Model Context Protocol
