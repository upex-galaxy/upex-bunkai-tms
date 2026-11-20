/**
 * An adopting app's own ignore rules versus the agentic layer.
 *
 * Measured on a real app (U18-12): its `.gitignore` held `.agents` because the
 * skills had been copied in by hand and kept local. The adoption delivered the
 * whole agentic store into that ignored folder, and the cross-harness migration
 * moved the app's tracked `.claude/skills/*` there too: committing the
 * adoption would have deleted every skill from git and versioned nothing.
 *
 * Two answers, both here:
 *  - `reincludeAgenticStore`: on `--adopt`, BEFORE the migration, the delivered
 *    paths the app's rules hide are re-included one by one in an appended,
 *    commented block (never an edit of the app's own lines). Re-checked after
 *    the write.
 *  - `hiddenPaths`: a fail-closed probe the migration and the adopt hook use to
 *    name what git would still ignore.
 *
 * Node built-ins only (`cli/**` import closure).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export interface ReincludeProbe {
  probe: string
  path: string
  dir: boolean
}

const file = (path: string): ReincludeProbe => ({ probe: path, path, dir: false });

export const REINCLUDE_PROBES: readonly ReincludeProbe[] = [
  file('.agents/project.yaml'),
  { probe: '.agents/skills/project-adoption/SKILL.md', path: '.agents/skills', dir: true },
  { probe: '.agents/instructions/agent-project.md', path: '.agents/instructions', dir: true },
  { probe: '.agents/hooks/personality-reinject.mjs', path: '.agents/hooks', dir: true },
  ...['README.md', 'project.schema.yaml', 'jira-fields.json', 'jira-link-types.json', 'jira-required.yaml', 'jira-workflows.json'].map(name => file(`.agents/${name}`)),
  file('.agents/personality-override.md'),
  file('.env.schema'),
  file('.env.core.schema'),
];

/** Header of the block `reincludeAgenticStore` appends; its presence makes the call idempotent. */
export const REINCLUDE_BLOCK_HEADER = '# ===== Adopted app: agentic paths its own rules hid =====';

export interface HiddenPath {
  path: string
  /** `.gitignore:38` style source of the rule that hides it. */
  source: string
  pattern: string
}

/**
 * Which of `paths` git ignores, with the rule that does it. Paths need not
 * exist (`--no-index`: tracked or not, the rules decide). Outside a git repo,
 * or with git missing, nothing is reported as hidden.
 */
export function hiddenPaths(root: string, paths: readonly string[]): HiddenPath[] {
  if (paths.length === 0) { return []; }
  const res = spawnSync('git', ['-C', root, 'check-ignore', '-v', '--no-index', '--stdin'], { input: `${paths.join('\n')}\n`, encoding: 'utf8' });
  if (res.status !== 0 && res.status !== 1) { return []; }
  const out: HiddenPath[] = [];
  for (const line of (res.stdout ?? '').split('\n')) {
    const tab = line.indexOf('\t');
    if (tab < 0) { continue; }
    const meta = line.slice(0, tab);
    const file = line.slice(tab + 1);
    // `<source>:<line>:<pattern>`; the pattern itself may contain ':'.
    const m = /^(.*?):(\d+):(.*)$/.exec(meta);
    if (!m) { continue; }
    // A negated rule reports a path that ends up NOT ignored.
    if (m[3].startsWith('!')) { continue; }
    out.push({ path: file, source: `${m[1]}:${m[2]}`, pattern: m[3] });
  }
  return out;
}

export interface ReincludeOutcome {
  /** The rules that hid a probe before this call (empty: nothing to do). */
  hidden: HiddenPath[]
  /** Lines added to `.gitignore` (on --dry-run: the lines a real run would add). */
  added: string[]
  /** Probes git still ignores after the write (on --dry-run: that the planned lines would not cover). */
  stillHidden: HiddenPath[]
}

const FOLDER_RULE = /^\/?\.agents\/?$/;

export function reincludeLines(hidden: readonly HiddenPath[]): string[] {
  const lines: string[] = [];
  for (const h of hidden) {
    const probe = REINCLUDE_PROBES.find(p => p.probe === h.path);
    if (!probe) { continue; }
    if (FOLDER_RULE.test(h.pattern)) { lines.push('!/.agents/'); }
    else if (probe.dir) { lines.push(`!/${probe.path}/`, ...(h.pattern.includes('**') ? [`!/${probe.path}/**`] : [])); }
    else { lines.push(`!/${probe.path}`); }
  }
  return [...new Set(lines)];
}

export function reincludeCovers(line: string, path: string): boolean {
  const target = line.replace(/^!\//, '').replace(/\*\*$/, '');
  return target.endsWith('/') ? path.startsWith(target) : path === target;
}

/**
 * On an adopting app whose `.gitignore` hides what the adoption delivers into
 * the store (or the `.env*.schema` files), add lines that re-include exactly
 * those paths. The app's own lines stay byte-identical, and the app's other
 * ignored folders under `.agents/` stay ignored. A block from an earlier
 * adoption gets only its missing lines, inside the block, so the tooling's own
 * ignores after it (`/.agents/prompts/`) still win.
 */
export function reincludeAgenticStore(root: string, dryRun = false): ReincludeOutcome {
  const probes = REINCLUDE_PROBES.map(p => p.probe);
  const hidden = hiddenPaths(root, probes);
  if (hidden.length === 0) { return { hidden, added: [], stillHidden: [] }; }
  const gitignore = join(root, '.gitignore');
  const existing = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  const lines = existing.split('\n');
  const header = lines.indexOf(REINCLUDE_BLOCK_HEADER);
  const added = reincludeLines(hidden).filter(line => header < 0 || !lines.includes(line));
  if (added.length === 0) { return { hidden, added, stillHidden: hidden }; }
  if (dryRun) { return { hidden, added, stillHidden: hidden.filter(h => !added.some(line => reincludeCovers(line, h.path))) }; }

  if (header < 0) {
    const rules = [...new Set(hidden.map(h => `${h.pattern} (${h.source})`))];
    const block = ['', REINCLUDE_BLOCK_HEADER, `# The agentic layer is versioned: it re-includes what ${rules.join(', ')} hid.`, ...added];
    writeFileSync(gitignore, `${existing.replace(/\n*$/, '')}\n${block.join('\n')}\n`);
  }
  else {
    let end = header + 1;
    while (end < lines.length && /^[#!]/.test(lines[end])) { end++; }
    lines.splice(end, 0, ...added);
    writeFileSync(gitignore, lines.join('\n'));
  }
  return { hidden, added, stillHidden: hiddenPaths(root, probes) };
}

// An ignore rule never drops a file git already tracks, but `check-ignore --no-index` reports it.
export function hiddenUntracked(root: string, paths: readonly string[]): HiddenPath[] {
  const hidden = hiddenPaths(root, paths);
  if (hidden.length === 0) { return hidden; }
  const res = spawnSync('git', ['-C', root, 'ls-files', '-z', '--', ...hidden.map(h => h.path)], { encoding: 'utf8' });
  const tracked = new Set((res.stdout ?? '').split('\0').filter(Boolean));
  return hidden.filter(h => !tracked.has(h.path));
}
