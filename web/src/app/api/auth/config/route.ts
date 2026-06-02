import { NextResponse } from 'next/server';

export async function GET() {
  const backendAuthEnabled = process.env.LUAS_AUTH_BACKEND_ENABLED === 'true';

  return NextResponse.json({
    data: {
      backendAuthEnabled,
      projectApiReady: backendAuthEnabled,
    },
  });
}
