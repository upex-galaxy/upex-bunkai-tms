// Server-only highlight orchestration for the /qa page.
//
// Client components (AgentCodeBlock, RequestCard) cannot import the Shiki
// bridge — so the SERVER pre-highlights every snippet here and the result is
// passed down as plain html-string props. This module is the single place
// where async Shiki work for the page happens.

import type { AgentBlock } from '../_components/AgentCodeBlock';
import type { ApiRequest, QaConfig } from '../qa-config';
import { AGENT_LANGS } from '../_components/CodeBlock';
import { highlight } from './highlight';

export interface PreparedRequest {
  id: string
  label: string
  method: ApiRequest['method']
  url: string
  description?: string
  headers: ApiRequest['headers']
  body: { html: string, code: string } | null
  response: { html: string, code: string } | null
  curl: { html: string, code: string }
}

// Highlight one MCP-config record ({ agent → snippet }) into the AgentBlock map
// the client AgentCodeBlock expects ({ agent → { code, html, language } }).
export async function prepareAgentBlocks(
  blocks: Record<string, string>,
  agents: string[],
): Promise<Record<string, AgentBlock>> {
  const entries = await Promise.all(
    agents.map(async (agent) => {
      const code = blocks[agent] ?? '';
      const language = AGENT_LANGS[agent] ?? 'json';
      const html = await highlight(code, language);
      return [agent, { code, html, language }] as const;
    }),
  );
  return Object.fromEntries(entries);
}

async function maybeHighlight(
  code: string | null,
  lang: string,
): Promise<{ html: string, code: string } | null> {
  if (!code) {
    return null;
  }
  return { html: await highlight(code, lang), code };
}

async function prepareRequest(req: ApiRequest): Promise<PreparedRequest> {
  const [body, response, curl] = await Promise.all([
    maybeHighlight(req.body, 'json'),
    maybeHighlight(req.response, 'json'),
    highlight(req.curl, 'bash'),
  ]);
  return {
    id: req.id,
    label: req.label,
    method: req.method,
    url: req.url,
    description: req.description,
    headers: req.headers,
    body,
    response,
    curl: { html: curl, code: req.curl },
  };
}

export interface CodeHtml {
  html: string
  code: string
}

export interface PreparedQa {
  mcp: {
    dbhub: Record<string, AgentBlock>
    openapi: Record<string, AgentBlock>
    postman: Record<string, AgentBlock>
  }
  db: {
    tomlBlock: CodeHtml
    uriBlock: CodeHtml
  }
  requests: PreparedRequest[]
}

async function codeHtml(code: string, lang: string): Promise<CodeHtml> {
  return { html: await highlight(code, lang), code };
}

// One-shot: highlight everything the page's CLIENT components need (server
// components highlight inline via <CodeBlock/>).
export async function prepareQa(config: QaConfig): Promise<PreparedQa> {
  const agents = config.mcp.agents;
  const [dbhub, openapi, postman, tomlBlock, uriBlock, requests] = await Promise.all([
    prepareAgentBlocks(config.mcp.dbhub, agents),
    prepareAgentBlocks(config.mcp.openapi, agents),
    prepareAgentBlocks(config.mcp.postman, agents),
    codeHtml(config.db.tomlBlock, 'toml'),
    codeHtml(config.db.uriBlock, 'bash'),
    Promise.all(config.api.apiRequests.map(prepareRequest)),
  ]);
  return {
    mcp: { dbhub, openapi, postman },
    db: { tomlBlock, uriBlock },
    requests,
  };
}
