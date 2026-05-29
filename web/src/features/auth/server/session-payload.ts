import type { AuthUser } from '@/features/auth/types';

export type SessionPayload = AuthUser & {
  iat: number;
  exp: number;
  apiAccessToken?: string;
};

export function parseSignedSessionPayload(payload: string | null): SessionPayload | null {
  if (!payload) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!isSessionPayload(parsed)) return null;
  if (parsed.exp <= Math.floor(Date.now() / 1000)) return null;

  return parsed;
}

function isSessionPayload(value: unknown): value is SessionPayload {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === 'string' &&
    typeof v.email === 'string' &&
    typeof v.name === 'string' &&
    typeof v.role === 'string' &&
    typeof v.iat === 'number' &&
    typeof v.exp === 'number' &&
    (typeof v.apiAccessToken === 'undefined' || typeof v.apiAccessToken === 'string')
  );
}
