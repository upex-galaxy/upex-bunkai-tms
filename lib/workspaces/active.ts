// Framework-agnostic active-workspace resolution (BK-52). No React/Next/DB
// imports — usable from server components, route handlers, and unit tests.

// Resolve which workspace is "active" for the caller: honour the bk_active_ws
// cookie when it points at a workspace the caller can actually see, otherwise
// fall back to the first visible workspace (callers order by created_at, so
// element [0] is the oldest membership), or null when the caller has none.
// Single source of truth for the resolution the app shell, the /projects
// index, /api/v1/me, and the project-detail lookups all share.
export function resolveActiveWorkspaceId(
  cookieValue: string | null | undefined,
  visibleWorkspaceIds: readonly string[],
): string | null {
  if (cookieValue && visibleWorkspaceIds.includes(cookieValue)) {
    return cookieValue;
  }
  return visibleWorkspaceIds[0] ?? null;
}
