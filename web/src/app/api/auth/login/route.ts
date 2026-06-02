import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authConfig } from '@/config/auth';
import { setSessionCookie } from '@/features/auth/server/session';
import { ErrorCode } from '@/http/codes';
import type { AuthUser } from '@/features/auth/types';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

interface BackendLoginResponse {
  data?: {
    access_token?: string;
    user?: {
      id?: number | string;
      email?: string;
      username?: string;
      nickname?: string;
    };
  };
  message?: string;
}

export async function POST(request: Request) {
  const payload = await request.json().catch(() => null);
  const parsed = loginSchema.safeParse(payload);

  if (!parsed.success) {
    return NextResponse.json(
      {
        error: 'Invalid login payload',
        code: ErrorCode.INVALID_PARAMS,
      },
      { status: 400 }
    );
  }

  const { email, password } = parsed.data;
  if (process.env.LUAS_AUTH_BACKEND_ENABLED === 'true') {
    return loginWithBackend(email, password);
  }

  const { demoUser } = authConfig;

  if (email !== demoUser.email || password !== demoUser.password) {
    return NextResponse.json(
      {
        error: 'Invalid email or password',
        code: ErrorCode.INVALID_CREDENTIALS,
      },
      { status: 401 }
    );
  }

  const user = {
    id: demoUser.id,
    email: demoUser.email,
    name: demoUser.name,
    role: demoUser.role,
  };

  await setSessionCookie(user);

  return NextResponse.json({
    data: {
      user,
      session: {
        mode: 'mock',
        projectApiReady: false,
      },
    },
  });
}

async function loginWithBackend(email: string, password: string) {
  const apiTarget = process.env.LUAS_API_PROXY_TARGET ?? 'http://localhost:2010';
  const response = await fetch(`${apiTarget}/v1/login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      username: email,
      password,
    }),
  });
  const body = (await response.json().catch(() => null)) as BackendLoginResponse | null;
  const token = body?.data?.access_token;
  const backendUser = body?.data?.user;

  if (!response.ok || !token || !backendUser) {
    return NextResponse.json(
      {
        error: body?.message ?? 'Invalid email or password',
        code: ErrorCode.INVALID_CREDENTIALS,
      },
      { status: response.status === 401 ? 401 : 502 }
    );
  }

  const user: AuthUser = {
    id: String(backendUser.id ?? email),
    email: backendUser.email ?? email,
    name: backendUser.nickname || backendUser.username || backendUser.email || email,
    role: 'admin',
  };

  await setSessionCookie(user, { apiAccessToken: token });

  return NextResponse.json({
    data: {
      user,
      session: {
        mode: 'backend',
        projectApiReady: true,
      },
    },
  });
}
