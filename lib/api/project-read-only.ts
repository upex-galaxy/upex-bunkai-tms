import { ApiError } from '@lib/api/error-envelope';

export const PROJECT_READ_ONLY_SQLSTATE = '45701';

export function projectReadOnlyError(): ApiError {
  return new ApiError(
    'project_read_only',
    'This project is read-only because the workspace is over its plan\'s project limit. Upgrade the plan to edit it again.',
    { details: { reason: 'project_read_only' } },
  );
}

// Routes wrap Postgres errors in their own envelopes, so the lock is also recognised by its message.
export function isProjectReadOnlyFailure(raw: unknown): boolean {
  if (typeof raw !== 'object' || raw === null) {
    return false;
  }
  if (raw instanceof ApiError && raw.code === 'project_read_only') {
    return false;
  }
  const value = raw as { code?: unknown, message?: unknown };
  if (value.code === PROJECT_READ_ONLY_SQLSTATE) {
    return true;
  }
  return typeof value.message === 'string' && /\bproject_read_only\b/.test(value.message);
}

export function throwIfProjectReadOnly(error: { code?: string, message?: string } | null | undefined): void {
  if (error && isProjectReadOnlyFailure(error)) {
    throw projectReadOnlyError();
  }
}
