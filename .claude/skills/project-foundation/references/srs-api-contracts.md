Actúa como API Designer y Backend Engineer.

**Input:**

- Functional Specs: [usar .context/SRS/functional-specs.md]
- PRD User Stories: [listar user stories relevantes]

**Genera archivo: api-contracts.yaml**

Genera OpenAPI 3.0 spec completo con:

**Estructura:**

1. **Info Section:**
   - Title: [Project Name] API
   - Version: 1.0.0
   - Description: API para [breve descripción]

2. **Servers:**
   - Development: http://localhost:3000
   - Staging: https://staging.example.com
   - Production: https://api.example.com

3. **Paths** (endpoints principales):

   Por cada endpoint:
   - **Path:** /api/[resource]
   - **Method:** GET, POST, PUT, DELETE
   - **Summary:** Breve descripción
   - **Request Body:** (si aplica)
     - Schema con properties, types, required fields
     - Ejemplo de request
   - **Responses:**
     - 200/201: Success response con schema
     - 400: Validation error
     - 401: Unauthorized
     - 404: Not found
     - 500: Internal server error
   - **Authentication:** (si requiere auth)

**Ejemplo de endpoint:**

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
required: - email - password
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

**Components Section:**

- Schemas reutilizables (User, Error Response, etc.)
- Security Schemes (JWT Bearer token)

**Formato:** YAML válido según OpenAPI 3.0, listo para copiar a .context/SRS/api-contracts.yaml

**Restricciones:**

- OpenAPI 3.0 spec válido
- Endpoints basados en Functional Requirements
- Schemas con validaciones (min/max, format, etc.)
- Respuestas consistentes (siempre incluir success, error)
