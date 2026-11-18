# Fix issues

Debug and fix errors in the implementation of **STORY-{PROJECT_KEY}-{ISSUE_NUM}-{name}**. The same loop serves a build or runtime error, a review finding and a red CI run: reproduce it, diagnose the cause, fix it, validate. Every fix is a new commit, because pushed history is never rewritten (Critical Rule #5, `AGENTS.md`).

## Step 1: Reproduce and understand the error

Read the whole error and do not assume what it says. Collect:

1. What error occurs: the complete message, the stack trace, the file and line.
2. When it occurs:
   - during the build (`{{stack.package_manager}} run {{stack.scripts.build}}`)
   - during dev (`{{stack.package_manager}} run {{stack.scripts.dev}}`)
   - in the browser (runtime)
   - on the server (API or backend)
3. How to reproduce it: the exact steps and the data or inputs used. An error you cannot reproduce on demand is one you cannot confirm fixed.

Output:

````markdown
## Error identified

**Type:** [Build error / Runtime error / TypeScript error / etc.]

**Message:**

```
[Paste the complete error message]
```

**Location:**

- File: `[path]`
- Line: [number]

**How to reproduce:**

1. [Step 1]
2. [Step 2]
3. [Result: error]
````

## Step 2: Investigate and diagnose

Analyze the possible causes:

1. Review the code at the error location, and what was modified just before the error appeared.
2. Check Context7 MCP when the error comes from an external library (for example, a Next.js error: search the official docs).
3. Review the guidelines in `references/error-handling.md` and `references/code-standards.md`.

Common causes: a wrong TypeScript type, a mistyped import, an undefined variable, an API call without error handling, a missing dependency.

Output:

```markdown
## Diagnosis

**Root cause:** [Description]

**Why it happens:** [Explanation]

**Proposed solution:** [How to fix it]
```

## Step 3: Apply the fix

1. Modify the code.
2. Explain the change.
3. Validate that it fixes the error.

Output:

`````markdown
## Fix applied

**File:** `[path]`

**Change:**
[Description of the change]

**Code before:**

```typescript
[Code with the error]
```

**Code after:**

```typescript
[Fixed code]
```

**Why it works:** [Explanation]
`````

## Step 4: Validate

Check that the error is resolved.

1. The build succeeds, with no TypeScript errors and no linting errors:

   ```bash
   {{stack.package_manager}} run {{stack.scripts.build}}
   ```

2. Manual test: repeat the steps that caused the error and verify that they work now.

Output:

```markdown
## Validation

**Build:** succeeded

**Manual test:**

- [Step 1] - works
- [Step 2] - works
- The error no longer occurs

**Next step:** Continue the implementation or move to code review
```

When the error persists or turns out to be complex, ask for help or revisit the architecture of the solution. A supervised worker asks its conductor. A routine records what it tried in the run report and stops fixing that error there (`agentic-dev-core/references/decision-protocol.md`).

## Common error types

### 1. TypeScript error

Symptom: `Type 'X' is not assignable to type 'Y'`

- Check the types in the interfaces and types.
- Check Context7 MCP for the library's correct types.
- Use type guards when needed.

### 2. Import error

Symptom: `Cannot find module 'X'`

- Check the import path.
- Install the dependency when it is missing: `{{stack.package_manager}} add [package]`.
- Check the path aliases (when the app uses `@/` or similar).

### 3. Runtime error (browser)

Symptom: an error in the browser console.

- Read the stack trace.
- Validate that the data exists before accessing it.
- Add error handling (try-catch).

### 4. Build error

Symptom: the build fails.

- Read the whole message.
- Check the configuration (next.config.js, tsconfig.json).
- Check Context7 MCP for the specific framework.
