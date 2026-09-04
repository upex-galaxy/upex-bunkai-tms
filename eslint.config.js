import antfu from '@antfu/eslint-config';
import nextPlugin from '@next/eslint-plugin-next';

export default antfu({
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
    // Foundation / discovery artifacts and design handoff mockups. Treated as
    // reference material (Prettier already ignores .context/ for the same
    // reason). ESLint must not touch the .jsx mockups under
    // .context/designs/ — they're a vendor-style handoff, not source code.
    '.context/**',
    // GitHub workflows (YAML files)
    '.github/**',
    // Generated files (auto-generated, not manually edited)
    'api/openapi-types.ts',
    'api/.openapi-config.json',
    'api/openapi.json',
    // Skill directories — never lint.
    // T1 skills (.claude/skills/) and community T3/T4 skills (.agents/skills/,
    // installed at scaffold-time by `bunx skills add`) ship their .md/.json/.ts
    // as-is. ESLint must not touch them: their schemas, frontmatter, fenced
    // code blocks, and example snippets rely on exact formatting we don't own.
    '.claude/skills/**',
    '.agents/skills/**',
    // Agent worktrees — nested git checkouts created by isolated sub-agent
    // sessions. They are a full copy of the repo; linting them double-counts
    // every file (and fails on another session's in-flight code). Never lint.
    '.claude/worktrees/**',
    // MCP reference templates — syntax-sensitive opt-in configs. Linting them
    // (e.g. toml/array-bracket-newline) corrupts the layout users copy from.
    'docs/mcp/**',
    // Supabase Database types written by `bun run types:gen`
    // (scripts/gen-supabase-types.ts). Large machine-generated snake_case
    // file — linting it produces noise and `eslint --fix` would diverge it
    // from the generator's byte-identical output guarantee.
    'lib/types/supabase.ts',
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
}).append({
  name: 'next/core-web-vitals',
  plugins: { '@next/next': nextPlugin },
  rules: nextPlugin.configs['core-web-vitals'].rules,
}).append({
  // ADR-0001: API routes must authenticate through the unified gateway
  // (withApiHandler + getAuth(ctx)), never by reading the session cookie
  // directly. Banning `auth.getUser()` here makes the cookie/PAT parity
  // guarantee mechanical — a route that bypasses the gateway fails the build.
  // `auth.admin.getUserById(...)` is unaffected (different method name).
  name: 'bunkai/api-auth-gateway',
  files: ['app/api/**/*.ts'],
  rules: {
    'no-restricted-syntax': [
      'error',
      {
        selector: 'CallExpression[callee.property.name=\'getUser\'][callee.object.property.name=\'auth\']',
        message: 'Do not call auth.getUser() in API routes. Authenticate via the gateway: withApiHandler(handler, { auth: \'required\' }) and read identity with getAuth(ctx). See ADR-0001.',
      },
    ],
  },
}).append({
  // --- cli/ IMPORT CLOSURE (updater self-update invariant) ---
  //
  // `cli/` is the updater's self-update component: `runUpdate` refreshes those
  // files in place and re-execs the process BEFORE any other component is
  // synced (cli/lib/updater-core.ts, "SELF-UPDATE (before Phase 2)"). A repo
  // several releases behind therefore runs the NEW `cli/` against its OWN, old
  // copy of every sibling directory.
  //
  // So an import that escapes `cli/` is not a style question: it bricks the
  // update path for anyone jumping more than one release. It happened in the
  // QA boilerplate: `cli/` imported `../scripts/agent-compatibility.ts`, the
  // re-exec died on `Cannot find module`, and `bun run up`, `up --rollback`,
  // `setup` and `setup:doctor` all went down together, since the failure is at
  // module load and the rollback path shares the same entrypoint.
  //
  // Shared code goes in `cli/lib/`. A `scripts/` file that needs it imports
  // FROM `cli/` (that direction is safe: `scripts/` is synced later, never
  // re-exec'd mid-run).
  name: 'boilerplate/cli-import-closure',
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
        message: 'cli/ must be import-closed: the updater re-execs the new cli/ before other components are synced, so an import that escapes cli/ breaks `bun run up` for repos more than one release behind. Move the shared module into cli/lib/ instead.',
      }],
    }],
  },
});
