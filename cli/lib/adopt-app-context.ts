/**
 * @fileoverview Where an adopted app's own instruction text lands: a
 * project-local `<app>-context` skill, never the always-on `AGENTS.md`.
 *
 * Before progressive disclosure, `--adopt` appended the app's `AGENTS.md` /
 * `CLAUDE.md` verbatim inside a `## 0.` block of the boilerplate's file, so
 * every session paid for both (the dogfood app composed past the Codex cap).
 * Now the text moves, verbatim, to `.agents/skills/<app>-context/references/
 * app-instructions.md`; the skill's description routes by the app's domain;
 * `AGENTS.md` gains ONE router row pointing at it; and the project overlay
 * (`.agents/instructions/agent-project.md`) gains a short pointer. The `-context`
 * suffix makes the folder project-local (`isProjectLocalSkillPath`), so no
 * later `bun sync` writes or deletes it.
 *
 * Nothing of the app's text is rewritten: `appInstructionsCoverage` proves
 * every source is contained byte for byte, and its headings with it.
 */

import type { AdoptInstructionSource } from './updater-adopt.ts';
import * as fs from 'node:fs';
import * as path from 'node:path';

export const APP_CONTEXT_SUFFIX = '-context';
/** The preserved text, relative to the skill folder. */
export const APP_INSTRUCTIONS_REFERENCE = 'references/app-instructions.md';
/** The heading `withAppContextPointer` adds to `agent-project.md`. */
export const APP_CONTEXT_POINTER_HEADING = '## This application\'s own instructions';
const ROUTER_END = '<!-- router:end -->';
/** Agent Skills spec: the description field caps at 1024 characters. */
const DESCRIPTION_MAX = 1024;

export interface AppContextSkill {
  slug: string
  /** Repo-relative skill folder (`.agents/skills/<slug>`). */
  dir: string
  skillMd: string
  reference: string
}

function readOrNull(file: string): string | null {
  try { return fs.readFileSync(file, 'utf8'); }
  catch { return null; }
}

/** `@scope/My App` -> `my-app`; empty when nothing usable remains. */
export function kebab(value: string): string {
  return value
    .replace(/^@[^/]+\//, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * `package.json` names a scaffolder leaves behind (`my-v0-project`, `my-app`,
 * `nextjs-app`...): they name the generator, not the app, so the folder name
 * wins over them. Measured on the adoption dogfood, whose app still carries
 * the v0 default.
 */
const SCAFFOLD_DEFAULT_NAME = /^(?:my-)?(?:v0-|next-|nextjs-|react-)?(?:app|project)$|^(?:next|nextjs|create-next-app)$/;

export interface AppIdentity {
  /** Display name: the `package.json` name without its scope, else (absent or a scaffold default) the folder name. */
  name: string
  description: string | null
}

/** The app's name and one-line description, read from its own `package.json`. */
export function appIdentity(root: string): AppIdentity {
  let pkg: { name?: unknown, description?: unknown } = {};
  try { pkg = JSON.parse(readOrNull(path.join(root, 'package.json')) ?? '{}') as typeof pkg; }
  catch { /* an unparsable package.json names nothing */ }
  const own = typeof pkg.name === 'string' ? pkg.name.trim().replace(/^@[^/]+\//, '') : '';
  const raw = own !== '' && !SCAFFOLD_DEFAULT_NAME.test(own.toLowerCase()) ? own : path.basename(path.resolve(root));
  const description = typeof pkg.description === 'string' && pkg.description.trim() !== '' ? pkg.description.trim() : null;
  return { name: raw, description };
}

/**
 * `<app>-context`, kebab-cased, never a slug upstream ships (a skill folder in
 * `upstreamDir` would be a framework skill, not this app's): `-app` is added
 * until it is free of upstream.
 */
export function appContextSlug(appName: string, upstreamDir: string | null): string {
  const base = kebab(appName).replace(/-context$/, '') || 'app';
  const upstreamShips = (slug: string): boolean => upstreamDir !== null && fs.existsSync(path.join(upstreamDir, '.agents', 'skills', slug));
  let stem = base;
  while (upstreamShips(`${stem}${APP_CONTEXT_SUFFIX}`)) { stem = `${stem}-app`; }
  return `${stem}${APP_CONTEXT_SUFFIX}`;
}

/** `##` headings of the sources, outside fenced code, as plain words. */
export function sourceTopics(sources: readonly AdoptInstructionSource[]): string[] {
  const topics: string[] = [];
  for (const source of sources) {
    let fenced = false;
    for (const line of source.text.split(/\r?\n/)) {
      if (/^\s*(?:```|~~~)/.test(line)) { fenced = !fenced; continue; }
      const m = fenced ? null : /^## (.+)$/.exec(line);
      if (!m) { continue; }
      const topic = m[1].replace(/#+$/, '').replace(/[`*_[\]]/g, '').replace(/^\d+(?:\.\d+)*[.)]?\s+/, '').trim();
      if (topic !== '' && !topics.includes(topic)) { topics.push(topic); }
    }
  }
  return topics;
}

/**
 * The skill description: what the app is, when to load it, and the app's own
 * section titles as the domain vocabulary that routes a task here. Titles are
 * dropped from the end until it fits the spec's 1024 characters.
 */
export function appContextDescription(app: AppIdentity, sources: readonly AdoptInstructionSource[]): string {
  const files = sources.map(s => s.file).join(' and ');
  const what = app.description ? ` (${app.description.replace(/\s+/g, ' ').replace(/\.$/, '')})` : '';
  const head = `${app.name}'s own instructions${what}, carried over verbatim from the ${files} it had before the agentic layer was adopted: the app team's conventions, guardrails and domain vocabulary.`;
  const tail = ` Load it before working on ${app.name}'s code, data, domain or conventions, even when nobody names the app. Pure knowledge: NOT the boilerplate's doctrine (that is .agents/instructions/) and NOT a workflow.`;
  const topics = sourceTopics(sources);
  for (let n = topics.length; n >= 0; n -= 1) {
    const covers = n > 0 ? ` Covers: ${topics.slice(0, n).join('; ')}.` : '';
    const text = `${head}${covers}${tail}`;
    if (text.length <= DESCRIPTION_MAX) { return text; }
  }
  return `${head}${tail}`.slice(0, DESCRIPTION_MAX);
}

/** The preserved text: each source verbatim (trailing whitespace aside) under the file it came from. */
export function appInstructionsReference(app: AppIdentity, sources: readonly AdoptInstructionSource[], archiveRel: string | null): string {
  const out = [
    `# ${app.name}: instructions carried over at adoption`,
    '',
    `> Preserved verbatim by \`bun sync --adopt\` from the instruction file(s) ${app.name} carried before adoption${archiveRel ? ` (originals archived in \`${archiveRel}/\`)` : ''}. This is the app team's own text: edit it as a rule change of theirs, never to summarize or reorder it. Where it disagrees with the boilerplate's doctrine, \`.agents/instructions/agent-project.md\` says which rule wins.`,
    '',
  ];
  for (const source of sources) {
    out.push(`## From \`${source.file}\``, '', source.text.replace(/\s+$/, ''), '');
  }
  return out.join('\n');
}

export function appContextSkillMd(slug: string, app: AppIdentity, sources: readonly AdoptInstructionSource[]): string {
  return [
    '---',
    `name: ${slug}`,
    `description: ${JSON.stringify(appContextDescription(app, sources))}`,
    'compatibility: [claude-code, codex, opencode]',
    'metadata:',
    '  kind: context',
    '---',
    '',
    `# ${slug}`,
    '',
    `The instructions ${app.name} carried in its own ${sources.map(s => `\`${s.file}\``).join(' and ')} before the agentic layer was adopted, kept word for word in \`${APP_INSTRUCTIONS_REFERENCE}\`. \`AGENTS.md\` routes here through one row of its router; the text itself never loads at session start.`,
    '',
    '## Rules',
    '',
    `- Read \`${APP_INSTRUCTIONS_REFERENCE}\` whole before acting on a task in ${app.name}'s code or domain: it is the app team's rulebook, and nothing of it was summarized.`,
    '- Never rewrite, summarize or reorder the preserved text. A change to it is the team\'s own rule change, made like any edit to a project file.',
    '- Where the app\'s text and the boilerplate doctrine disagree, `.agents/instructions/agent-project.md` records which one wins; a Critical Rule in `AGENTS.md` always holds.',
    '- This folder is project-local (its slug ends in `-context`): `bun sync` never writes or deletes it.',
    '',
  ].join('\n');
}

export function buildAppContextSkill(slug: string, app: AppIdentity, sources: readonly AdoptInstructionSource[], archiveRel: string | null): AppContextSkill {
  return {
    slug,
    dir: `.agents/skills/${slug}`,
    skillMd: appContextSkillMd(slug, app, sources),
    reference: appInstructionsReference(app, sources, archiveRel),
  };
}

/** The one L0 router row that reaches the skill. */
export function appContextRouterRow(slug: string, appName: string): string {
  return `| ${appName}'s own code, domain and conventions (the rules it carried before adoption) | \`.agents/skills/${slug}/SKILL.md\` | \`.agents/skills/${slug}/${APP_INSTRUCTIONS_REFERENCE}\` |`;
}

/**
 * Upstream's router lock line (`scripts/lib/instructions.ts` `ROUTER_LOCK`,
 * ADR-0014), repeated here because `cli/` is import-closed. It fingerprints
 * upstream's table and names an ADR that never travels to an adopted app.
 */
const ROUTER_LOCK_LINE = /^<!-- router:lock [0-9a-f]{12} ADR-\d{4} -->$/;

/**
 * Upstream `AGENTS.md` with the router row added as the table's last row and
 * upstream's router lock dropped: the added row changes the table the lock
 * fingerprints, and an app that never locked its own router has opted out of
 * the lock (`instructions:check`). An upstream without the router (pre-split)
 * gets nothing: it has no table, and the skill stays reachable through its
 * description.
 */
export function composeAdoptedL0(upstreamAgents: string, slug: string, appName: string): string {
  const lines = upstreamAgents.split('\n');
  const end = lines.findIndex(l => l.trim() === ROUTER_END);
  if (end === -1) { return upstreamAgents; }
  const row = appContextRouterRow(slug, appName);
  if (lines.includes(row)) { return upstreamAgents; }
  return [...lines.slice(0, end), row, ...lines.slice(end).filter(l => !ROUTER_LOCK_LINE.test(l.trim()))].join('\n');
}

/** `agent-project.md` with the pointer section appended once (idempotent). */
export function withAppContextPointer(projectMd: string, slug: string, appName: string): string {
  if (projectMd.includes(APP_CONTEXT_POINTER_HEADING)) { return projectMd; }
  const body = [
    APP_CONTEXT_POINTER_HEADING,
    '',
    `The rules ${appName} carried in its own \`AGENTS.md\` / \`CLAUDE.md\` before adoption live, verbatim, in the project-local skill \`${slug}\` (\`.agents/skills/${slug}/${APP_INSTRUCTIONS_REFERENCE}\`), which one row of the \`AGENTS.md\` router reaches. Where one of them disagrees with a shared section, name both here and say which one wins.`,
    '',
  ].join('\n');
  return `${projectMd.replace(/\s+$/, '')}\n\n${body}`;
}

export interface CoverageReport {
  /** Sources whose text is not contained verbatim. */
  missingSources: string[]
  /** Headings of the sources absent from the reference. */
  missingHeadings: string[]
  sourceBytes: number
  referenceBytes: number
}

/** Proof that nothing of the app's text was lost: each source verbatim, every heading present. */
export function appInstructionsCoverage(sources: readonly AdoptInstructionSource[], reference: string): CoverageReport {
  const missingSources = sources.filter(s => !reference.includes(s.text.replace(/\s+$/, ''))).map(s => s.file);
  const refLines = new Set(reference.split(/\r?\n/).map(l => l.trimEnd()));
  const missingHeadings = sources.flatMap(s => s.text.split(/\r?\n/).filter(l => /^#{1,6}\s/.test(l)).map(l => l.trimEnd()).filter(h => !refLines.has(h)));
  return {
    missingSources,
    missingHeadings,
    sourceBytes: sources.reduce((n, s) => n + Buffer.byteLength(s.text, 'utf8'), 0),
    referenceBytes: Buffer.byteLength(reference, 'utf8'),
  };
}
