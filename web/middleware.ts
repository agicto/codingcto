import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

import { authConfig } from '@/config/auth';
import { parseSignedSessionPayload } from '@/features/auth/server/session-payload';
import { verifySession } from '@/lib/session-signing';

function matchesPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

function isProtectedPath(pathname: string): boolean {
  return authConfig.protectedRoutes.some(route => matchesPrefix(pathname, route));
}

function isPublicOnlyPath(pathname: string): boolean {
  return authConfig.publicOnlyRoutes.some(route => matchesPrefix(pathname, route));
}

/**
 * Verify the session cookie cryptographically — defense in depth.
 *
 * Without this check, a client could forge a cookie just to bypass
 * middleware and reach the protected page (the RSC layout would still
 * reject them, but the request would land on app code). By verifying
 * the HMAC here we short-circuit invalid sessions at the edge.
 *
 * Returns a session payload only when the cookie is present AND signed
 * correctly AND not expired.
 */
async function getSessionPayload(request: NextRequest) {
  const raw = request.cookies.get(authConfig.cookies.session)?.value;
  if (!raw) return null;
  const payload = await verifySession(raw);
  return parseSignedSessionPayload(payload);
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const session = await getSessionPayload(request);
  const valid = Boolean(session);

  if (!valid && isProtectedPath(pathname)) {
    const loginUrl = new URL(authConfig.routes.login, request.url);
    loginUrl.searchParams.set('returnUrl', `${pathname}${search}`);
    return NextResponse.redirect(loginUrl);
  }

  if (valid && isPublicOnlyPath(pathname)) {
    return NextResponse.redirect(new URL(authConfig.routes.afterLogin, request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/console/:path*', '/styleguide/:path*', '/i18n-test/:path*', '/login', '/register'],
};
