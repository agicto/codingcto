import type { NextRequest } from 'next/server';

import { proxyAPIRequest } from '@/features/auth/server/api-proxy';

type RouteContext = {
  params: Promise<{
    path: string[];
  }>;
};

async function handle(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path } = await context.params;
  return proxyAPIRequest(request, path);
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
