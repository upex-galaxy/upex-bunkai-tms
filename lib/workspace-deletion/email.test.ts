import { describe, expect, it, mock } from 'bun:test';

// Shim `server-only` so the module graph loads under Bun (mirrors
// `lib/mail/resend-client.test.ts`).
void mock.module('server-only', () => ({}));

const { buildDeletionEmailHtml, buildDeletionEmailSubject } = await import('./email');

const INPUT = {
  workspaceName: 'Acme <QA>',
  workspaceId: '11111111-1111-1111-1111-111111111111',
  actorEmail: 'owner@example.com',
  purgeDeadline: '2026-09-29T00:00:00.000Z',
};

describe('buildDeletionEmailSubject (BK-512)', () => {
  it('names the workspace', () => {
    expect(buildDeletionEmailSubject(INPUT)).toBe('Acme <QA> is scheduled for deletion');
  });
});

describe('buildDeletionEmailHtml (BK-512, ADR-0015 point 9)', () => {
  it('names the workspace, the actor and the restore deadline, and links the restore route', () => {
    const html = buildDeletionEmailHtml(INPUT);
    expect(html).toContain('owner@example.com');
    expect(html).toContain(new Date(INPUT.purgeDeadline).toUTCString());
    expect(html).toContain(`/workspaces/${INPUT.workspaceId}/restore`);
  });

  it('escapes a user-typed workspace name rather than interpolating it raw', () => {
    const html = buildDeletionEmailHtml(INPUT);
    expect(html).not.toContain('Acme <QA>');
    expect(html).toContain('Acme &lt;QA&gt;');
  });
});
