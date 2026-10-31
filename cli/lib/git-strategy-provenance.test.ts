import { describe, expect, test } from 'bun:test';

import { removeYamlBlock, resetGitStrategyProvenance, resetYamlLeafValue } from './git-strategy-provenance.ts';

// The maintainer's shape: strategy VALUES plus provenance stamps and an
// accepted divergence naming THIS repo's ruleset, false in any other repo.
const FILLED = [
  'project:',
  '  project_name: null',
  '',
  'git_strategy:',
  '  strategy: solo-main # DEFAULT, not a decision',
  '  policy:',
  '    direct_push_to_protected: allowed',
  '    # Host divergences that are ACCEPTED, not drift.',
  '    accepted_divergences:',
  '      - field: main.direct_push_to_protected',
  '        reason: >',
  '          The ProtectPublic ruleset requires a PR.',
  '  meta:',
  '    policy_verified: 2026-08-21 # last verify',
  '    policy_source: accepted # verified | accepted | declared',
  '    strategy_source: chosen # inherited | chosen',
  '',
].join('\n');

describe('resetGitStrategyProvenance', () => {
  test('resets the three stamps, drops the divergences, keeps the values and the comments', () => {
    const { content, reset } = resetGitStrategyProvenance(FILLED);
    expect(content).toContain('strategy_source: inherited # inherited | chosen');
    expect(content).toContain('policy_source: declared # verified | accepted | declared');
    expect(content).toContain('policy_verified: null # last verify');
    expect(content).not.toContain('accepted_divergences');
    expect(content).not.toContain('ProtectPublic');
    expect(content).not.toContain('Host divergences');
    expect(content).toContain('strategy: solo-main');
    expect(content).toContain('direct_push_to_protected: allowed');
    expect(reset).toEqual(['strategy_source=inherited', 'policy_source=declared', 'policy_verified=null', 'accepted_divergences removed']);
  });

  test('a yaml without git_strategy comes back byte-identical', () => {
    const yaml = 'project:\n  project_name: null\n';
    expect(resetGitStrategyProvenance(yaml)).toEqual({ content: yaml, reset: [] });
  });

  test('the leaf and block helpers are no-ops on an absent key', () => {
    expect(resetYamlLeafValue('a: 1\n', 'b', '2')).toBeNull();
    expect(removeYamlBlock('a: 1\n', 'b')).toBe('a: 1\n');
  });

  test('a $ inside a preserved comment stays literal', () => {
    expect(resetYamlLeafValue('  policy_source: x # costs $1\n', 'policy_source', 'declared')).toBe('  policy_source: declared # costs $1\n');
  });
});
