'use client';

import type { QaConfig } from '../qa-config';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { AgentCodeBlock, CodeBlock } from './CodeBlock';

export function TwoWayTabs({ config, domain }: { config: QaConfig, domain: 'db' | 'api' }) {
  if (domain === 'db') {
    // dbhub.toml uses ${VAR} expansion; the URI references slots by name.
    // `${...}` placeholders are LITERAL teaching text — built via lines.join so
    // they are never evaluated as template interpolations.
    const tomlBlock = `# ${config.db.tomlPath} — committed, \${VAR} expansion, sin secretos
[[sources]]
id = "primary"
type = "\${DBHUB_TYPE}"        # postgres
host = "\${DBHUB_HOST}"
port = "\${DBHUB_PORT}"        # 5432 (Session Pooler)
database = "\${DBHUB_DATABASE}"
user = "\${DBHUB_USER}"        # <DBHUB_USER>.<project-ref> en el pooler
password = "\${DBHUB_PASSWORD}"
sslmode = "require"`;
    const uriBlock = `# URI para una extensión SQL de VSCode/Cursor — credenciales por NOMBRE de slot.
# Session Pooler, puerto 5432, IPv4-friendly. Host/user/ref viven en el .env.
${config.db.uriScheme}://<DBHUB_USER>.<project-ref>:<DBHUB_PASSWORD>@<DBHUB_HOST>:5432/<DBHUB_DATABASE>?sslmode=require

# Ejemplos de queries (mismas credenciales read-only de QA):
#   "Mostrame todas las tablas"
#   "Contá las tasks del usuario <email>"`;
    return (
      <Tabs defaultValue="mcp" data-testid="qa-db-ways">
        <TabsList>
          <TabsTrigger value="mcp">DBHub MCP</TabsTrigger>
          <TabsTrigger value="uri">URI (VSCode)</TabsTrigger>
        </TabsList>
        <TabsContent value="mcp" className="space-y-3">
          <CodeBlock language="toml" code={tomlBlock} />
          <AgentCodeBlock agents={config.mcp.agents} blocks={config.mcp.dbhub} />
        </TabsContent>
        <TabsContent value="uri">
          <CodeBlock language="bash" code={uriBlock} />
        </TabsContent>
      </Tabs>
    );
  }

  return (
    <Tabs defaultValue="openapi" data-testid="qa-api-ways">
      <TabsList>
        <TabsTrigger value="openapi">OpenAPI MCP</TabsTrigger>
        <TabsTrigger value="postman">Postman</TabsTrigger>
      </TabsList>
      <TabsContent value="openapi">
        <AgentCodeBlock agents={config.mcp.agents} blocks={config.mcp.openapi} />
      </TabsContent>
      <TabsContent value="postman">
        <AgentCodeBlock agents={config.mcp.agents} blocks={config.mcp.postman} />
      </TabsContent>
    </Tabs>
  );
}
