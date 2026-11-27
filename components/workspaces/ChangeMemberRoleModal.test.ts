import { describe, expect, it } from 'bun:test';
import { roleChangeSuccessMessage } from './ChangeMemberRoleModal';

// BK-2542 AC-25 — the success copy counts unassigned Bugs only when there are some.

describe('roleChangeSuccessMessage', () => {
  const base = { email: 'lucia@example.test', workspaceName: 'Storefront QA' };
  it('0 Bugs: the role only', () => {
    expect(roleChangeSuccessMessage({ ...base, role: 'viewer', unassigned: 0 })).toBe('lucia@example.test is now Viewer in Storefront QA.');
  });
  it('1 Bug: singular', () => {
    expect(roleChangeSuccessMessage({ ...base, role: 'viewer', unassigned: 1 })).toBe('lucia@example.test is now Viewer in Storefront QA. 1 Bug was unassigned.');
  });
  it('N Bugs: plural', () => {
    expect(roleChangeSuccessMessage({ ...base, role: 'viewer', unassigned: 51 })).toBe('lucia@example.test is now Viewer in Storefront QA. 51 Bugs were unassigned.');
  });
  it('a raise names the role with its label', () => {
    expect(roleChangeSuccessMessage({ ...base, role: 'admin', unassigned: 0 })).toBe('lucia@example.test is now Admin in Storefront QA.');
  });
});
