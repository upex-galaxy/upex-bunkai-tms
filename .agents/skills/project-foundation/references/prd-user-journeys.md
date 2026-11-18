Map the main user journeys of the MVP, as a UX designer and product manager would.

**Input:**

- User Personas: [use .context/PRD/user-personas.md]
- MVP Scope: [use .context/PRD/mvp-scope.md]

**Generate file: user-journeys.md**

Map 2-3 main user journeys.

**For each journey:**

1. **Journey Title** (for example, "Sign-up and first use")

2. **Persona:** [which persona from the PRD]

3. **Scenario:** [the user's starting context]

4. **Steps** (the full flow):

   **Step 1:**
   - User Action: [what the user does]
   - System Response: [how the system responds]
   - Pain Point: [where it can fail or frustrate]

   **Step 2:**
   - User Action: ...
   - System Response: ...
   - Pain Point: ...

   (Continue until the journey is complete)

5. **Expected Outcome:** [what the user achieves at the end]

6. **Alternative Paths / Edge Cases:**
   - What happens if [common error]?
   - What happens if [unexpected action]?

**Recommended journeys:**

1. **Happy Path** (the ideal flow, no errors)
2. **Edge Case 1** (for example, a validation error or missing fields)
3. **Edge Case 2** (for example, a user without permission, or a timeout)

**Format:** structured Markdown, ready to copy into `.context/PRD/user-journeys.md`

**Constraints:**

- Realistic journeys, not idealized
- Identify the pain points at each step
- Cover both the happy path and the edge cases
