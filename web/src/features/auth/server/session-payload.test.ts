import { describe, expect, it } from 'vitest';

import { parseSignedSessionPayload } from '@/features/auth/server/session-payload';

describe('parseSignedSessionPayload', () => {
  it('keeps the backend API token inside the server session payload', () => {
    const exp = Math.floor(Date.now() / 1000) + 60;

    const parsed = parseSignedSessionPayload(
      JSON.stringify({
        id: '1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        iat: exp - 30,
        exp,
        apiAccessToken: 'jwt-token',
      })
    );

    expect(parsed?.apiAccessToken).toBe('jwt-token');
  });

  it('rejects expired session payloads', () => {
    const exp = Math.floor(Date.now() / 1000) - 1;

    const parsed = parseSignedSessionPayload(
      JSON.stringify({
        id: '1',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        iat: exp - 30,
        exp,
      })
    );

    expect(parsed).toBeNull();
  });
});
