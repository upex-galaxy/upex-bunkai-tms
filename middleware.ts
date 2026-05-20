import type { NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { NextResponse } from 'next/server';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

const PROTECTED_PREFIXES = ['/projects'];
const PUBLIC_PREFIXES = ['/login', '/auth', '/api/auth'];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isPublic(pathname: string): boolean {
  return PUBLIC_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        // Write back to both the incoming request (so downstream handlers
        // see the refreshed session) and the outgoing response (so the
        // browser stores it).
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        response = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  // IMPORTANT: do not run any logic between createServerClient and getUser;
  // doing so risks the session not being refreshed before route logic runs.
  const { data: { user } } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;

  if (!isPublic(pathname) && isProtected(pathname) && !user) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname + request.nextUrl.search);
    return NextResponse.redirect(loginUrl);
  }

  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
