'use client';

import type { CodeHtml } from '../_lib/prepare';
import type { AgentBlock } from './AgentCodeBlock';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { AgentCodeBlock } from './AgentCodeBlock';
import { CodeFrame } from './CodeBlock';

export interface TwoWayDbProps {
  agents: string[]
  dbhub: Record<string, AgentBlock>
  tomlBlock: CodeHtml
  uriBlock: CodeHtml
}

export interface TwoWayApiProps {
  agents: string[]
  openapi: Record<string, AgentBlock>
  postman: Record<string, AgentBlock>
}

// DB variant — pre-highlighted html passed in from the server scope.
export function TwoWayTabsDb({ agents, dbhub, tomlBlock, uriBlock }: TwoWayDbProps) {
  return (
    <Tabs defaultValue="mcp" data-testid="qa-db-ways">
      <TabsList>
        <TabsTrigger value="mcp">DBHub MCP</TabsTrigger>
        <TabsTrigger value="uri">URI (VSCode)</TabsTrigger>
      </TabsList>
      <TabsContent value="mcp" className="space-y-3">
        <CodeFrame
          html={tomlBlock.html}
          code={tomlBlock.code}
          variant="editor"
          title="dbhub.toml"
          language="toml"
        />
        <AgentCodeBlock agents={agents} blocks={dbhub} />
      </TabsContent>
      <TabsContent value="uri">
        <CodeFrame
          html={uriBlock.html}
          code={uriBlock.code}
          variant="terminal"
          title="connection-string"
          language="bash"
        />
      </TabsContent>
    </Tabs>
  );
}

// API variant — OpenAPI MCP vs Postman, both pre-highlighted.
export function TwoWayTabsApi({ agents, openapi, postman }: TwoWayApiProps) {
  return (
    <Tabs defaultValue="openapi" data-testid="qa-api-ways">
      <TabsList>
        <TabsTrigger value="openapi">OpenAPI MCP</TabsTrigger>
        <TabsTrigger value="postman">Postman</TabsTrigger>
      </TabsList>
      <TabsContent value="openapi">
        <AgentCodeBlock agents={agents} blocks={openapi} />
      </TabsContent>
      <TabsContent value="postman">
        <AgentCodeBlock agents={agents} blocks={postman} />
      </TabsContent>
    </Tabs>
  );
}
