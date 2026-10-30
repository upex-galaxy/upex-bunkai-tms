/**
 * @fileoverview SYNCED BASE — `bun sync` overwrites this file. Do not edit it
 * here; the project's own `eslint.config.js` spreads these exports and
 * overrides whatever it needs.
 *
 * A flat ESLint config is an executable module, so it has no merge-able shape:
 * upstream cannot deliver "the new rule" into a project-owned file the way a
 * structured format would allow. Splitting the values out and letting the
 * project spread them is the idiom that makes a rule reach a downstream repo at
 * all.
 *
 * `CLI_IMPORT_CLOSURE` is the reason this file is not optional: it enforces an
 * invariant of the UPDATER, not a project style preference. While it lived only
 * in the project-owned `eslint.config.js` (watched, never overwritten), a
 * project scaffolded before the block existed ran `bun sync` with no rule
 * guarding the import closure its self-update depends on.
 *
 * Every scoped block exported here (a SCREAMING_SNAKE `export const` other than
 * `BASE_ESLINT_OPTIONS`) must be wired into `eslint.config.js`:
 * `bun run agents:compat:check` fails, group `lint`, on one that is not.
 */

/**
 * Options handed to `antfu()`. Spread it, then override: the project's config
 * owns the final shape, and `ignores` / `rules` are the two a project realistically
 * extends (spread the base array/object first, or you drop what upstream added).
 */
export const BASE_ESLINT_OPTIONS = {
  // TypeScript configuration
  typescript: {
    tsconfigPath: 'tsconfig.json',
  },

  // Less opinionated mode for easier adoption
  lessOpinionated: true,

  // Ignore patterns
  ignores: [
    'node_modules',
    'dist',
    'test-results',
    'playwright-report',
    'allure-results',
    'allure-report',
    'reports',
    'cli/legacy/**',
    '*.min.js',
    // Documentation files (contain code examples that shouldn't be linted)
    '**/*.md',
    // GitHub workflows (YAML files)
    '.github/**',
    // Generated files (auto-generated, not manually edited)
    'api/openapi-types.ts',
    // Supabase Database types written by `supabase gen types typescript`
    // (project-bootstrap). Large machine-generated snake_case file — linting it
    // produces noise and `eslint --fix` would diverge it from the generator.
    'src/types/supabase.ts',
    // Git worktrees placed under .claude/worktrees/ are another branch's full
    // checkout — never lint another tree from this one.
    '.claude/worktrees/**',
    // Skill directories — never lint.
    // T1 skills (.claude/skills/) and community T3/T4 skills (.agents/skills/,
    // installed at scaffold-time by `bunx skills add`) ship their .md/.json/.ts
    // as-is. ESLint must not touch them: their schemas, frontmatter, fenced
    // code blocks, and example snippets rely on exact formatting we don't own.
    '.claude/skills/**',
    '.agents/skills/**',
    // MCP reference templates — syntax-sensitive opt-in configs. Linting them
    // (e.g. toml/array-bracket-newline) corrupts the layout users copy from.
    'docs/mcp/**',
  ],

  // Custom rules
  rules: {
    // Allow console for test logging
    'no-console': 'off',

    // TypeScript specific - strict but practical
    'ts/explicit-function-return-type': 'off',
    'ts/explicit-module-boundary-types': 'off',
    'ts/no-explicit-any': 'warn',
    // Required for @atc decorator flexibility
    'ts/no-unsafe-assignment': 'off',
    'ts/no-unsafe-return': 'off',
    'ts/no-unsafe-member-access': 'off',
    'ts/no-unsafe-argument': 'off',
    'ts/no-unsafe-call': 'off',
    // Disabled: requires type info for all files including JSON
    'ts/switch-exhaustiveness-check': 'off',
    // Disabled: too strict for config files, requires explicit boolean checks
    'ts/strict-boolean-expressions': 'off',

    // Node.js globals - standard in Bun/Node environment
    'node/prefer-global/buffer': 'off',
    'node/prefer-global/process': 'off',

    // Style preferences
    'style/semi': ['error', 'always'],
    'style/quotes': ['error', 'single'],
    'style/comma-dangle': ['error', 'always-multiline'],
    'style/max-statements-per-line': 'off',
    // Disabled: conflicts with Prettier YAML formatting (Prettier owns YAML style)
    'yaml/flow-mapping-curly-spacing': 'off',
    // Disabled: conflicts with Prettier JSONC formatting (Prettier adds trailing commas
    // in opencode.jsonc which this rule rejects). Prettier owns JSONC style.
    'jsonc/comma-dangle': 'off',

    // Allow unused vars with underscore prefix
    'unused-imports/no-unused-vars': [
      'warn',
      {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
      },
    ],
  },
};

/**
 * --- cli/ IMPORT CLOSURE (updater self-update invariant) ---
 *
 * `cli/` is the updater's self-update component: `runUpdate` refreshes those
 * files in place and re-execs the process BEFORE any other component is
 * synced (cli/lib/updater-core.ts, "SELF-UPDATE (before Phase 2)"). A repo
 * several releases behind therefore runs the NEW `cli/` against its OWN, old
 * copy of every sibling directory.
 *
 * So an import that escapes `cli/` is not a style question: it bricks the
 * update path for anyone jumping more than one release. It happened in the
 * QA boilerplate: `cli/` imported `../scripts/agent-compatibility.ts`, the
 * re-exec died on `Cannot find module`, and `bun sync`, `bun sync --rollback`,
 * `setup` and `setup:doctor` all went down together, since the failure is at
 * module load and the rollback path shares the same entrypoint.
 *
 * Shared code goes in `cli/lib/`. A `scripts/` file that needs it imports
 * FROM `cli/` (that direction is safe: `scripts/` is synced later, never
 * re-exec'd mid-run). `api/`, `src/`, `config/` and `tests/` are listed for
 * the scaffolded project this config travels into; they are equally absent
 * at re-exec time.
 */
export const CLI_IMPORT_CLOSURE = {
  files: ['cli/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: [
          '../scripts/**',
          '../../scripts/**',
          '../../../scripts/**',
          '../../../../scripts/**',
          '../packages/**',
          '../../packages/**',
          '../../../packages/**',
          '../../../../packages/**',
          '../api/**',
          '../../api/**',
          '../../../api/**',
          '../../../../api/**',
          '../src/**',
          '../../src/**',
          '../../../src/**',
          '../../../../src/**',
          '../config/**',
          '../../config/**',
          '../../../config/**',
          '../../../../config/**',
          '../tests/**',
          '../../tests/**',
          '../../../tests/**',
          '../../../../tests/**',
          '@/*',
          '@api/*',
          '@schemas/*',
          '@utils/*',
        ],
        message: 'cli/ must be import-closed: the updater re-execs the new cli/ before other components are synced, so an import that escapes cli/ breaks `bun sync` for repos more than one release behind. Move the shared module into cli/lib/ instead.',
      }],
    }],
  },
};
