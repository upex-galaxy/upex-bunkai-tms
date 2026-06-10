import { inviteAcceptAction, ROLE_RANK } from '@lib/workspaces/invites';
import { describe, expect, test } from 'bun:test';

describe('inviteAcceptAction (BK-62)', () => {
  test('no existing membership -> upsert (plain insert)', () => {
    expect(inviteAcceptAction(null, 'member')).toBe('upsert');
  });

  test('non-active row (status=invited) -> upsert (activate with invite role)', () => {
    expect(inviteAcceptAction({ role: 'member', status: 'invited' }, 'member')).toBe('upsert');
  });

  test('owner accepting a member invite -> rejected (the BK-62 demotion repro)', () => {
    expect(inviteAcceptAction({ role: 'owner', status: 'active' }, 'member')).toBe('reject_already_member');
  });

  test('equal role -> rejected (no-op accept is a conflict)', () => {
    expect(inviteAcceptAction({ role: 'member', status: 'active' }, 'member')).toBe('reject_already_member');
  });

  test('admin accepting a viewer invite -> rejected', () => {
    expect(inviteAcceptAction({ role: 'admin', status: 'active' }, 'viewer')).toBe('reject_already_member');
  });

  test('member accepting an admin invite -> upsert (legitimate promotion)', () => {
    expect(inviteAcceptAction({ role: 'member', status: 'active' }, 'admin')).toBe('upsert');
  });

  test('unknown stored role ranks lowest and never blocks a promotion', () => {
    expect(inviteAcceptAction({ role: 'mystery', status: 'active' }, 'viewer')).toBe('upsert');
  });

  test('rank order is viewer < member < admin < owner', () => {
    expect(ROLE_RANK.viewer).toBeLessThan(ROLE_RANK.member);
    expect(ROLE_RANK.member).toBeLessThan(ROLE_RANK.admin);
    expect(ROLE_RANK.admin).toBeLessThan(ROLE_RANK.owner);
  });
});
