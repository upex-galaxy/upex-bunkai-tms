Write the API contract of the project as an OpenAPI spec, as an API designer and backend engineer would.

**Input:**

- Functional Specs: [use .context/SRS/functional-specs.md]
- PRD User Stories: [list the relevant user stories]

**Generate file: api-contracts.yaml**

Generate a complete OpenAPI 3.0 spec with:

**Structure:**

1. **Info Section:**
   - Title: [Project Name] API
   - Version: 1.0.0
   - Description: API for [short description]

2. **Servers:**
   - Development: http://localhost:3000
   - Staging: https://staging.example.com
   - Production: https://api.example.com

3. **Paths** (main endpoints):

   For each endpoint:
   - **Path:** /api/[resource]
   - **Method:** GET, POST, PUT, DELETE
   - **Summary:** short description
   - **Request Body:** (if it applies)
     - Schema with properties, types and required fields
     - Example request
   - **Responses:**
     - 200/201: success response with schema
     - 400: validation error
     - 401: unauthorized
     - 404: not found
     - 500: internal server error
   - **Authentication:** (if the endpoint requires auth)

**Example endpoint:**

```yaml
/api/users:
  post:
    summary: Register new user
    requestBody:
      content:
        application/json:
          schema:
            type: object
            properties:
              email:
                type: string
                format: email
              password:
                type: string
                minLength: 8
            required:
              - email
              - password
    responses:
      '201':
        description: User created successfully
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                userId:
                  type: string
                  format: uuid
      '400':
        description: Validation error or email already exists
        content:
          application/json:
            schema:
              type: object
              properties:
                success:
                  type: boolean
                error:
                  type: object
                  properties:
                    code:
                      type: string
                    message:
                      type: string
```

**Components Section:**

- Reusable schemas (User, Error Response, and so on)
- Security Schemes (JWT Bearer token)

**Format:** valid YAML following OpenAPI 3.0, ready to copy into `.context/SRS/api-contracts.yaml`

**Constraints:**

- A valid OpenAPI 3.0 spec
- Endpoints based on the Functional Requirements
- Schemas with validations (min/max, format, and so on)
- Consistent responses (always include success and error)
