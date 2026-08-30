import type { DigestCandidateRow } from './digest-grouping';
import { describe, expect, it } from 'bun:test';
import { DIGEST_ITEMS_PER_PROJECT_CAP, groupDigestCandidates } from './digest-grouping';

function row(overrides: Partial<DigestCandidateRow> & { notification_id: string }): DigestCandidateRow {
  return {
    recipient_user_id: 'user-1',
    recipient_email: 'user1@example.com',
    workspace_id: 'ws-1',
    project_id: 'proj-1',
    project_name: 'Bunkai Web',
    project_slug: 'bunkai-web',
    event_type: 'bug.assigned',
    entity_type: 'bug',
    entity_id: 'bug-1',
    payload: { title: 'Checkout total rounds incorrectly' },
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('groupDigestCandidates', () => {
  it('groups rows by user then by project, with correct counts', () => {
    const rows = [
      row({ notification_id: 'n1', recipient_user_id: 'u1', project_id: 'p1', project_name: 'Bunkai Web' }),
      row({ notification_id: 'n2', recipient_user_id: 'u1', project_id: 'p1', project_name: 'Bunkai Web' }),
      row({ notification_id: 'n3', recipient_user_id: 'u1', project_id: 'p2', project_name: 'Mobile App' }),
      row({ notification_id: 'n4', recipient_user_id: 'u2', project_id: 'p1', project_name: 'Bunkai Web' }),
    ];

    const digests = groupDigestCandidates(rows);
    expect(digests).toHaveLength(2);

    const u1 = digests.find(d => d.userId === 'u1')!;
    expect(u1.totalCount).toBe(3);
    expect(u1.projects).toHaveLength(2);
    expect(u1.projects.find(p => p.projectId === 'p1')!.totalCount).toBe(2);
    expect(u1.projects.find(p => p.projectId === 'p2')!.totalCount).toBe(1);

    const u2 = digests.find(d => d.userId === 'u2')!;
    expect(u2.totalCount).toBe(1);
  });

  it('caps items per project at 5 and reports the overflow count', () => {
    const rows = Array.from({ length: 8 }, (_, i) => row({ notification_id: `n${i}`, recipient_user_id: 'u1' }));

    const [digest] = groupDigestCandidates(rows);
    const [group] = digest.projects;

    expect(DIGEST_ITEMS_PER_PROJECT_CAP).toBe(5);
    expect(group.items).toHaveLength(5);
    expect(group.totalCount).toBe(8);
    expect(group.overflowCount).toBe(3);
  });

  it('does not report overflow when the count is exactly at or below the cap', () => {
    const atCap = groupDigestCandidates(Array.from({ length: 5 }, (_, i) => row({ notification_id: `n${i}` })));
    expect(atCap[0].projects[0].overflowCount).toBe(0);
    expect(atCap[0].projects[0].items).toHaveLength(5);

    const belowCap = groupDigestCandidates(Array.from({ length: 4 }, (_, i) => row({ notification_id: `n${i}` })));
    expect(belowCap[0].projects[0].overflowCount).toBe(0);
    expect(belowCap[0].projects[0].items).toHaveLength(4);
  });

  it('returns an empty array for zero rows', () => {
    expect(groupDigestCandidates([])).toEqual([]);
  });

  it('resolves title/signal/reason via the shared notification vocabulary (view.ts)', () => {
    const rows = [
      row({
        notification_id: 'n1',
        event_type: 'run.finished',
        entity_type: 'run',
        entity_id: 'run-1',
        payload: { title: 'Checkout happy path', verdict: 'failed' },
      }),
    ];
    const [digest] = groupDigestCandidates(rows);
    const [item] = digest.projects[0].items;
    expect(item.title).toBe('Run finished: Checkout happy path');
    expect(item.signal).toEqual({ label: 'failed', status: 'fail' });
  });

  it('builds a run/bug href from project slug + entity id, and null for other entity types', () => {
    const rows = [
      row({ notification_id: 'n1', entity_type: 'bug', entity_id: 'bug-1', project_slug: 'bunkai-web' }),
      row({ notification_id: 'n2', entity_type: 'run', entity_id: 'run-1', project_slug: 'bunkai-web' }),
      row({ notification_id: 'n3', entity_type: 'test', entity_id: 'test-1', project_slug: 'bunkai-web' }),
      row({ notification_id: 'n4', entity_id: null }),
    ];
    const [digest] = groupDigestCandidates(rows);
    const byId = (id: string) => digest.projects[0].items.find(i => i.notificationId === id)!;

    expect(byId('n1').href).toBe('/projects/bunkai-web/bugs/bug-1');
    expect(byId('n2').href).toBe('/projects/bunkai-web/runs/run-1');
    expect(byId('n3').href).toBeNull();
    expect(byId('n4').href).toBeNull();
  });
});
