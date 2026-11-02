import { describe, expect, it } from 'bun:test';
import { canRemoveMember, canRemoveRole } from './member-ladder';

// BK-572 — the ladder (ADR-0022). The database enforces it on its own; see
// member-removal-isolation.test.ts.

const ROLES = ['viewer', 'member', 'admin', 'owner'];

describe('canRemoveRole — the ladder', () => {
  it('an Owner removes every role, Owners included', () => {
    expect(ROLES.map(r => canRemoveRole('owner', r))).toEqual([true, true, true, true]);
  });
  it('an Admin removes Viewer, Member and Admin, never an Owner', () => {
    expect(ROLES.map(r => canRemoveRole('admin', r))).toEqual([true, true, true, false]);
  });
  it('a Member, a Viewer or no role removes nobody', () => {
    for (const caller of ['member', 'viewer', null, 'stranger']) {
      expect(ROLES.some(r => canRemoveRole(caller, r))).toBe(false);
    }
  });
  it('an unknown target role is never removable', () => {
    expect(canRemoveRole('owner', 'stranger')).toBe(false);
  });
});

describe('canRemoveMember — which rows offer Remove (AC-01, 02, 03, 11)', () => {
  const me = 'me';
  it('never the caller\'s own row, whatever the role', () => {
    expect(canRemoveMember({ callerId: me, callerRole: 'owner', target: { user_id: me, role: 'owner', status: 'active' } })).toBe(false);
  });
  it('an Admin gets no Remove on an Owner row, and does on another Admin', () => {
    expect(canRemoveMember({ callerId: me, callerRole: 'admin', target: { user_id: 'o', role: 'owner', status: 'active' } })).toBe(false);
    expect(canRemoveMember({ callerId: me, callerRole: 'admin', target: { user_id: 'a', role: 'admin', status: 'active' } })).toBe(true);
  });
  it('only active memberships', () => {
    expect(canRemoveMember({ callerId: me, callerRole: 'owner', target: { user_id: 'x', role: 'member', status: 'invited' } })).toBe(false);
  });
});
