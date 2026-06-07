'use client';

import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { AGENT_FILES, AGENT_LABELS, CodeFrame } from './CodeBlock';

export interface AgentBlock {
  code: string
  html: string
  language: string
}

/**
 * Per-agent MCP config viewer. Highlighting happens in the SERVER parent
 * (QaShell / TwoWayTabs caller) — this client component only renders the Tabs
 * shell + the editor-variant chrome around each pre-rendered html string.
 */
export function AgentCodeBlock({
  blocks,
  agents,
}: {
  blocks: Record<string, AgentBlock>
  agents: string[]
}) {
  return (
    <Tabs defaultValue={agents[0]} data-testid="qa-agent-tabs">
      <TabsList className="flex-wrap">
        {agents.map(a => (
          <TabsTrigger key={a} value={a} data-testid={`qa-agent-tab-${a}`}>
            {AGENT_LABELS[a] ?? a}
          </TabsTrigger>
        ))}
      </TabsList>
      {agents.map((a) => {
        const block = blocks[a];
        if (!block) {
          return null;
        }
        return (
          <TabsContent key={a} value={a}>
            <CodeFrame
              html={block.html}
              code={block.code}
              variant="editor"
              title={AGENT_FILES[a] ?? `config.${block.language}`}
              language={block.language}
            />
          </TabsContent>
        );
      })}
    </Tabs>
  );
}
