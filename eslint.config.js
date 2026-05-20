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
}).append({
  name: 'next/core-web-vitals',
  plugins: { '@next/next': nextPlugin },
  rules: nextPlugin.configs['core-web-vitals'].rules,
});
