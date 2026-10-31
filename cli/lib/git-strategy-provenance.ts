/**
 * @fileoverview Reset the git-strategy PROVENANCE of a `.agents/project.yaml`
 * that was copied from the maintainer's filled file instead of seeded from
 * `.agents/project.schema.yaml`.
 *
 * The boilerplate ships its `git_strategy:` block with its own provenance
 * stamps: `meta.strategy_source: chosen`, `meta.policy_source: accepted`, a
 * `meta.policy_verified` date, and a `policy.accepted_divergences` list whose
 * entries name THIS repo's GitHub ruleset. All of them are false in any other
 * repository. The strategy itself and the policy VALUES are kept as a sane
 * shipped default; only the "someone decided and verified this" claims go.
 * With `strategy_source: inherited`, git-flow-master's bootstrap offer fires on
 * the project's first git action.
 *
 * FALLBACK ONLY: seeding from the schema (`seedFromSchema` in
 * `./agents-schema.ts`) replaces it whenever the template ships the schema.
 *
 * Pure string transforms, so the updater's adopt path (which runs from `cli/`
 * and may only import inside `cli/`) and its tests share one implementation.
 * Twin of `resetGitStrategyMeta` in `packages/create-agentic-dev/src/prepare.ts`
 * (published separately, it cannot import from the repo); the package's test
 * suite runs both over the same input and requires the same output.
 */

export interface ProvenanceReset {
  content: string
  /** What changed, one short label per field (`strategy_source=inherited`, ...). Empty = no-op. */
  reset: string[]
}

/** The reset described above; a yaml without a `git_strategy:` block comes back unchanged. */
export function resetGitStrategyProvenance(yaml: string): ProvenanceReset {
  if (!/^git_strategy:/m.test(yaml)) { return { content: yaml, reset: [] }; }

  let content = yaml;
  const reset: string[] = [];
  for (const [field, value] of [
    ['strategy_source', 'inherited'],
    ['policy_source', 'declared'],
    ['policy_verified', 'null'],
  ] as Array<[string, string]>) {
    const next = resetYamlLeafValue(content, field, value);
    if (next !== null) {
      content = next;
      reset.push(`${field}=${value}`);
    }
  }

  const withoutDivergences = removeYamlBlock(content, 'accepted_divergences');
  if (withoutDivergences !== content) {
    content = withoutDivergences;
    reset.push('accepted_divergences removed');
  }
  return { content, reset };
}

/**
 * Replace a scalar leaf's VALUE anywhere in the YAML (first occurrence),
 * preserving indentation and any trailing `#` comment. Returns null when the
 * field is absent.
 */
export function resetYamlLeafValue(content: string, field: string, value: string): string | null {
  const pattern = new RegExp(`^([ \\t]*${escapeReg(field)}:)[^#\\n]*(#.*)?$`, 'm');
  if (!pattern.test(content)) { return null; }
  // Function replacer: a `$` inside the preserved comment must stay literal.
  return content.replace(pattern, (_m, head: string, comment?: string) =>
    `${head} ${value}${comment ? ` ${comment}` : ''}`);
}

/**
 * Remove a mapping key, its indented body, and the contiguous same-indent
 * comment header immediately above it. Returns the content unchanged when the
 * key is absent.
 */
export function removeYamlBlock(content: string, field: string): string {
  const lines = content.split('\n');
  const keyRe = new RegExp(`^[ \\t]*${escapeReg(field)}:`);
  const keyIdx = lines.findIndex(l => keyRe.test(l));
  if (keyIdx === -1) { return content; }
  const indent = lines[keyIdx].match(/^[ \t]*/)![0];

  // Contiguous comment header at the same indent (documents the removed key).
  let start = keyIdx;
  while (start - 1 >= 0 && lines[start - 1].startsWith(`${indent}#`)) { start -= 1; }

  // Body: every line more indented than the key (blank lines tolerated).
  let end = keyIdx;
  for (let i = keyIdx + 1; i < lines.length; i += 1) {
    const line = lines[i];
    if (line.trim() === '') { continue; }
    const leading = line.match(/^[ \t]*/)![0];
    if (leading.length > indent.length) { end = i; continue; }
    break;
  }

  return [...lines.slice(0, start), ...lines.slice(end + 1)].join('\n');
}

function escapeReg(s: string): string {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&');
}
