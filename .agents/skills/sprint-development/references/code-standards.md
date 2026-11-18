# Code Standards

Default code conventions for Stage 2 (implementation) and Stage 3 (code review). They keep code consistent and cheap to review.

These are the defaults for an app with no convention of its own. Where the app already has one (folder layout, naming, the import alias `{{stack.conventions.import_alias}}`, component shape), follow the app's. Record a disagreement as tech debt in the plan or PR, and do not rewrite code inside a story to match this file (`../SKILL.md`, section `## Stack parameters`).

---

## Core principles

### 1. DRY (Don't Repeat Yourself)

```typescript
// BAD: repeated fetch logic
function getUserEmail(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  const user = await response.json();
  return user.email;
}

function getUserName(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  const user = await response.json();
  return user.name;
}

// GOOD: one reusable function
async function getUser(userId: string) {
  const response = await fetch(`/api/users/${userId}`);
  return await response.json();
}

function getUserEmail(userId: string) {
  const user = await getUser(userId);
  return user.email;
}
```

### 2. KISS (Keep It Simple)

```typescript
// BAD: over-engineered nesting
const getUserStatus = (user: User): UserStatus => {
  return user.isActive
    ? user.isPremium
      ? user.trialEnded
        ? UserStatus.PREMIUM_ACTIVE
        : UserStatus.TRIAL_ACTIVE
      : UserStatus.FREE_ACTIVE
    : UserStatus.INACTIVE;
};

// GOOD: simple and readable
const getUserStatus = (user: User): UserStatus => {
  if (!user.isActive) return UserStatus.INACTIVE;
  if (!user.isPremium) return UserStatus.FREE_ACTIVE;
  if (user.trialEnded) return UserStatus.PREMIUM_ACTIVE;
  return UserStatus.TRIAL_ACTIVE;
};
```

### 3. YAGNI (You Aren't Gonna Need It)

```typescript
// BAD: fields nobody asked for
interface User {
  id: string;
  name: string;
  email: string;
  socialSecurity?: string; // why?
  bloodType?: string; // why?
  favoriteColor?: string; // why?
}

// GOOD: only what the story needs
interface User {
  id: string;
  name: string;
  email: string;
}
```

---

## Naming conventions

### Variables and functions

```typescript
// camelCase for variables and functions
const userName = 'John';
const isActive = true;
const totalCount = 42;

function getUserById(id: string) {}
function calculateTotal(items: Item[]) {}
```

### React components

```typescript
// PascalCase for components
function LoginForm() {}
function UserProfile() {}
const NavBar = () => {};
```

### Constants

```typescript
// UPPER_SNAKE_CASE for constants
const MAX_RETRIES = 3;
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL;
const DEFAULT_TIMEOUT = 5000;
```

### Types and interfaces

```typescript
// PascalCase; an 'I' or 'T' prefix is optional
interface User {}
interface UserResponse {}
type UserId = string;
type UserRole = 'admin' | 'user' | 'guest';
```

### Files

```
kebab-case for modules:
- user-profile.tsx
- api-client.ts
- error-handler.ts

PascalCase for component files:
- LoginForm.tsx
- UserCard.tsx
- NavBar.tsx
```

---

## Function parameters

### At most 2 positional parameters

A function with 3 or more parameters takes an object instead:

```typescript
// BAD: hard to read, easy to swap arguments
createUser('John', 'john@test.com', 'password', true, 30);

// What is `true`? What is `30`? Nobody knows without checking the signature.

// GOOD: self-documenting
createUser({
  name: 'John',
  email: 'john@test.com',
  password: 'password',
  isActive: true,
  age: 30,
});
```

### Interface definition

```typescript
// Define the interface for the object parameter
interface CreateUserArgs {
  name: string;
  email: string;
  password: string;
  isActive?: boolean; // optional with ?
  age?: number;
}

// The signature stays clean
function createUser(args: CreateUserArgs): User {
  const { name, email, password, isActive = true, age } = args;
  // ...
}
```

### Benefits

| Benefit                  | Explanation                                  |
| ------------------------ | -------------------------------------------- |
| **Self-documenting**     | Parameter names are visible at the call site |
| **Order doesn't matter** | `{ age: 30, name: 'John' }` works fine       |
| **Easy to extend**       | Add optional params without breaking callers |
| **IDE support**          | Autocomplete shows all available options     |

### When 2 positional is fine

```typescript
// OK: 2 params are manageable
function getUser(id: string, includeDeleted: boolean) { ... }

// OK: 1 param is obvious
function deleteUser(id: string) { ... }

// NOT OK: 3+ params, use an object
function getUser(id: string, includeDeleted: boolean, expand: string) { ... }
```

---

## TypeScript strict mode

Turn on strict mode in every TypeScript app:

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true
  }
}
```

### Avoid `any`

```typescript
// BAD
function processData(data: any) {
  return data.value;
}

// GOOD
interface DataPayload {
  value: string;
}

function processData(data: DataPayload) {
  return data.value;
}
```

### Use explicit types

```typescript
// BAD: the inferred type can drift
const users = [];

// GOOD: explicit type
const users: User[] = [];
```

---

## Component structure (React)

### Order of elements

```typescript
// Standard order
import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { getUserById } from '@/lib/api'
import type { User } from '@/types'

interface UserProfileProps {
  userId: string
}

export function UserProfile({ userId }: UserProfileProps) {
  // 1. Hooks
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

  // 2. Effects
  useEffect(() => {
    loadUser()
  }, [userId])

  // 3. Handlers
  const loadUser = async () => {
    const data = await getUserById(userId)
    setUser(data)
    setLoading(false)
  }

  // 4. Early returns
  if (loading) return <div>Loading...</div>
  if (!user) return <div>User not found</div>

  // 5. Render
  return (
    <div>
      <h1>{user.name}</h1>
      <p>{user.email}</p>
    </div>
  )
}
```

### Props destructuring

```typescript
// GOOD: destructure props in the signature
function UserCard({ name, email, avatar }: UserCardProps) {
  return <div>{name}</div>
}

// BAD: passing around the props object
function UserCard(props: UserCardProps) {
  return <div>{props.name}</div>
}
```

---

## Performance

### 1. Memoization

```typescript
import { useMemo, useCallback } from 'react'

function ExpensiveComponent({ items }: Props) {
  // Memoize expensive calculations
  const total = useMemo(() => {
    return items.reduce((sum, item) => sum + item.price, 0)
  }, [items])

  // Memoize callbacks
  const handleClick = useCallback(() => {
    console.log('Clicked')
  }, [])

  return <div>Total: {total}</div>
}
```

### 2. Lazy loading

```typescript
import { lazy, Suspense } from 'react'

// Lazy load heavy components
const HeavyChart = lazy(() => import('./HeavyChart'))

function Dashboard() {
  return (
    <Suspense fallback={<div>Loading chart...</div>}>
      <HeavyChart />
    </Suspense>
  )
}
```

### 3. Avoid needless re-renders

```typescript
import { memo } from 'react'

// Memoize pure components
export const UserCard = memo(function UserCard({ user }: Props) {
  return <div>{user.name}</div>
})
```

---

## Accessibility (a11y)

### Semantic HTML

```tsx
// BAD
<div onClick={handleClick}>Click me</div>

// GOOD
<button onClick={handleClick}>Click me</button>
```

### ARIA labels

```tsx
// Descriptive labels
<button aria-label="Close dialog">
  <XIcon />
</button>

<input
  type="text"
  aria-label="Search users"
  placeholder="Search..."
/>
```

### Keyboard navigation

```tsx
// Keyboard support
<div
  role="button"
  tabIndex={0}
  onClick={handleClick}
  onKeyDown={e => {
    if (e.key === 'Enter' || e.key === ' ') {
      handleClick();
    }
  }}
>
  Custom button
</div>
```

---

## Code organization

### Folder structure

```
src/
├── components/
│   ├── ui/              # reusable components
│   └── features/        # feature-specific components
├── lib/
│   ├── api/             # API clients
│   ├── utils/           # utilities
│   └── hooks/           # custom hooks
├── types/               # TypeScript types
└── app/                 # pages (Next.js App Router)
```

### Barrel exports

```typescript
// components/ui/index.ts
export { Button } from './Button';
export { Input } from './Input';
export { Card } from './Card';

// Usage
import { Button, Input, Card } from '@/components/ui';
```

---

## What to avoid

Each of these has a concrete failure behind it: leaked config, noisy production logs, silent data loss.

### 1. Hardcoded values

```typescript
// BAD
const apiUrl = 'https://api.example.com';

// GOOD
const apiUrl = process.env.NEXT_PUBLIC_API_URL;
```

### 2. Leftover `console.log()`

```typescript
// BAD
console.log('User data:', user);

// GOOD (when you need logging)
import { logger } from '@/lib/logger';
logger.info('User data loaded', { userId: user.id });
```

### 3. `var`

```typescript
// BAD
var count = 0;

// GOOD
const count = 0;
let counter = 0;
```

### 4. Direct state mutation

```typescript
// BAD
const [users, setUsers] = useState<User[]>([]);
users.push(newUser); // mutation

// GOOD
setUsers([...users, newUser]);
```

### 5. Ignored errors

```typescript
// BAD
try {
  await fetchData();
} catch (error) {
  // silently ignored
}

// GOOD
try {
  await fetchData();
} catch (error) {
  logger.error('Failed to fetch data', error);
  throw new AppError('FETCH_FAILED', 'Unable to load data');
}
```

---

## Code quality checklist

Before a commit:

- [ ] Code follows DRY, KISS and YAGNI
- [ ] Naming conventions followed
- [ ] TypeScript strict, no `any`
- [ ] No hardcoded values
- [ ] No leftover `console.log()`
- [ ] Accessibility considered
- [ ] Performance considered
- [ ] Components memoized where it pays off
- [ ] Error handling in place
- [ ] Tests written
