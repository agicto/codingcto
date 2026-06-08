import { execFile } from 'node:child_process';
import { dirname, basename } from 'node:path';
import { promisify } from 'node:util';

import { getSessionPayload } from '@/features/auth/server/session';

const execFileAsync = promisify(execFile);
const codexStatePath = '/Users/stark/.codex/state_5.sqlite';

interface CodexThreadRow {
  id: string;
  title: string;
  cwd: string;
  git_branch?: string;
  updated_at_ms?: number;
  source?: string;
  preview?: string;
}

export async function GET(request: Request) {
  const session = await getSessionPayload();
  if (!session?.apiAccessToken) {
    return Response.json({ message: 'Authentication required' }, { status: 401 });
  }

  const url = new URL(request.url);
  const limit = clampNumber(Number(url.searchParams.get('limit') ?? 80), 10, 160);
  const currentCwd = normalizedCurrentCwd(url.searchParams.get('cwd'));

  const rows = await readCodexThreads(limit);
  const projects = groupThreadsByProject(rows, currentCwd);

  return Response.json({
    current_cwd: currentCwd,
    projects,
  });
}

async function readCodexThreads(limit: number) {
  const query = `
    select id, title, cwd, git_branch, updated_at_ms, source, preview
    from threads
    where archived = 0 and cwd != ''
    order by updated_at_ms desc
    limit ${limit};
  `;
  try {
    const { stdout } = await execFileAsync('/usr/bin/sqlite3', ['-json', codexStatePath, query], {
      timeout: 3000,
      maxBuffer: 4 * 1024 * 1024,
    });
    return JSON.parse(stdout || '[]') as CodexThreadRow[];
  } catch {
    return [];
  }
}

function groupThreadsByProject(rows: CodexThreadRow[], currentCwd: string) {
  const groups = new Map<
    string,
    {
      id: string;
      name: string;
      path: string;
      current: boolean;
      updated_at: string;
      threads: Array<{
        id: string;
        title: string;
        preview: string;
        branch: string;
        source: string;
        updated_at: string;
      }>;
    }
  >();

  for (const row of rows) {
    const cwd = row.cwd?.trim();
    if (!cwd) {
      continue;
    }
    const updatedAtMs = Number(row.updated_at_ms || 0);
    const updatedAt = Number.isFinite(updatedAtMs) && updatedAtMs > 0
      ? new Date(updatedAtMs).toISOString()
      : '';
    const existing = groups.get(cwd);
    const group =
      existing ??
      {
        id: cwd,
        name: basename(cwd) || cwd,
        path: cwd,
        current: cwd === currentCwd,
        updated_at: updatedAt,
        threads: [],
      };

    if (updatedAt && (!group.updated_at || updatedAt > group.updated_at)) {
      group.updated_at = updatedAt;
    }
    if (group.threads.length < 6) {
      group.threads.push({
        id: row.id,
        title: compactThreadTitle(row.title || row.preview || 'Untitled'),
        preview: truncateText(compactText(row.preview || row.title || ''), 180),
        branch: row.git_branch || '',
        source: row.source || '',
        updated_at: updatedAt,
      });
    }
    groups.set(cwd, group);
  }

  return [...groups.values()]
    .filter(group => group.threads.length > 0)
    .sort((a, b) => {
      if (a.current !== b.current) {
        return a.current ? -1 : 1;
      }
      return b.updated_at.localeCompare(a.updated_at);
    })
    .slice(0, 8);
}

function compactThreadTitle(value: string) {
  const singleLine = compactText(value);
  const directTask = singleLine.match(/Task title:\s*(.+?)(?:\s+User request:|$)/);
  const title = directTask?.[1] || singleLine;
  return truncateText(title, 36);
}

function compactText(value: string) {
  return redactSensitiveText(value).replace(/\s+/g, ' ').trim();
}

function redactSensitiveText(value: string) {
  return value
    .replace(
      /(\b\d{1,3}(?:\.\d{1,3}){3}\b)\s+\S+\s+\b(root|ubuntu|admin)\b/gi,
      '$1 [redacted] $2'
    )
    .replace(
      /\b(root|ubuntu|admin)\s+([^\s"'`]{6,})/gi,
      (_match, user: string) => `${user} [redacted]`
    )
    .replace(/([?&](?:token|key|password|secret|access_token)=)[^&\s]+/gi, '$1[redacted]');
}

function truncateText(value: string, max: number) {
  return value.length > max ? `${value.slice(0, Math.max(0, max - 2))}...` : value;
}

function normalizedCurrentCwd(value: string | null) {
  const explicit = value?.trim();
  if (explicit) {
    return explicit;
  }
  const cwd = process.cwd();
  return basename(cwd) === 'web' ? dirname(cwd) : cwd;
}

function clampNumber(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}
