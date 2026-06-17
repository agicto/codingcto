import { NextRequest } from 'next/server';

import { getSessionPayload } from '@/features/auth/server/session';

export async function GET(request: NextRequest) {
  const session = await getSessionPayload();
  if (!session?.apiAccessToken) {
    return Response.json({ message: 'Authentication required' }, { status: 401 });
  }

  const searchParams = request.nextUrl.searchParams;
  const repositoryId = searchParams.get('repository_id')?.trim() || '<repository-id>';
  const apiTarget = process.env.LUAS_API_PROXY_TARGET ?? 'http://localhost:2010';
  const apiBaseURL = new URL('/v1', apiTarget).toString().replace(/\/$/, '');
  const workspaceRoot = process.cwd().replace(/\/web$/, '');
  const repoDir = process.env.CODINGCTO_RUNTIME_REPO_DIR ?? `${workspaceRoot}`;
  const runtimeId = `local-${repositoryId.replace(/[^a-zA-Z0-9_-]+/g, '-').replace(/^-+|-+$/g, '') || 'codingcto'}`;
  const command = [
    `cd ${shellQuote(repoDir)}`,
    'ccto up',
  ].join('\n');

  return Response.json({
    api_base_url: apiBaseURL,
    api_dir: `${workspaceRoot}/api`,
    repo_dir: repoDir,
    runtime_id: runtimeId,
    repository_id: repositoryId,
    command,
  });
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
