import { archivedNameMessage, mapMilestoneLifecycleRpcError, mapMilestonePlanRpcError, mapMilestoneRpcError } from '@lib/milestones/errors';
import { describe, expect, test } from 'bun:test';

// BK-1899 — the SQLSTATE -> HTTP mapping of the two codes 0130 adds: 45507 (a write
// to an archived Milestone) and 45508 (a name an archived Milestone holds, named in
// the error DETAIL).

interface Thrown { status: number, message: string, details?: { reason?: string, archived_name?: string | null } }

function thrownBy(map: (error: { code?: string, message: string, details?: string | null }) => never, error: { code?: string, message: string, details?: string | null }): Thrown {
  let caught: unknown;
  let returned = false;
  try {
    map(error);
    returned = true;
  }
  catch (raw) {
    caught = raw;
  }
  expect(returned).toBe(false);
  return caught as Thrown;
}

describe('mapMilestoneRpcError — BK-1899', () => {
  test('45507 is a 409 milestone_archived', () => {
    const error = thrownBy(mapMilestoneRpcError, { code: '45507', message: 'milestone_archived' });
    expect(error.status).toBe(409);
    expect(error.details?.reason).toBe('milestone_archived');
    expect(error.message).toBe('This milestone is archived. Restore it before editing it.');
  });

  test('45508 is a 409 that names the archived Milestone', () => {
    const error = thrownBy(mapMilestoneRpcError, { code: '45508', message: 'milestone_name_archived', details: 'Release 1.0' });
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ reason: 'milestone_name_archived', archived_name: 'Release 1.0' });
    expect(error.message).toBe('An archived milestone already uses the name “Release 1.0”. Restore it or choose another name.');
  });

  test('45508 without a detail still refuses, without inventing a name', () => {
    const error = thrownBy(mapMilestoneRpcError, { code: '45508', message: 'milestone_name_archived' });
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ reason: 'milestone_name_archived', archived_name: null });
    expect(error.message).toBe('An archived milestone already uses this name. Restore it or choose another name.');
  });

  test('an active clash keeps its own answer', () => {
    const error = thrownBy(mapMilestoneRpcError, { code: '23505', message: 'duplicate' });
    expect(error.details?.reason).toBe('milestone_name_taken');
  });
});

describe('mapMilestonePlanRpcError — BK-1899', () => {
  test('45507 is a 409 milestone_archived for attach and detach', () => {
    const error = thrownBy(mapMilestonePlanRpcError, { code: '45507', message: 'milestone_archived' });
    expect(error.status).toBe(409);
    expect(error.details?.reason).toBe('milestone_archived');
  });
});

describe('archivedNameMessage', () => {
  test('treats a blank name as no name', () => {
    expect(archivedNameMessage('   ')).toBe('An archived milestone already uses this name. Restore it or choose another name.');
  });
});

describe('mapMilestoneLifecycleRpcError — BK-2091', () => {
  test('42501 from archive or restore is a 403 forbidden_role: the caller is a member below the write role', () => {
    const error = thrownBy(mapMilestoneLifecycleRpcError, { code: '42501', message: 'forbidden' });
    expect(error.status).toBe(403);
    expect(error.details).toEqual({ reason: 'forbidden_role' });
    expect(error.message).toBe('Archiving or restoring a milestone requires the member role or higher.');
  });

  test('a non-member keeps the non-disclosing 404', () => {
    const error = thrownBy(mapMilestoneLifecycleRpcError, { code: 'P0002', message: 'milestone_not_found' });
    expect(error.status).toBe(404);
    expect(error.details).toEqual({ reason: 'not_found' });
  });

  test('every other code keeps the shared mapping', () => {
    const error = thrownBy(mapMilestoneLifecycleRpcError, { code: '45507', message: 'milestone_archived' });
    expect(error.details?.reason).toBe('milestone_archived');
  });

  test('the shared mapper still answers not_a_member for 42501 (create and edit are out of BK-2091)', () => {
    const error = thrownBy(mapMilestoneRpcError, { code: '42501', message: 'forbidden' });
    expect(error.details).toEqual({ reason: 'not_a_member' });
  });
});
