import { afterEach, describe, expect, it, vi } from 'vitest';
import type { NextRequest } from 'next/server';

import {
  buildAPIRequestHeaders,
  buildAPIURL,
  proxyAPIRequest,
} from '@/features/auth/server/api-proxy';
import { signSession } from '@/lib/session-signing';

describe('SpecForge API proxy', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('builds a backend v1 URL with query params', () => {
    process.env.LUAS_API_PROXY_TARGET = 'http://127.0.0.1:2010';
    const request = new Request(
      'http://localhost:2020/v1/repositories/repo_123/ideas?include=plan'
    );

    const url = buildAPIURL(request, ['repositories', 'repo_123', 'ideas']);

    expect(url.toString()).toBe(
      'http://127.0.0.1:2010/v1/repositories/repo_123/ideas?include=plan'
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
      url: 'http://localhost:2020/v1/repositories/repo_123/ideas',
      headers: new Headers({
        cookie: `luas_session=${session}`,
        host: 'localhost:2020',
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

  it('returns a structured 503 when the upstream API is unavailable', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('connect ECONNREFUSED'));

    const request = {
      method: 'GET',
      url: 'http://localhost:2020/v1/projects',
      headers: new Headers(),
      cookies: {
        get: () => undefined,
      },
    } as unknown as NextRequest;

    const response = await proxyAPIRequest(request, ['projects']);
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body).toEqual({
      code: 'UPSTREAM_UNAVAILABLE',
      message: 'API upstream is unavailable',
    });
  });
});
