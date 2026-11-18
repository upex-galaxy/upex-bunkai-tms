# Error Handling

The default error-handling pattern for Stage 2 (implementation) and Stage 3 (code review): typed errors, structured responses, retries and logs with context.

Where the app already has an error-handling shape (its own error classes, result types, logger), follow it. These patterns are the default for an app that has none (`../SKILL.md`, section `## Stack parameters`).

---

## Principles

1. No hardcoded fallbacks. Read them from configuration.
2. Structured error responses in one consistent format.
3. Custom error classes, so errors are typed.
4. Retry logic for operations that can fail transiently.
5. Logging with context.

---

## Custom error classes

```typescript
// lib/errors.ts
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public statusCode: number = 500,
    public isOperational: boolean = true
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public fields?: Record<string, string>
  ) {
    super('VALIDATION_ERROR', message, 400);
  }
}

export class AuthenticationError extends AppError {
  constructor(message: string = 'Authentication required') {
    super('AUTH_ERROR', message, 401);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super('NOT_FOUND', `${resource} not found`, 404);
  }
}
```

---

## Correct usage

### API routes (Next.js)

```typescript
// app/api/users/[id]/route.ts
import { AppError, NotFoundError } from '@/lib/errors';

export async function GET(request: Request, { params }: { params: { id: string } }) {
  try {
    const user = await db.user.findUnique({
      where: { id: params.id },
    });

    if (!user) {
      throw new NotFoundError('User');
    }

    return Response.json(user);
  } catch (error) {
    if (error instanceof AppError) {
      return Response.json(
        { error: error.message, code: error.code },
        { status: error.statusCode }
      );
    }

    // Unexpected error
    logger.error('Unexpected error in GET /api/users/[id]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Client side

```typescript
// lib/api-client.ts
async function fetchUser(id: string): Promise<User> {
  try {
    const response = await fetch(`/api/users/${id}`);

    if (!response.ok) {
      const error = await response.json();
      throw new AppError(
        error.code || 'FETCH_ERROR',
        error.message || 'Failed to fetch user',
        response.status
      );
    }

    return await response.json();
  } catch (error) {
    if (error instanceof AppError) {
      throw error;
    }

    throw new AppError('NETWORK_ERROR', 'Network error occurred', 0);
  }
}
```

---

## Retry logic

```typescript
// lib/retry.ts
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    delay?: number;
    backoff?: boolean;
  } = {}
): Promise<T> {
  const { maxRetries = 3, delay = 1000, backoff = true } = options;

  let lastError: Error;

  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error as Error;

      if (i < maxRetries - 1) {
        const waitTime = backoff ? delay * Math.pow(2, i) : delay;
        await new Promise(resolve => setTimeout(resolve, waitTime));
      }
    }
  }

  throw lastError!;
}

// Usage
const user = await withRetry(() => fetchUser(userId), {
  maxRetries: 3,
  delay: 1000,
  backoff: true,
});
```

---

## Logging with context

```typescript
// lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: label => ({ level: label }),
  },
});

// Usage
logger.info('User logged in', { userId, timestamp: Date.now() });
logger.error('Payment failed', {
  userId,
  amount,
  error: error.message,
  stack: error.stack,
});
```

---

## What to avoid

### Swallowed errors

A silent `catch` hides the failure until it shows up as bad data.

```typescript
// BAD
try {
  await dangerousOperation();
} catch (error) {
  // silenced
}

// GOOD
try {
  await dangerousOperation();
} catch (error) {
  logger.error('Operation failed', error);
  throw error; // re-throw if you cannot handle it
}
```

### Hardcoded messages

```typescript
// BAD
throw new Error('User not found');

// GOOD
throw new NotFoundError('User');
```

### Internal details in responses

A response that names hosts or ports tells an attacker where to look. Log the detail and return a generic message.

```typescript
// BAD
return Response.json(
  {
    error: 'Database connection failed at 192.168.1.1:5432',
  },
  { status: 500 }
);

// GOOD
logger.error('DB connection failed', { host, port });
return Response.json(
  {
    error: 'Service temporarily unavailable',
  },
  { status: 503 }
);
```
