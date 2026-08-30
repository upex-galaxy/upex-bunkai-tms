import type { DigestForUser } from './digest-grouping';
import { describe, expect, it } from 'bun:test';
import { buildDigestEmailHtml, buildDigestEmailSubject } from './digest-template';

function digest(overrides: Partial<DigestForUser> = {}): DigestForUser {
  return {
    userId: 'u1',
    email: 'user1@example.com',
    totalCount: 2,
    projects: [
      {
        projectId: 'p1',
        projectName: 'Bunkai Web',
        projectSlug: 'bunkai-web',
        totalCount: 2,
        overflowCount: 0,
        items: [
          {
            notificationId: 'n1',
            title: 'Bug assigned to you: <script>alert(1)</script>',
            signal: null,
            reason: null,
            href: '/projects/bunkai-web/bugs/bug-1',
            createdAt: new Date().toISOString(),
          },
          {
            notificationId: 'n2',
            title: 'Run finished: Checkout happy path',
            signal: { label: 'failed', status: 'fail' },
            reason: null,
            href: '/projects/bunkai-web/runs/run-1',
            createdAt: new Date().toISOString(),
          },
        ],
      },
    ],
    ...overrides,
  };
}

describe('buildDigestEmailSubject', () => {
  it('pluralizes correctly and includes the date label', () => {
    expect(buildDigestEmailSubject(1, 'August 28, 2026')).toBe('[Bunkai] 1 unread notification — August 28, 2026');
    expect(buildDigestEmailSubject(7, 'August 28, 2026')).toBe('[Bunkai] 7 unread notifications — August 28, 2026');
  });
});

describe('buildDigestEmailHtml', () => {
  it('renders the project group header with count, and every item title/link', () => {
    const html = buildDigestEmailHtml({ digest: digest(), digestDateLabel: 'August 28, 2026' });

    expect(html).toContain('Bunkai Web');
    expect(html).toContain('(2 unread)');
    expect(html).toContain('/projects/bunkai-web/bugs/bug-1');
    expect(html).toContain('/projects/bunkai-web/runs/run-1');
    expect(html).toContain('Run finished: Checkout happy path');
  });

  it('escapes untrusted title content — no raw <script> reaches the output', () => {
    const html = buildDigestEmailHtml({ digest: digest(), digestDateLabel: 'August 28, 2026' });

    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).toContain('&lt;script&gt;');
  });

  it('renders a signal chip only for items that have one', () => {
    const html = buildDigestEmailHtml({ digest: digest(), digestDateLabel: 'August 28, 2026' });
    expect(html).toContain('failed');
  });

  it('renders the overflow line only when overflowCount > 0', () => {
    const withOverflow = digest({
      projects: [{ ...digest().projects[0], overflowCount: 3 }],
    });
    const html = buildDigestEmailHtml({ digest: withOverflow, digestDateLabel: 'August 28, 2026' });
    expect(html).toContain('and 3 more unread notifications');

    const withoutOverflow = buildDigestEmailHtml({ digest: digest(), digestDateLabel: 'August 28, 2026' });
    expect(withoutOverflow).not.toContain('more unread notification');
  });

  it('links the open-inbox CTA to /home?openNotifications=1', () => {
    const html = buildDigestEmailHtml({ digest: digest(), digestDateLabel: 'August 28, 2026' });
    expect(html).toContain('/home?openNotifications=1');
  });

  it('links the footer preferences link to /settings/notifications', () => {
    const html = buildDigestEmailHtml({ digest: digest(), digestDateLabel: 'August 28, 2026' });
    expect(html).toContain('/settings/notifications');
  });

  it('includes the total unread count in the header and preheader without throwing on a numeric value', () => {
    const html = buildDigestEmailHtml({ digest: digest({ totalCount: 5 }), digestDateLabel: 'August 28, 2026' });
    expect(html).toContain('5 unread notifications');
  });
});
