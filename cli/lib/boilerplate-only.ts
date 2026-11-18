/**
 * @fileoverview The boilerplate's own files that never reach a project,
 * greenfield or adopted: the unit tests of `cli/`, `scripts/` and the skills,
 * their snapshots, and the test fixtures beside them. They verify THIS repo in
 * its CI; in a project the test runner picks them up and they fail against the
 * project's own files (measured: `bun test lib` matched `cli/lib/*.test.ts` and
 * an adopted app's suite went red on the boilerplate's self-checks).
 *
 * Read by the updater (never delivered: repoOnlyPatterns / repoOnlyPaths, the
 * self-update included; upstream's unedited copies a project still holds are
 * removed, `cleanupBoilerplateCopies`) and by `docs:check` (a project's page
 * citing one is not a dead reference there). Mirrored in TEMPLATE_EXCLUDES and
 * TEMPLATE_EXCLUDE_PATTERNS (packages/create-agentic-dev/src/prepare.ts); a test
 * holds the lists equal.
 */

export const BOILERPLATE_TEST_PATTERNS: RegExp[] = [
  /^(?:cli|scripts)\/.*\.test\.[cm]?[jt]s$/,
  /^(?:cli|scripts)\/(?:.*\/)?__snapshots__\//,
  /^\.agents\/skills\/[^/]+\/.*\.test\.[cm]?[jt]s$/,
];

export const BOILERPLATE_TEST_PATHS: string[] = [
  'scripts/ui-setup-fixture.ts',
  'scripts/ui-up-fixture.ts',
];

/** Whether a repo-relative path is one of them (exact path, a folder prefix, or a pattern). */
export function isBoilerplateOnlyPath(relPath: string): boolean {
  const p = relPath.replace(/\\/g, '/');
  return BOILERPLATE_TEST_PATHS.some(prefix => p === prefix || p.startsWith(`${prefix}/`))
    || BOILERPLATE_TEST_PATTERNS.some(re => re.test(p));
}
