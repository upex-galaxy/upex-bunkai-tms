Define the MVP scope and cut it by priority, as a product manager focused on prioritization would.

**Input:**

- Executive Summary: [use .context/PRD/executive-summary.md]
- User Personas: [use .context/PRD/user-personas.md]
- Business Model: [use .context/business/business-model.md]

**Generate file: mvp-scope.md**

Define:

1. **In Scope (Must Have)**: the core MVP features

   Organized by epic (5-7 epics recommended).

   **For each epic:**
   - Epic ID: EPIC-[PROJECT]-[NUM]
   - Epic Title: [functional category]
   - User Stories (3-5 high-level user stories):
     - US ID.SubID: As a [user], I want [action], so that [benefit]

   **Example:**
   - Epic 1: User Authentication & Authorization
     - US 1.1: As a user, I want to sign up with my email so that I can access the platform
     - US 1.2: As a user, I want to log in with my credentials so that I can access my account
     - US 1.3: As a user, I want to recover my password if I forget it

2. **Out of Scope (Nice to Have)**, for v2 and later
   - Features that are not critical for the MVP
   - Future improvements
   - Advanced integrations

3. **Success Criteria**: when is the MVP a success?
   - Acceptance criteria for the whole MVP
   - Minimum metrics to reach
   - Conditions for launch

**Format:** structured Markdown with bullets, ready to copy into `.context/PRD/mvp-scope.md`

**Constraints:**

- Balanced epics (neither too large nor too small)
- User stories in the standard form: "As a [role], I want [action], so that [benefit]"
- Clear priority (must have vs nice to have)
