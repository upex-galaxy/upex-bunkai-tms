import { describe, expect, it } from 'bun:test';
import { ASSIGNABLE_ROLES, canChangeMemberRole, canChangeRole, canRemoveMember, canRemoveRole, isAssignableRole } from './member-ladder';

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

describe('canChangeRole — the role-change ladder (BK-2542)', () => {
  it('an Owner changes Admin, Member and Viewer, never an Owner', () => {
    expect(ROLES.map(r => canChangeRole('owner', r))).toEqual([true, true, true, false]);
  });
  it('an Admin changes Admin, Member and Viewer, never an Owner', () => {
    expect(ROLES.map(r => canChangeRole('admin', r))).toEqual([true, true, true, false]);
  });
  it('a Member, a Viewer or no role changes nobody', () => {
    for (const caller of ['member', 'viewer', null, 'stranger']) {
      expect(ROLES.some(r => canChangeRole(caller, r))).toBe(false);
    }
  });
});

describe('canChangeMemberRole — which rows offer the role control', () => {
  const me = 'me';
  const row = (user_id: string, role: string, status = 'active') => ({ user_id, role, status });
  it('the Owner gets it on every other row but an Owner row; never on their own', () => {
    expect(canChangeMemberRole({ callerId: me, callerRole: 'owner', target: row(me, 'owner') })).toBe(false);
    expect(canChangeMemberRole({ callerId: me, callerRole: 'owner', target: row('o2', 'owner') })).toBe(false);
    for (const role of ['admin', 'member', 'viewer']) {
      expect(canChangeMemberRole({ callerId: me, callerRole: 'owner', target: row('x', role) })).toBe(true);
    }
  });
  it('an Admin gets it on another Admin, a Member and a Viewer, not on their own row', () => {
    expect(canChangeMemberRole({ callerId: me, callerRole: 'admin', target: row(me, 'admin') })).toBe(false);
    expect(canChangeMemberRole({ callerId: me, callerRole: 'admin', target: row('a2', 'admin') })).toBe(true);
  });
  it('a Member or a Viewer gets it on no row', () => {
    for (const caller of ['member', 'viewer']) {
      expect(canChangeMemberRole({ callerId: me, callerRole: caller, target: row('x', 'viewer') })).toBe(false);
    }
  });
  it('never on a suspended row', () => {
    expect(canChangeMemberRole({ callerId: me, callerRole: 'owner', target: row('x', 'member', 'suspended') })).toBe(false);
  });
});

describe('isAssignableRole — the three roles a change may set', () => {
  it('accepts exactly viewer, member and admin', () => {
    expect([...ASSIGNABLE_ROLES]).toEqual(['viewer', 'member', 'admin']);
    for (const value of ASSIGNABLE_ROLES) {
      expect(isAssignableRole(value)).toBe(true);
    }
  });
  it('refuses owner, case and space variants, empty, null and numbers', () => {
    for (const value of ['owner', 'superadmin', 'Admin', ' admin ', '', null, undefined, 7, {}]) {
      expect(isAssignableRole(value)).toBe(false);
    }
  });
});
