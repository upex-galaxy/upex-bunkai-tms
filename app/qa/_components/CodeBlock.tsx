'use client';

import { Button } from '@components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@components/ui/tabs';
import { Check, Copy } from 'lucide-react';
import { useState } from 'react';

const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude Code',
  opencode: 'OpenCode',
  codex: 'Codex',
  gemini: 'Gemini',
};

const AGENT_LANGS: Record<string, string> = {
  claude: 'json',
  opencode: 'jsonc',
  codex: 'toml',
  gemini: 'json',
};

function Pre({ code, language = 'bash' }: { code: string, language?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="group relative" data-testid="qa-code-block">
      <pre className="overflow-x-auto rounded-2 border border-stroke-1 bg-surface-2 p-4 text-xs leading-relaxed text-fg-1">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        onClick={copy}
        aria-label="Copy code"
        className="absolute right-2 top-2 opacity-0 transition-opacity group-hover:opacity-100"
        data-testid="qa-copy-code-button"
      >
        {copied
          ? <Check className="h-4 w-4 text-signal-pass" />
          : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
}

export function CodeBlock(props: { code: string, language?: string }) {
  return <Pre {...props} />;
}

export function AgentCodeBlock({ blocks, agents }: {
  blocks: Record<string, string>
  agents: string[]
}) {
  return (
    <Tabs defaultValue={agents[0]} data-testid="qa-agent-tabs">
      <TabsList>
        {agents.map(a => (
          <TabsTrigger key={a} value={a} data-testid={`qa-agent-tab-${a}`}>
            {AGENT_LABELS[a] ?? a}
          </TabsTrigger>
        ))}
      </TabsList>
      {agents.map(a => (
        <TabsContent key={a} value={a}>
          <Pre code={blocks[a]} language={AGENT_LANGS[a] ?? 'json'} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
