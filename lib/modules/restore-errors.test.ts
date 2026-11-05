import { describe, expect, it } from 'bun:test';
import { restoreErrorFrom } from './restore-errors';

describe('restoreErrorFrom', () => {
  it('names the archived ancestor in a 409', () => {
    const error = restoreErrorFrom({
      code: '45004',
      message: 'ancestor_archived',
      details: JSON.stringify({ ancestor_id: 'a1', ancestor_name: 'Payments' }),
    });
    expect(error.status).toBe(409);
    expect(error.code).toBe('conflict');
    expect(error.details).toEqual({ reason: 'ancestor_archived', ancestor_id: 'a1', ancestor_name: 'Payments' });
    expect(error.message).toBe('Restore "Payments" first. It is still archived.');
  });

  it('still answers the named refusal when the detail is unreadable', () => {
    const error = restoreErrorFrom({ code: '45004', message: 'ancestor_archived', details: 'not json' });
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ reason: 'ancestor_archived', ancestor_id: null, ancestor_name: null });
    expect(error.message).toBe('Restore its archived parent module first. It is still archived.');
  });

  it('answers depth as a 409, not the 422 of a move', () => {
    const error = restoreErrorFrom({ code: '45002', message: 'depth_exceeded' });
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ reason: 'depth_exceeded' });
  });

  it('names the colliding Module', () => {
    const error = restoreErrorFrom({ code: '45005', message: 'name_collision', details: JSON.stringify({ module_name: 'Checkout' }) });
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ reason: 'name_collision', module_name: 'Checkout' });
  });

  it('names the taken Story key', () => {
    const error = restoreErrorFrom({ code: '45006', message: 'story_key_collision', details: JSON.stringify({ external_id: 'BK-7' }) });
    expect(error.status).toBe(409);
    expect(error.details).toEqual({ reason: 'story_key_collision', external_id: 'BK-7' });
  });

  it('reads a key taken mid-restore from the index, and no other 23505', () => {
    const taken = restoreErrorFrom({
      code: '23505',
      message: 'duplicate key value violates unique constraint "user_stories_project_external_id_uniq"',
    });
    expect(taken.status).toBe(409);
    expect(taken.details).toEqual({ reason: 'story_key_collision', external_id: null });

    const other = restoreErrorFrom({ code: '23505', message: 'duplicate key value violates unique constraint "x"' });
    expect(other.status).toBe(500);
  });

  it('maps the gate and the missing id', () => {
    const forbidden = restoreErrorFrom({ code: '42501', message: 'forbidden' });
    expect(forbidden.status).toBe(403);
    expect(forbidden.details).toEqual({ reason: 'not_a_member' });
    expect(restoreErrorFrom({ code: 'P0002', message: 'module_not_found' }).status).toBe(404);
  });

  it('keeps anything else a 500', () => {
    expect(restoreErrorFrom({ code: 'P0001', message: 'test_failpoint' }).status).toBe(500);
  });
});
