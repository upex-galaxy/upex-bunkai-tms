/**
 * Regression tests for `scripts/git-policy.ts`.
 *
 * Two defects, one test file:
 *
 * 1. ACCEPTED DIVERGENCES. `.agents/project.yaml` lists
 *    `git_strategy.policy.accepted_divergences`, and `.agents/instructions/agent-project.md` → "Git Strategy (this repository)"
 *    promises that `verify` reports a listed divergence as ACCEPTED and exits 0.
 *    The script never read the list: `main.direct_push_to_protected` stayed a
 *    DRIFT and `verify` exited 1 on a divergence the project had signed off.
 *
 * 2. THE BYPASS READ. GitHub serves `bypass_actors` only to a caller with admin
 *    rights on the repository. A non-admin receives the SAME, unchanged ruleset
 *    with that key omitted. Coercing the missing key to `[]` reported
 *    `admin_bypass declared: true / enforced: false` on a host nobody touched.
 *
 * Fixture provenance: PRIVILEGED is a trimmed copy of
 * `gh api repos/upex-galaxy/agentic-dev-boilerplate/rulesets/16809536` read by a
 * repo admin on 2026-10-02. UNPRIVILEGED is the shape GitHub returns for the same
 * call to a non-admin account (key omitted, `current_user_can_bypass: never`),
 * captured on the sibling QA boilerplate's ruleset on 2026-09-18.
 */

import type { AcceptedDivergence, Finding, GitStrategy, Rule } from './git-policy.ts';

import { describe, expect, test } from 'bun:test';

import { acceptedFields, assessBypass, buildRules, classifyAccepted } from './git-policy.ts';

const ACCEPTED_DIRECT_PUSH: AcceptedDivergence = {
  field: 'main.direct_push_to_protected',
  enforced: 'blocked (pull_request rule)',
  accepted: '2026-08-21',
  reason: 'Admin credential pushes directly; the host rule protects everyone else.',
};

function strategy(overrides: Partial<GitStrategy['policy']> = {}): GitStrategy {
  return {
    strategy: 'solo-main',
    branches: { production: 'main', integration: null, ephemeral_pattern: null },
    protected: ['main'],
    decisions: { promote_method: 'n/a', feature_merge: 'n/a', hotfix_policy: 'n/a' },
    policy: { direct_push_to_protected: 'allowed', admin_bypass: true, require_pr_reviews: 1, ...overrides },
    meta: {},
  };
}

function directPushDrift(): Finding {
  return {
    severity: 'drift',
    field: 'main.direct_push_to_protected',
    declared: 'allowed',
    enforced: 'blocked (a pull_request rule covers this branch)',
  };
}

const HOST_PR_RULE: Rule = {
  type: 'pull_request',
  parameters: { required_approving_review_count: 1, allowed_merge_methods: ['merge'] },
};

describe('classifyAccepted: a signed-off divergence is not drift', () => {
  test('a drift listed in accepted_divergences becomes ACCEPTED', () => {
    const findings = [directPushDrift()];
    const byField = classifyAccepted(findings, [ACCEPTED_DIRECT_PUSH]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('accepted');
    expect(byField.get('main.direct_push_to_protected')?.reason).toContain('Admin credential');
  });

  test('a drift NOT listed stays a drift', () => {
    const other: Finding = { severity: 'drift', field: 'main.require_pr_reviews', declared: '0', enforced: '1' };
    const findings = [other, directPushDrift()];
    classifyAccepted(findings, [ACCEPTED_DIRECT_PUSH]);
    expect(findings.map(f => f.severity)).toEqual(['drift', 'accepted']);
  });

  test('an entry with no matching drift is reported as a STALE info finding', () => {
    const findings: Finding[] = [];
    classifyAccepted(findings, [ACCEPTED_DIRECT_PUSH]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('info');
    expect(findings[0]?.field).toBe('main.direct_push_to_protected');
    expect(findings[0]?.enforced).toContain('STALE');
  });

  test('a field whose host side was UNKNOWN cannot prove its acceptance stale', () => {
    const accepted: AcceptedDivergence = { field: 'admin_bypass', reason: 'org policy' };
    const findings: Finding[] = [{ severity: 'info', unknown: true, field: 'admin_bypass', declared: 'true', enforced: 'UNKNOWN' }];
    classifyAccepted(findings, [accepted]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.enforced).toBe('UNKNOWN');
  });

  test('no accepted list leaves every finding untouched', () => {
    const findings = [directPushDrift()];
    classifyAccepted(findings, []);
    expect(findings[0]?.severity).toBe('drift');
  });

  test('entries without a field are ignored, not matched', () => {
    const findings = [directPushDrift()];
    classifyAccepted(findings, [{ field: '' }]);
    expect(findings).toHaveLength(1);
    expect(findings[0]?.severity).toBe('drift');
  });
});

describe('acceptedFields', () => {
  test('lists the field of every well-formed entry', () => {
    const gs = strategy({ accepted_divergences: [ACCEPTED_DIRECT_PUSH, { field: '' }] });
    expect(acceptedFields(gs)).toEqual(['main.direct_push_to_protected']);
  });

  test('an absent list is empty', () => {
    expect(acceptedFields(strategy())).toEqual([]);
  });
});

describe('buildRules: apply never bulldozes an accepted divergence', () => {
  test('accepted direct_push_to_protected carries the host pull_request rule forward verbatim', () => {
    const gs = strategy({ accepted_divergences: [ACCEPTED_DIRECT_PUSH] });
    const rules = buildRules(gs, false, [HOST_PR_RULE]);
    expect(rules.find(r => r.type === 'pull_request')).toBe(HOST_PR_RULE);
  });

  test('without the acceptance, `allowed` derives NO pull_request rule', () => {
    const rules = buildRules(strategy(), false, [HOST_PR_RULE]);
    expect(rules.some(r => r.type === 'pull_request')).toBe(false);
  });

  test('accepted with no host rule derives none either', () => {
    const gs = strategy({ accepted_divergences: [ACCEPTED_DIRECT_PUSH] });
    expect(buildRules(gs, false, []).some(r => r.type === 'pull_request')).toBe(false);
  });
});

/** Read by an account WITH admin rights: the key is present and populated. */
const PRIVILEGED = {
  id: 16809536,
  name: 'ProtectPublic',
  enforcement: 'active',
  updated_at: '2026-08-21T20:09:31.822-03:00',
  bypass_actors: [
    { actor_id: null, actor_type: 'OrganizationAdmin', bypass_mode: 'always' },
    { actor_id: 91127281, actor_type: 'User', bypass_mode: 'always' },
  ],
  current_user_can_bypass: 'always',
};

/** Read by an account WITHOUT admin rights: no `bypass_actors` key at all. */
const UNPRIVILEGED = {
  id: 16809536,
  name: 'ProtectPublic',
  enforcement: 'active',
  updated_at: '2026-08-21T20:09:31.822-03:00',
  current_user_can_bypass: 'never',
};

describe('assessBypass: the reader, not the ruleset', () => {
  test('an admin reading a populated bypass list gets a KNOWN answer', () => {
    const r = assessBypass(PRIVILEGED);
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(true);
    expect(r.actors).toHaveLength(2);
  });

  test('a non-admin gets UNKNOWN, never "no bypass actors"', () => {
    const r = assessBypass(UNPRIVILEGED);
    expect(r.known).toBe(false);
    if (r.known) { return; }
    expect(r.currentUserCanBypass).toBe('never');
    expect(r.reason).toContain('bypass_actors');
    expect(r.reason).toContain('current_user_can_bypass: never');
  });

  test('the discriminator is the SHAPE of the field, not its length', () => {
    // A privileged read of a ruleset with no bypass actors is a present, EMPTY
    // array. Treating that as "unknown" would hide a genuinely removed bypass.
    const empty = assessBypass({ ...PRIVILEGED, bypass_actors: [] });
    expect(empty.known).toBe(true);
    if (!empty.known) { return; }
    expect(empty.hasAdminBypass).toBe(false);
  });

  test('an explicit null bypass_actors is unknown, not empty', () => {
    expect(assessBypass({ ...UNPRIVILEGED, bypass_actors: null }).known).toBe(false);
  });

  test('an unreadable ruleset (403 / 404 / offline) is unknown, not empty', () => {
    const r = assessBypass(null);
    expect(r.known).toBe(false);
    if (r.known) { return; }
    expect(r.currentUserCanBypass).toBeNull();
    expect(r.reason).toContain('could not be read');
  });

  test('a repository-role bypass counts as admin bypass', () => {
    const r = assessBypass({ bypass_actors: [{ actor_type: 'RepositoryRole', bypass_mode: 'always' }] });
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(true);
  });

  test('a non-admin actor list does not masquerade as admin bypass', () => {
    const r = assessBypass({ bypass_actors: [{ actor_type: 'User', bypass_mode: 'pull_requests_only' }] });
    expect(r.known).toBe(true);
    if (!r.known) { return; }
    expect(r.hasAdminBypass).toBe(false);
  });
});

describe('module hygiene', () => {
  // Without the `import.meta.main` guard, importing the script runs `main()`
  // against bun test's argv, prints help and exits 0 before any assertion.
  test('importing git-policy.ts does not execute its CLI', () => {
    expect(typeof classifyAccepted).toBe('function');
  });
});
