import { describe, expect, it } from 'vitest';
import type { NextRequest } from 'next/server';

import { buildAPIRequestHeaders, buildAPIURL } from '@/features/auth/server/api-proxy';
import { signSession } from '@/lib/session-signing';

describe('SpecForge API proxy', () => {
  it('builds a backend v1 URL with query params', () => {
    process.env.LUAS_API_PROXY_TARGET = 'http://127.0.0.1:8025';
    const request = new Request(
      'http://localhost:3000/v1/repositories/repo_123/ideas?include=plan'
    );

    const url = buildAPIURL(request, ['repositories', 'repo_123', 'ideas']);

    expect(url.toString()).toBe(
      'http://127.0.0.1:8025/v1/repositories/repo_123/ideas?include=plan'
    );
  });

  it('injects the backend JWT from the signed session cookie', async () => {
    const session = await signSession(
      JSON.stringify({
        id: '2',
        email: 'specforge@example.com',
        name: 'SpecForge Admin',
        role: 'admin',
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 60,
        apiAccessToken: 'backend-jwt',
      })
    );

    const request = {
      method: 'GET',
      url: 'http://localhost:3000/v1/repositories/repo_123/ideas',
      headers: new Headers({
        cookie: `luas_session=${session}`,
        host: 'localhost:3000',
      }),
      cookies: {
        get: () => undefined,
      },
    } as unknown as NextRequest;

    const headers = await buildAPIRequestHeaders(request);

    expect(headers.get('authorization')).toBe('Bearer backend-jwt');
    expect(headers.has('host')).toBe(false);
    expect(headers.has('cookie')).toBe(false);
  });
});
