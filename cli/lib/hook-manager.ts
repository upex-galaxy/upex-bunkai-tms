/**
 * @fileoverview Which git-hook manager a repo already runs, and how the
 * framework gates reach it without replacing it.
 *
 * The boilerplate's hooks are husky v9: `prepare` runs `husky`, which points
 * `core.hooksPath` at `.husky/_`. On an app that already runs lefthook,
 * simple-git-hooks, husky v4, the `pre-commit` framework or its own
 * `core.hooksPath`, that one command silently switches every one of the app's
 * hooks off: git stops reading `.git/hooks` (or the app's directory) at all.
 * So on an adopted app with a FOREIGN manager the tooling never installs husky;
 * the gates live in the synced `.husky/framework-gates.sh` and the app's own
 * manager calls them, through the snippet `hookWiringSnippet` returns.
 *
 * Node built-ins only: `scripts/provision-worktree.ts` and `cli/doctor.ts`
 * read it before (or without) `bun install`.
 */

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

export type HookManager = 'husky' | 'husky-v4' | 'lefthook' | 'simple-git-hooks' | 'pre-commit' | 'hooks-path' | 'none';

export interface HookManagerDetection {
  manager: HookManager
  /** What proved it: a file, a package.json key, a git config value. */
  evidence: string
  /** The file (or directory, for `hooks-path`) the wiring goes into; null for husky / none. */
  configPath: string | null
  /** true when installing husky would switch the app's own hooks off. */
  foreign: boolean
}

/** The synced file every manager sources; its functions are the gates. */
export const FRAMEWORK_GATES_FILE = '.husky/framework-gates.sh';

const LEFTHOOK_FILES = ['lefthook.yml', 'lefthook.yaml', 'lefthook.json', 'lefthook.toml', '.lefthook.yml', '.lefthook.yaml', '.lefthook.json', '.lefthook.toml'];
const SIMPLE_GIT_HOOKS_FILES = ['.simple-git-hooks.json', '.simple-git-hooks.cjs', '.simple-git-hooks.js', '.simple-git-hooks.mjs', 'simple-git-hooks.json', 'simple-git-hooks.cjs', 'simple-git-hooks.js', 'simple-git-hooks.mjs'];
const HUSKY_V4_FILES = ['.huskyrc', '.huskyrc.json', '.huskyrc.js', '.huskyrc.cjs', 'husky.config.js', 'husky.config.cjs'];
const PRE_COMMIT_FILE = '.pre-commit-config.yaml';

/** The `core.hooksPath` values husky v9 itself writes. */
const HUSKY_HOOKS_PATHS = new Set(['.husky/_', '.husky']);

function readPackageJson(root: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as unknown;
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  }
  catch { return null; }
}

/**
 * The repo's OWN `core.hooksPath` (`--local`): a global value belongs to the
 * developer's machine, and the local one husky writes overrides it anyway.
 */
function gitHooksPath(root: string): string | null {
  try {
    const out = execFileSync('git', ['-C', root, 'config', '--local', '--get', 'core.hooksPath'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return out === '' ? null : out;
  }
  catch { return null; }
}

function foreign(manager: HookManager, evidence: string, configPath: string): HookManagerDetection {
  return { manager, evidence, configPath, foreign: true };
}

/**
 * Detect the repo's hook manager. A foreign manager wins over a `.husky/`
 * directory, because the boilerplate's own sync delivers `.husky/` to every
 * repo it touches: its presence alone proves nothing about who runs the hooks.
 * `hooksPath` is injectable for tests; by default it is read from git.
 */
export function detectHookManager(root: string, hooksPath: string | null = gitHooksPath(root)): HookManagerDetection {
  const lefthook = LEFTHOOK_FILES.find(f => existsSync(join(root, f)));
  if (lefthook) { return foreign('lefthook', lefthook, lefthook); }

  const pkg = readPackageJson(root);
  if (pkg !== null && 'simple-git-hooks' in pkg) { return foreign('simple-git-hooks', 'package.json "simple-git-hooks"', 'package.json'); }
  const sgh = SIMPLE_GIT_HOOKS_FILES.find(f => existsSync(join(root, f)));
  if (sgh) { return foreign('simple-git-hooks', sgh, sgh); }

  if (existsSync(join(root, PRE_COMMIT_FILE))) { return foreign('pre-commit', PRE_COMMIT_FILE, PRE_COMMIT_FILE); }

  const huskyKey = pkg?.husky;
  if (huskyKey !== null && typeof huskyKey === 'object' && 'hooks' in huskyKey) {
    return foreign('husky-v4', 'package.json "husky.hooks"', 'package.json');
  }
  const huskyrc = HUSKY_V4_FILES.find(f => existsSync(join(root, f)));
  if (huskyrc) { return foreign('husky-v4', huskyrc, huskyrc); }

  if (hooksPath !== null && !HUSKY_HOOKS_PATHS.has(hooksPath.replace(/\/+$/, ''))) {
    return foreign('hooks-path', `git config core.hooksPath = ${hooksPath}`, hooksPath);
  }

  if (existsSync(join(root, '.husky'))) {
    return { manager: 'husky', evidence: '.husky/', configPath: null, foreign: false };
  }
  return { manager: 'none', evidence: 'no hook manager found', configPath: null, foreign: false };
}

/** True when `text` names the gates file outside a comment line. */
function referencesGates(text: string): boolean {
  return text.split('\n').some((line) => {
    const t = line.trimStart();
    return !t.startsWith('#') && !t.startsWith('//') && t.includes('framework-gates.sh');
  });
}

/**
 * True when the foreign manager's config already calls the gates file. For
 * `hooks-path` every file in that directory is read. Always true for husky /
 * none: the husky hooks carry their own parity row (`frameworkGatesNote`).
 */
export function gatesWired(root: string, detection: HookManagerDetection): boolean {
  if (!detection.foreign || detection.configPath === null) { return true; }
  const target = join(root, detection.configPath);
  try {
    if (statSync(target).isDirectory()) {
      return readdirSync(target).some(name => referencesGates(readFileSync(join(target, name), 'utf8')));
    }
    return referencesGates(readFileSync(target, 'utf8'));
  }
  catch { return false; }
}

/** `sh -c` call of one gates function; the commit-msg one forwards git's message-file argument. */
function call(fn: string, msgArg: string | null): string {
  return msgArg === null
    ? `sh -c '. ${FRAMEWORK_GATES_FILE} && ${fn}'`
    : `sh -c '. ${FRAMEWORK_GATES_FILE} && ${fn} "$1"' sh ${msgArg}`;
}

/**
 * The lines to add to the app's OWN hook manager so it runs the framework
 * gates. Null for husky (its hooks get `frameworkGatesNote`) and none (husky
 * is installed normally). Every snippet calls the same three functions the
 * husky hooks call, so a gate added upstream reaches this repo with the synced
 * gates file, whatever runs the hooks.
 */
export function hookWiringSnippet(detection: HookManagerDetection): string | null {
  const preCommit = 'framework_gates_pre_commit';
  const prePush = 'framework_gates_pre_push';
  const commitMsg = 'framework_gates_commit_msg';
  switch (detection.manager) {
    case 'lefthook':
      return [
        `# ${detection.configPath}: add a framework-gates command under each hook (merge into an existing hook's commands:)`,
        'pre-commit:',
        '  commands:',
        '    framework-gates:',
        `      run: ${call(preCommit, null)}`,
        'pre-push:',
        '  commands:',
        '    framework-gates:',
        `      run: ${call(prePush, null)}`,
        'commit-msg:',
        '  commands:',
        '    framework-gates:',
        `      run: ${call(commitMsg, '{1}')}`,
        '# then: bunx lefthook install',
      ].join('\n');
    case 'simple-git-hooks':
    case 'husky-v4': {
      const key = detection.manager === 'husky-v4' ? '"husky": { "hooks": {' : '"simple-git-hooks": {';
      const close = detection.manager === 'husky-v4' ? '} }' : '}';
      const msg = detection.manager === 'husky-v4' ? '$HUSKY_GIT_PARAMS' : '"$1"';
      return [
        `// ${detection.configPath}: append each command to the hook the app already runs ("<app> && <gates>")`,
        key,
        `  "pre-commit": ${JSON.stringify(call(preCommit, null))},`,
        `  "pre-push": ${JSON.stringify(call(prePush, null))},`,
        `  "commit-msg": ${JSON.stringify(call(commitMsg, msg))}`,
        close,
        detection.manager === 'simple-git-hooks' ? '// then: bunx simple-git-hooks' : '// husky v4 re-reads the config on the next commit',
      ].join('\n');
    }
    case 'pre-commit':
      return [
        `# ${PRE_COMMIT_FILE}: add a local repo with the three gates`,
        '- repo: local',
        '  hooks:',
        // The commit-msg entry takes the message file pre-commit appends as `$1`.
        ...([['pre-commit', call(preCommit, null), false], ['pre-push', call(prePush, null), false], ['commit-msg', call(commitMsg, ''), true]] as const).flatMap(([stage, entry, passFile]) => [
          `    - id: framework-gates-${stage}`,
          `      name: framework gates (${stage})`,
          `      entry: ${entry.trimEnd()}`,
          '      language: system',
          `      pass_filenames: ${passFile}`,
          '      always_run: true',
          `      stages: [${stage}]`,
        ]),
        '# then: pre-commit install --hook-type pre-commit --hook-type pre-push --hook-type commit-msg',
      ].join('\n');
    case 'hooks-path':
      return [
        `# ${detection.configPath}/<hook>: add one line to each hook script the app keeps there`,
        `# pre-commit: . "$(git rev-parse --show-toplevel)/${FRAMEWORK_GATES_FILE}" && ${preCommit}`,
        `# pre-push:   . "$(git rev-parse --show-toplevel)/${FRAMEWORK_GATES_FILE}" && ${prePush}`,
        `# commit-msg: . "$(git rev-parse --show-toplevel)/${FRAMEWORK_GATES_FILE}" && ${commitMsg} "$1"`,
      ].join('\n');
    default:
      return null;
  }
}

/**
 * `prepare` without its `husky` step, for an app whose hooks belong to a
 * foreign manager: running `husky` there rewrites `core.hooksPath` and switches
 * the app's hooks off. Null when nothing is left to run.
 */
export function withoutHuskyStep(command: string): string | null {
  const steps = command.split('&&').map(s => s.trim()).filter(s => s !== '' && !/^(?:bunx\s+|npx\s+)?husky(?:\s+install)?$/.test(s));
  return steps.length === 0 ? null : steps.join(' && ');
}
