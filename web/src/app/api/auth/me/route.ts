import { NextResponse } from 'next/server';
import {
  clearSessionCookie,
  getSessionPayload,
  getSessionUser,
} from '@/features/auth/server/session';
import { ErrorCode } from '@/http/codes';

export async function GET() {
  if (process.env.LUAS_AUTH_BACKEND_ENABLED === 'true') {
    const payload = await getSessionPayload();
    if (!payload?.apiAccessToken) {
      await clearSessionCookie();

      return NextResponse.json(
        {
          error: 'Backend session required',
          code: ErrorCode.SESSION_EXPIRED,
        },
        { status: 401 }
      );
    }
  }

  const user = await getSessionUser();

  if (!user) {
    await clearSessionCookie();

    return NextResponse.json(
      {
        error: 'Session expired',
        code: ErrorCode.SESSION_EXPIRED,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    data: {
      user,
    },
  });
}
