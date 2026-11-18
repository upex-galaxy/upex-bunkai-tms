# Pre-deploy checklist (Stage 5 go/no-go)

Run this before deploying to production. Every box must be ticked, or the item named as skipped with its reason. One unticked box with no reason is a no-go.

## 1. Tests (dev scope)

- [ ] Unit tests pass (100%).
- [ ] Type-check passes (`{{stack.package_manager}} run {{stack.scripts.types}}`).
- [ ] Lint passes (`{{stack.package_manager}} run {{stack.scripts.lint}}`).
- [ ] The production build succeeds (`{{stack.package_manager}} run {{stack.scripts.build}}`).
- [ ] A null role in `stack.scripts` is named as a skipped check, not counted as passed.
- [ ] Dev smoke checks pass on staging (curl the health endpoint, verify the deployed version, basic UI load; this is not the QA test suite).

Full QA verification (E2E, exploratory, regression) is out of scope here.

## 2. Code quality

- [ ] Code review approved.
- [ ] No critical TODOs.
- [ ] Security scan clean.

## 3. Infrastructure

- [ ] Environment variables are configured in production.
- [ ] Secrets are configured correctly.
- [ ] Database changes are ready (when there are any): each applied and verified in the integration environment, present in `list_migrations` of the DB MCP, and with its plan to apply in production according to `{{stack.database.migrations_tool}}` (`agentic-dev-core/references/db-change-doctrine.md`).
- [ ] A recent production backup exists.

## 4. Monitoring

- [ ] Sentry or DataDog is configured.
- [ ] Alerts are configured.
- [ ] Dashboards are ready.

## 5. Stakeholders

- [ ] The PM approved the deployment.
- [ ] QA gave a go/no-go (QA validation is managed in QA's own flow).
- [ ] DevOps is ready to monitor.

## With nobody at the keyboard

Section 5 is a person's decision, and a routine cannot tick it. Follow `agentic-dev-core/references/decision-protocol.md` §5.2: run sections 1 to 4 (all reads and local checks), then report the result with the approvals still missing and stop. A brief that records the PM and QA approvals counts as them.

## Output

Ready to deploy to production, or the list of unticked items with their reasons.
