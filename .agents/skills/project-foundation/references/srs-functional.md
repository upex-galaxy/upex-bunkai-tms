Turn each PRD user story into formal Functional Requirements, as a software architect and business analyst would.

**Input:**

- Full PRD: [use .context/PRD/mvp-scope.md]
- User Stories: [list every user story in the PRD]

**Generate file: functional-specs.md**

Map each PRD user story to Functional Requirements (FR).

**Format per FR:**

**FR-[NUM]: [Feature] must allow [specific action]**

- **Related to:** Epic X, US Y.Z (from the PRD)
- **Input:** [expected input data: types, formats, validations]
- **Processing:** [business logic: what the system does with the input]
- **Output:** [expected result: response format, returned data]
- **Validations:** [validation rules: what the input must satisfy]

**Example:**

**FR-001: The system must allow user registration with an email**

- **Related to:** EPIC-001 (User Authentication), US 1.1
- **Input:**
  - email (string, RFC 5321 format, max 254 chars)
  - password (string, min 8 chars, at least 1 uppercase letter and 1 number)
- **Processing:**
  - Validate the email format
  - Validate the password strength
  - Check that the email does not exist in the DB
  - Hash the password with bcrypt
  - Create the user in the users table
  - Send a verification email
- **Output:**
  - Success: user object with id, email, created_at
  - Error: error code + descriptive message
- **Validations:**
  - Email is unique in the system
  - Password meets the security policy
  - Email is valid per the RFC

**Constraints:**

- 1:1 mapping with the PRD user stories
- FRs numbered sequentially (FR-001, FR-002, and so on)
- Specific and unambiguous
- Include business validations

**Format:** structured Markdown, ready to copy into `.context/SRS/functional-specs.md`
