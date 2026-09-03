# Error Handling

> **Para**: Fases 6-7 (Implementation + Code Review)
> **Propósito**: Manejo consistente de errores en todo el proyecto

---

## 🎯 Principios

1. **NO hardcodear fallbacks** - Usar configuración
2. **Structured error responses** - Formato consistente
3. **Custom error classes** - Errores tipados
4. **Retry logic** - Para operaciones fallidas
5. **Strategic logging** - Logging con contexto

---

## 🏗️ Custom Error Classes

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

## ✅ Uso Correcto

### API Routes (Next.js)

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

    // Error inesperado
    logger.error('Unexpected error in GET /api/users/[id]', error);
    return Response.json({ error: 'Internal server error' }, { status: 500 });
  }
}
```

### Client-side

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

## 🔄 Retry Logic

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

// Uso
const user = await withRetry(() => fetchUser(userId), {
  maxRetries: 3,
  delay: 1000,
  backoff: true,
});
```

---

## 📝 Logging Estratégico

```typescript
// lib/logger.ts
import pino from 'pino';

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  formatters: {
    level: label => ({ level: label }),
  },
});

// Uso
logger.info('User logged in', { userId, timestamp: Date.now() });
logger.error('Payment failed', {
  userId,
  amount,
  error: error.message,
  stack: error.stack,
});
```

---

## ⚠️ Qué NO Hacer

### ❌ NO silenciar errores

```typescript
// ❌ MAL
try {
  await dangerousOperation();
} catch (error) {
  // Silenciado - muy peligroso!
}

// ✅ BIEN
try {
  await dangerousOperation();
} catch (error) {
  logger.error('Operation failed', error);
  throw error; // Re-throw si no puedes manejar
}
```

### ❌ NO hardcodear mensajes

```typescript
// ❌ MAL
throw new Error('User not found');

// ✅ BIEN
throw new NotFoundError('User');
```

### ❌ NO exponer detalles internos

```typescript
// ❌ MAL
return Response.json(
  {
    error: 'Database connection failed at 192.168.1.1:5432',
  },
  { status: 500 }
);

// ✅ BIEN
logger.error('DB connection failed', { host, port });
return Response.json(
  {
    error: 'Service temporarily unavailable',
  },
  { status: 503 }
);
```

---

**Última actualización**: 2025-10-29
**Fase**: Implementation (Fase 6)
