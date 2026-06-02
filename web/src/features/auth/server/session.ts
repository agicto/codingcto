import { cookies } from 'next/headers';

import { authConfig } from '@/config/auth';
import { isProd } from '@/config/env';
import { signSession, verifySession } from '@/lib/session-signing';
import type { AuthUser } from '@/features/auth/types';
import {
  parseSignedSessionPayload,
  type SessionPayload,
} from '@/features/auth/server/session-payload';

/**
 * Session helpers — MOCK SCHEME.
 *
 * The cookie value is `base64url(payload).base64url(hmac)` where the
 * payload is JSON of the user record plus an issued-at + expiry. The
 * server can't revoke individual sessions (no backend store) — that's
 * the trade-off of staying mock-only. Drop these in favor of opaque
 * tokens issued by your real backend before going to production.
 */

export async function getSessionUser(): Promise<AuthUser | null> {
  const parsed = await getSessionPayload();
  if (!parsed) return null;

  // Strip server-only fields before handing it back as AuthUser.
  const { iat: _iat, exp: _exp, apiAccessToken: _apiAccessToken, ...user } = parsed;
  void _iat;
  void _exp;
  void _apiAccessToken;
  return user;
}

export async function getSessionPayload(): Promise<SessionPayload | null> {
  const cookieStore = await cookies();
  const raw = cookieStore.get(authConfig.cookies.session)?.value;
  return parseSignedSessionPayload(await verifySession(raw));
}

export async function setSessionCookie(
  user: AuthUser,
  options: { apiAccessToken?: string } = {}
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  const payload: SessionPayload = {
    ...user,
    iat: now,
    exp: now + authConfig.sessionMaxAge,
    apiAccessToken: options.apiAccessToken,
  };
  const signed = await signSession(JSON.stringify(payload));

  const cookieStore = await cookies();
  cookieStore.set({
    name: authConfig.cookies.session,
    value: signed,
    httpOnly: true,
    sameSite: 'lax',
    secure: isProd,
    path: '/',
    maxAge: authConfig.sessionMaxAge,
  });
}

export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(authConfig.cookies.session);
}
