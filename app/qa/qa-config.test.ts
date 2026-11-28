import { X509Certificate } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, test } from 'bun:test';
import { parse } from 'yaml';
import { qaConfig } from './qa-config';

// The /qa guide links a public CA certificate and states its issuer, expiry and
// fingerprint (BK-49 Stage 5). These tests tie those claims to the file that is
// actually served, so replacing the .crt without the config (or the reverse)
// fails here instead of teaching students a wrong fingerprint.
const { tlsCa } = qaConfig.db;
const pem = readFileSync(join(process.cwd(), 'public', tlsCa.href), 'utf8');

describe('/qa database CA certificate', () => {
  test('the link points into public/qa and names the served file', () => {
    expect(tlsCa.href).toBe(`/qa/${tlsCa.fileName}`);
  });

  test('the file is exactly one public certificate and no private key', () => {
    expect(pem.match(/-----BEGIN CERTIFICATE-----/g)?.length).toBe(1);
    expect(pem).not.toContain('PRIVATE KEY');
  });

  test('the stated issuer, fingerprint and expiry match the file', () => {
    const cert = new X509Certificate(pem);
    expect(cert.subject).toContain(`CN=${tlsCa.issuer}`);
    expect(cert.issuer).toContain(`CN=${tlsCa.issuer}`);
    expect(cert.fingerprint256).toBe(tlsCa.sha256);
    expect(new Date(cert.validTo).toISOString().slice(0, 10)).toBe(tlsCa.validUntil);
  });

  test('the guide documents the last resort as disabling verification', () => {
    expect(tlsCa.lastResort).toContain('rejectUnauthorized: false');
    expect(tlsCa.lastResort).toContain('APAGA');
  });
});

const commands = [
  ...qaConfig.steps.flatMap(s => (s.code ? [s.code.code] : [])),
  ...qaConfig.adminToken.steps.map(s => s.code),
  ...qaConfig.troubleshooting.flatMap(g => g.items.flatMap(t => (t.code ? [t.code] : []))),
  tlsCa.nodeEnv,
  tlsCa.pgClient,
];

describe('/qa credentials hygiene', () => {
  test('the BK-29 link uses the Jira host of .agents/project.yaml', () => {
    const project = parse(readFileSync(join(process.cwd(), '.agents/project.yaml'), 'utf8'));
    expect(qaConfig.credentialsSource.url).toBe(`${project.issue_tracker.atlassian_url}/browse/BK-29`);
  });

  test('no command on the page prints a secret', () => {
    for (const code of commands) {
      expect(code).not.toMatch(/grep[^\n]*\.env\b/);
      expect(code).not.toMatch(/\benv\s*\|\s*grep/);
      expect(code).not.toMatch(/printenv|cat\s+\.env|set -x|curl -v/);
      expect(code).not.toMatch(/echo\s+"?\$\w*(?:PASSWORD|TOKEN)/);
    }
  });

  test('no credential value appears in the config', () => {
    const all = JSON.stringify(qaConfig);
    expect(all).not.toMatch(/bk_pat_[\w-]{12}\.[\w-]{8,}/);
    expect(all).not.toMatch(/postgres(?:ql)?:\/\/[^\s:/]+:[^\s@<]+@/);
    for (const code of commands) {
      expect(code).not.toMatch(/^DBHUB_PASSWORD=\S/m);
    }
  });

  test('only public values are printed, and the database values point at BK-29', () => {
    for (const row of qaConfig.credentials) {
      expect(row.value === undefined || row.source === 'public').toBe(true);
    }
    const dbRow = qaConfig.credentials.find(r => r.names.includes('DBHUB_PASSWORD'));
    expect(dbRow?.source).toBe('bk29');
  });
});

describe('/qa guide coverage', () => {
  test('the four harnesses each name their MCP config file', () => {
    expect(qaConfig.harnesses.map(h => [h.id, h.file])).toEqual([
      ['claude', '.mcp.json'],
      ['codex', '.codex/config.toml'],
      ['opencode', 'opencode.jsonc'],
      ['pi', '.pi/mcp.json'],
    ]);
  });

  test('troubleshooting covers the pooler port reset with the 6543 fix', () => {
    const items = qaConfig.troubleshooting.flatMap(g => g.items);
    const reset = items.find(t => t.symptom.includes('ECONNRESET'));
    expect(reset?.fix).toContain('6543');
  });
});
