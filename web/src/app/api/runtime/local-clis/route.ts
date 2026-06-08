import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { getSessionPayload } from '@/features/auth/server/session';

const execFileAsync = promisify(execFile);

const candidates = [
  { id: 'codex_cli', label: 'Codex CLI', command: 'codex' },
  { id: 'claude', label: 'Claude Code', command: 'claude' },
  { id: 'github_copilot', label: 'GitHub Copilot CLI', command: 'copilot' },
  { id: 'gemini', label: 'Gemini CLI', command: 'gemini' },
  { id: 'opencode', label: 'OpenCode', command: 'opencode' },
  { id: 'openclaw', label: 'OpenClaw', command: 'openclaw' },
  { id: 'cursor_agent', label: 'Cursor Agent', command: 'cursor-agent' },
  { id: 'kimi', label: 'Kimi CLI', command: 'kimi' },
  { id: 'kiro', label: 'Kiro CLI', command: 'kiro' },
];

export async function GET() {
  const session = await getSessionPayload();
  if (!session?.apiAccessToken) {
    return Response.json({ message: 'Authentication required' }, { status: 401 });
  }

  const clis = await Promise.all(candidates.map(detectCLI));
  return Response.json({ clis });
}

async function detectCLI(candidate: (typeof candidates)[number]) {
  const path = await resolveCommand(candidate.command);
  const version = path ? await resolveVersion(path) : '';
  return {
    ...candidate,
    available: Boolean(path),
    path,
    version,
  };
}

async function resolveCommand(command: string) {
  try {
    const { stdout } = await execFileAsync('/bin/zsh', ['-lc', `command -v ${shellQuote(command)}`], {
      timeout: 2000,
    });
    return stdout.trim().split('\n')[0] ?? '';
  } catch {
    return '';
  }
}

async function resolveVersion(path: string) {
  try {
    const { stdout, stderr } = await execFileAsync('/bin/zsh', ['-lc', `${shellQuote(path)} --version`], {
      timeout: 2000,
    });
    return (stdout || stderr).trim().split('\n')[0] ?? '';
  } catch {
    return '';
  }
}

function shellQuote(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
}
