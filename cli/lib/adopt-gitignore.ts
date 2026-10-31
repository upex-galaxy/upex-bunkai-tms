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
 *  - `reincludeAgenticStore`: on `--adopt`, BEFORE the migration, a store the
 *    app's rules hide is re-included by an appended, commented block (never an
 *    edit of the app's own lines). Re-checked after the write.
 *  - `hiddenPaths`: a fail-closed probe the migration and the adopt hook use to
 *    name what git would still ignore.
 *
 * Node built-ins only (`cli/**` import closure).
 */

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** Paths that stand for the agentic store: a real file and one inside a skill. */
export const AGENTIC_STORE_PROBES = ['.agents/project.yaml', '.agents/skills/project-adoption/SKILL.md'] as const;

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
  /** The rules that hid the store before this call (empty: nothing to do). */
  hidden: HiddenPath[]
  /** Lines appended to `.gitignore` (empty on --dry-run or when nothing was hidden). */
  added: string[]
  /** Probes git still ignores after the write: the store could not be re-included safely. */
  stillHidden: HiddenPath[]
}

/**
 * On an adopting app whose `.gitignore` hides `.agents/`, append a block that
 * re-includes it. The app's own lines stay byte-identical; the block names the
 * rule it answers. `!/.agents/` re-includes the folder (enough for `.agents`
 * or `.agents/`); `!/.agents/**` is added only when a rule hides the children
 * (`.agents/*`, `.agents/**`). The tooling's own ignores inside the store
 * (`/.agents/prompts/`) land after this block on the same run, so they win.
 */
export function reincludeAgenticStore(root: string, dryRun = false): ReincludeOutcome {
  const hidden = hiddenPaths(root, AGENTIC_STORE_PROBES);
  if (hidden.length === 0) { return { hidden, added: [], stillHidden: [] }; }
  const gitignore = join(root, '.gitignore');
  const existing = existsSync(gitignore) ? readFileSync(gitignore, 'utf8') : '';
  if (existing.includes(REINCLUDE_BLOCK_HEADER)) {
    return { hidden, added: [], stillHidden: hidden };
  }
  const rules = [...new Set(hidden.map(h => `${h.pattern} (${h.source})`))];
  const childRule = hidden.some(h => /^\/?\.agents\/\*/.test(h.pattern));
  const added = ['!/.agents/', ...(childRule ? ['!/.agents/**'] : [])];
  if (dryRun) { return { hidden, added, stillHidden: [] }; }

  const block = [
    '',
    REINCLUDE_BLOCK_HEADER,
    `# The agentic layer is versioned: it re-includes what ${rules.join(', ')} hid.`,
    ...added,
  ];
  writeFileSync(gitignore, `${existing.replace(/\n*$/, '')}\n${block.join('\n')}\n`);
  return { hidden, added, stillHidden: hiddenPaths(root, AGENTIC_STORE_PROBES) };
}
