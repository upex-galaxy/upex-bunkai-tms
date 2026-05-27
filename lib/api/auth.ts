import type { NextRequest } from 'next/server';
import { ApiError } from '@lib/api/error-envelope';
import { requireBearerToken } from '@lib/api/middleware/bearer';
import { createClient } from '@lib/supabase/server';
import 'server-only';

// Dual-mode auth helper for /api/v1 routes. Browser callers send the Supabase
// session cookie; CLI / agent callers send `Authorization: Bearer bk_pat_*`.
// We check Bearer first so a stale cookie does not shadow an explicit PAT
// passed by the caller.

export interface ApiAuthContext {
  userId: string
  source: 'cookie' | 'bearer'
  scopes: string[]
  tokenId: string | null
  workspaceId: string | null
}

export async function requireAuth(request: NextRequest): Promise<ApiAuthContext> {
  const authHeader = request.headers.get('authorization') ?? request.headers.get('Authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = await requireBearerToken(request);
    return {
      userId: bearer.userId,
      source: 'bearer',
      scopes: bearer.scopes,
      tokenId: bearer.tokenId,
      workspaceId: bearer.workspaceId,
    };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new ApiError('unauthorized', 'Authentication required.');
  }
  return {
    userId: user.id,
    source: 'cookie',
    // Cookie sessions are unscoped — RLS is the only constraint. Endpoints
    // that need to gate writes by Bearer scope must do so explicitly with
    // `requireScopeOr(ctx, scope)` (Bearer-only) instead of pretending
    // session has every scope.
    scopes: [],
    tokenId: null,
    workspaceId: null,
  };
}

// Helper: require a scope only when the auth came via Bearer. Cookie sessions
// pass through (the browser user is the principal; UI gates already filter).
export function requireScopeOrCookie(ctx: ApiAuthContext, scope: string): void {
  if (ctx.source === 'cookie') {
    return;
  }
  if (!ctx.scopes.includes(scope)) {
    throw new ApiError('forbidden', `Token missing required scope: ${scope}`);
  }
}
