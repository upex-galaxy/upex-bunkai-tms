/**
 * Personality re-injection: ONE emitter, three harness adapters.
 *
 * Why this exists: AGENTS.md §2 (Butler + PM Voice + Visual Mapping) and the
 * user-level OUTPUT STYLE are read ONCE at session start and then dilute as
 * the context window fills, while the caveman plugin re-injects itself on
 * every UserPromptSubmit. That asymmetry is mechanical, not editorial:
 * whichever layer is repeated most often wins. Re-emitting the contract on
 * every turn restores the balance for ~30 tokens.
 *
 * The contract text lives HERE and nowhere else. Each harness reaches it
 * through a thin adapter:
 *   - Claude Code: `.claude/settings.json` UserPromptSubmit runs this file.
 *   - Codex: `.codex/hooks.json` UserPromptSubmit runs this file from the Git root.
 *   - OpenCode: `.opencode/plugins/personality-reinject.js` imports
 *     PERSONALITY_CONTRACT and pushes it into the system prompt.
 * `bun run agents:compat:check` pins the three adapters to this emitter.
 *
 * Keep it to a SINGLE short line. It runs on every prompt.
 */

import { pathToFileURL } from 'node:url';

export const PERSONALITY_CONTRACT = [
  'OUTPUT CONTRACT (AGENTS.md §2 plus the active user-level output style):',
  'PM Voice headline = value, never a punch phrase.',
  'Render markdown: headings when 2+ sections, one bold anchor per block, backticks on every path/command/identifier, tables for comparisons, no wall of text.',
  'Butler bullets as `topic: fragment`.',
  'No em dash. Vary sentence length. No closing recap.',
].join(' ');

export function emitPersonalityContract(stream = process.stdout) {
  stream.write(PERSONALITY_CONTRACT);
}

const entrypoint = process.argv[1];
if (entrypoint && import.meta.url === pathToFileURL(entrypoint).href) {
  emitPersonalityContract();
}
