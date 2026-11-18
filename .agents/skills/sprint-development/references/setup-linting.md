# Setup Linting

Set up ESLint and Prettier in the current project when it has neither. It is first-time setup, and it runs before the first code review so that style findings come from tools, not from the reviewer.

> **Additive, never a replacement.** If the app already has any lint or format configuration (an `eslint.config.*`, `.eslintrc.*`, `.prettierrc*`, `biome.json`, or a non-null `{{stack.scripts.lint}}` in `.agents/project.yaml`), this guide does not run. The app's configuration wins. Whatever is missing goes to the user as a separate proposed change. An existing file is never overwritten and an existing script is never renamed. When the app had nothing and the setup is done, record the script names you created with `bun run agents:setup --stack`, so `stack.scripts.lint` names them.

---

## Tool check (MCP)

Context7 (`[DOCS_TOOL]`) is recommended: use it to read the official ESLint, Prettier and framework docs before writing any config.

If it is not available, say so in the report and continue with generic configuration, which may not be optimal. A person present can choose to connect Context7 first. Nobody is blocked waiting for it.

---

## Step 1: Detect the framework and the current state

Read these files:

- `package.json`: the framework (Next.js, React with Vite, etc.)
- `.eslintrc.*` or `eslint.config.js`: whether ESLint is already configured
- `.prettierrc.*`: whether Prettier is already configured

Write the result:

```markdown
## Project analysis

**Detected framework:** [Next.js / React+Vite / etc.]
**Package manager:** [`{{stack.package_manager}}`]

**Current state:**

- ESLint: configured / not configured
- Prettier: configured / not configured

**Next step:** [Configure from scratch / Already set up: the existing configuration wins and this guide ends]
```

---

## Step 2: Install dependencies (if missing)

Install the packages by hand. Interactive generators such as `npm init @eslint/config` ask for input nobody can give, so do not run them.

### 2.1 Install the packages

```bash
{{stack.package_manager}} add -d eslint prettier eslint-config-prettier eslint-plugin-prettier
```

For Next.js:

```bash
{{stack.package_manager}} add -d eslint-config-next
```

For React without Next.js:

```bash
{{stack.package_manager}} add -d eslint-plugin-react eslint-plugin-react-hooks
```

For TypeScript:

```bash
{{stack.package_manager}} add -d @typescript-eslint/eslint-plugin @typescript-eslint/parser
```

---

## Step 3: Create the configuration files

Create the files by hand, for the same reason: no interactive scripts.

### 3.1 Create `.eslintrc.json` (or `.eslintrc.js`)

Look up the official configuration for the framework through Context7 when it is available.

**Next.js example:**

```json
{
  "extends": ["next/core-web-vitals", "plugin:@typescript-eslint/recommended", "prettier"],
  "rules": {
    "@typescript-eslint/no-explicit-any": "error",
    "@typescript-eslint/no-unused-vars": ["error", { "argsIgnorePattern": "^_" }],
    "no-console": ["warn", { "allow": ["warn", "error"] }]
  }
}
```

**React with Vite example:**

```json
{
  "env": {
    "browser": true,
    "es2021": true
  },
  "extends": [
    "eslint:recommended",
    "plugin:react/recommended",
    "plugin:react-hooks/recommended",
    "plugin:@typescript-eslint/recommended",
    "prettier"
  ],
  "parser": "@typescript-eslint/parser",
  "parserOptions": {
    "ecmaFeatures": {
      "jsx": true
    },
    "ecmaVersion": "latest",
    "sourceType": "module"
  },
  "plugins": ["react", "react-hooks", "@typescript-eslint"],
  "rules": {
    "react/react-in-jsx-scope": "off",
    "@typescript-eslint/no-explicit-any": "error",
    "no-console": "warn"
  },
  "settings": {
    "react": {
      "version": "detect"
    }
  }
}
```

---

### 3.2 Create `.prettierrc` (or `.prettierrc.json`)

```json
{
  "semi": false,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100,
  "arrowParens": "avoid"
}
```

Adjust it to the team's preferences.

---

### 3.3 Create `.eslintignore`

```
node_modules
.next
out
dist
build
.env*
*.config.js
```

---

### 3.4 Create `.prettierignore`

```
node_modules
.next
out
dist
build
*.md
pnpm-lock.yaml
package-lock.json
```

---

## Step 4: Add scripts to `package.json`

Edit `package.json` and add:

```json
{
  "scripts": {
    "lint:check": "eslint . --ext .ts,.tsx,.js,.jsx",
    "lint:fix": "eslint . --ext .ts,.tsx,.js,.jsx --fix",
    "format:check": "prettier --check \"**/*.{ts,tsx,js,jsx,json,css,md}\"",
    "format:fix": "prettier --write \"**/*.{ts,tsx,js,jsx,json,css,md}\""
  }
}
```

---

## Step 5: Validate the configuration

### 5.1 Try linting

```bash
{{stack.package_manager}} run lint:check
```

Expected: it runs without configuration errors. It may report warnings or errors in the code, and that is normal.

### 5.2 Try the automatic fix

```bash
{{stack.package_manager}} run lint:fix
```

Expected: it fixes what it can on its own (formatting, imports, etc.).

### 5.3 Try Prettier

```bash
{{stack.package_manager}} run format:fix
```

Expected: it formats every file according to the rules.

---

## Step 6: Editor setup (recommend it to the user)

For VS Code:

1. Install the extensions ESLint (`dbaeumer.vscode-eslint`) and Prettier (`esbenp.prettier-vscode`).
2. Turn on format on save by creating `.vscode/settings.json`:

```json
{
  "editor.formatOnSave": true,
  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.codeActionsOnSave": {
    "source.fixAll.eslint": "explicit"
  }
}
```

---

## Expected output

````markdown
## Linting configured

### Dependencies installed:

- eslint
- prettier
- eslint-config-prettier
- eslint-plugin-prettier
- [others, depending on the framework]

### Files created:

- `.eslintrc.json`: ESLint configuration
- `.prettierrc`: Prettier configuration
- `.eslintignore`: files ESLint skips
- `.prettierignore`: files Prettier skips

### Scripts added to `package.json`:

- `{{stack.package_manager}} run lint:check`: run linting
- `{{stack.package_manager}} run lint:fix`: automatic fix
- `{{stack.package_manager}} run format:fix`: format the code

### Validation:

- `{{stack.package_manager}} run lint:check` runs without configuration errors
- `{{stack.package_manager}} run format:fix` formats files

### Next steps:

1. Run linting on the existing code:

   ```bash
   {{stack.package_manager}} run lint:check
   ```

   Review the warnings and errors, and fix the critical ones.

2. Apply the automatic fix when it is safe:

   ```bash
   {{stack.package_manager}} run lint:fix
   {{stack.package_manager}} run format:fix
   ```

3. Set up the editor: install the ESLint and Prettier extensions and turn on format on save.

4. Continue with code review using `references/review-pr.md` (a sibling file in this skill).

### Notes:

- Some existing warnings are normal in legacy code
- Fix errors before warnings
- Pre-commit hooks (Husky) are a good later addition
````

---

## Example request

```markdown
Set up ESLint and Prettier for this Next.js project.

Process:
1. Detect the framework and the current state
2. Install the needed dependencies
3. Create the configuration files by hand (no interactive scripts)
4. Add the scripts to package.json
5. Validate that it works ({{stack.package_manager}} run lint:check)

Use Context7 for the official Next.js configuration when it is available.
```

---

## Troubleshooting

### An interactive script is required

Example: `npm init @eslint/config` asks for input. Do not run it. Create the configuration by hand instead, based on the framework's official docs, and say so:

```markdown
That command needs interactive input, so I created `.eslintrc.json` by hand with a configuration
based on the official [Framework] docs.

If you prefer the generator, run it yourself:
1. Open a terminal
2. Run: npm init @eslint/config
3. Select: [recommended options]
```

---

Once linting is set up, continue with code review (Stage 3) using `review-pr.md`.
