import type { NextRequest } from 'next/server';

import { authConfig } from '@/config/auth';
import { parseSignedSessionPayload } from '@/features/auth/server/session-payload';
import { verifySession } from '@/lib/session-signing';

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'content-encoding',
  'content-length',
  'host',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

const METHODS_WITHOUT_BODY = new Set(['GET', 'HEAD']);

export async function proxyAPIRequest(request: NextRequest, path: string[]): Promise<Response> {
  const apiURL = buildAPIURL(request, path);
  const headers = await buildAPIRequestHeaders(request);
  const method = request.method.toUpperCase();
  const body = METHODS_WITHOUT_BODY.has(method) ? undefined : await request.arrayBuffer();

  let response: globalThis.Response;
  try {
    response = await fetch(apiURL, {
      method,
      headers,
      body,
      redirect: 'manual',
    });
  } catch {
    return Response.json(
      {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'API upstream is unavailable',
      },
      { status: 503 }
    );
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: buildAPIResponseHeaders(response.headers),
  });
}

export function buildAPIURL(request: Request, path: string[]): URL {
  const sourceURL = new URL(request.url);
  const apiTarget = process.env.LUAS_API_PROXY_TARGET ?? 'http://localhost:8025';
  const targetURL = new URL(`/v1/${path.map(encodeURIComponent).join('/')}`, apiTarget);
  targetURL.search = sourceURL.search;
  return targetURL;
}

export async function buildAPIRequestHeaders(request: NextRequest): Promise<Headers> {
  const headers = new Headers();

  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers.set(key, value);
    }
  });
  headers.delete('cookie');

  if (!headers.has('authorization')) {
    const token = await getSessionAPIAccessToken(request);
    if (token) {
      headers.set('authorization', `Bearer ${token}`);
    }
  }

  return headers;
}

function buildAPIResponseHeaders(source: Headers): Headers {
  const headers = new Headers();

  source.forEach((value, key) => {
    const normalizedKey = key.toLowerCase();
    if (HOP_BY_HOP_HEADERS.has(normalizedKey) || normalizedKey === 'set-cookie') {
      return;
    }
    headers.set(key, value);
  });

  return headers;
}

async function getSessionAPIAccessToken(request: NextRequest): Promise<string | null> {
  const raw =
    request.cookies.get(authConfig.cookies.session)?.value ?? getCookieFromHeader(request);
  if (!raw) return null;

  const payload = parseSignedSessionPayload(await verifySession(raw));
  return payload?.apiAccessToken ?? null;
}

function getCookieFromHeader(request: Request): string | null {
  const cookieHeader = request.headers.get('cookie');
  if (!cookieHeader) return null;

  for (const cookie of cookieHeader.split(';')) {
    const [name, ...valueParts] = cookie.trim().split('=');
    if (name === authConfig.cookies.session) {
      return valueParts.join('=') || null;
    }
  }

  return null;
}
