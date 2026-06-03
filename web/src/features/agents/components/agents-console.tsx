'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronRight,
  Circle,
  Clock3,
  ClipboardList,
  Folder,
  GitBranch,
  Loader2,
  Play,
  RefreshCw,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ROUTES } from '@/constants/routes';
import {
  useCodingCTODirectAgentTasks,
  useCodingCTODirectTaskEvents,
  useCodingCTORuntimes,
  useCreateCodingCTODirectAgentTask,
} from '@/features/codingcto/hooks/use-codingcto';
import type {
  CodingCTODirectAgentTaskDTO,
  CodingCTODirectTaskEventDTO,
  CodingCTORuntimeDTO,
} from '@/features/codingcto/services/codingcto-service';
import { cn } from '@/utils';

interface CodingCliDefinition {
  id: string;
  label: string;
  command: string;
  executor?: string;
  iconLabel: string;
  iconClassName: string;
}

interface CodingCliItem extends CodingCliDefinition {
  detected: boolean;
  dispatchable: boolean;
  source: 'runtime' | 'local' | 'none';
  version?: string;
  path?: string;
  runtimeId?: string;
  hostname?: string;
  lastSeenAt?: string;
}

interface LocalCliProbeItem {
  id: string;
  label: string;
  command: string;
  available: boolean;
  path?: string;
  version?: string;
}

interface DaemonCommandDefinition {
  title: string;
  description: string;
  command: string;
}

interface CodexHistoryThread {
  id: string;
  title: string;
  preview: string;
  branch: string;
  source: string;
  updated_at: string;
}

interface CodexHistoryProject {
  id: string;
  name: string;
  path: string;
  current: boolean;
  updated_at: string;
  threads: CodexHistoryThread[];
}

const ONLINE_RUNTIME_STALE_MS = 5 * 60 * 1000;

const daemonCommandDefinitions: DaemonCommandDefinition[] = [
  {
    title: 'Codex CLI runtime',
    description: '启动后会让 Codex CLI 显示为可调度。',
    command: [
      'cd api',
      'export CODINGCTO_RUNTIME_TOKEN="<runtime-token>"',
      'export CODINGCTO_RUNTIME_REPO_DIR="$(cd .. && pwd)"',
      'go run ./cmd/ccto daemon \\',
      '  --api-base-url http://localhost:2010/v1 \\',
      '  --runtime-id local-codingcto \\',
      '  --executor codex_cli \\',
      '  --codex-path codex',
    ].join('\n'),
  },
  {
    title: 'Claude Code runtime',
    description: '启动后会让 Claude Code 显示为可调度。',
    command: [
      'cd api',
      'export CODINGCTO_RUNTIME_TOKEN="<runtime-token>"',
      'export CODINGCTO_RUNTIME_REPO_DIR="$(cd .. && pwd)"',
      'go run ./cmd/ccto daemon \\',
      '  --api-base-url http://localhost:2010/v1 \\',
      '  --runtime-id local-codingcto-claude \\',
      '  --executor claude_code_cli \\',
      '  --claude-path claude',
    ].join('\n'),
  },
];

const codingCliDefinitions: CodingCliDefinition[] = [
  {
    id: 'codex_cli',
    label: 'Codex CLI',
    command: 'codex',
    executor: 'codex_cli',
    iconLabel: 'Cx',
    iconClassName: 'bg-[#111827] text-white',
  },
  {
    id: 'claude_code_cli',
    label: 'Claude Code',
    command: 'claude',
    executor: 'claude_code_cli',
    iconLabel: 'Cl',
    iconClassName: 'bg-[#d97757] text-white',
  },
  {
    id: 'github_copilot',
    label: 'GitHub Copilot CLI',
    command: 'copilot',
    iconLabel: 'Co',
    iconClassName: 'bg-[#24292f] text-white',
  },
  {
    id: 'gemini',
    label: 'Gemini CLI',
    command: 'gemini',
    iconLabel: 'G',
    iconClassName: 'bg-[#4285f4] text-white',
  },
  {
    id: 'opencode',
    label: 'OpenCode',
    command: 'opencode',
    iconLabel: 'OC',
    iconClassName: 'bg-[#2563eb] text-white',
  },
  {
    id: 'openclaw',
    label: 'OpenClaw',
    command: 'openclaw',
    iconLabel: 'Ow',
    iconClassName: 'bg-[#7c3aed] text-white',
  },
  {
    id: 'cursor_agent',
    label: 'Cursor Agent',
    command: 'cursor-agent',
    iconLabel: 'Cu',
    iconClassName: 'bg-[#0f172a] text-white',
  },
  {
    id: 'kimi',
    label: 'Kimi CLI',
    command: 'kimi',
    iconLabel: 'Ki',
    iconClassName: 'bg-[#0891b2] text-white',
  },
  {
    id: 'kiro',
    label: 'Kiro CLI',
    command: 'kiro',
    iconLabel: 'Kr',
    iconClassName: 'bg-[#be123c] text-white',
  },
];

function safeConsoleReturnHref(value: string | null) {
  const trimmed = value?.trim() ?? '';
  if (!trimmed.startsWith('/console/')) {
    return undefined;
  }
  if (trimmed.startsWith('//') || trimmed.includes('://')) {
    return undefined;
  }
  return trimmed;
}

function defaultRepositoryIdFromReturnHref(returnHref: string) {
  const parts = returnHref.split('/').filter(Boolean);
  const projectSlug = parts.at(-1);
  if (projectSlug && projectSlug !== 'codingcto' && !/^\d+$/.test(projectSlug)) {
    return projectSlug;
  }
  return 'codingcto';
}

export function AgentsConsole() {
  const searchParams = useSearchParams();
  const returnHref = safeConsoleReturnHref(searchParams.get('return_to')) ?? ROUTES.CONSOLE.SPECFORGE;
  const runtimesQuery = useCodingCTORuntimes({ status: 'online', limit: 50 });
  const refetchRuntimes = runtimesQuery.refetch;
  const runtimes = useMemo(
    () => runtimesQuery.data?.runtimes ?? [],
    [runtimesQuery.data?.runtimes]
  );
  const [localCliProbe, setLocalCliProbe] = useState<LocalCliProbeItem[]>([]);
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setRuntimeNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refetchRuntimes();
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [refetchRuntimes]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/runtime/local-clis')
      .then(response => (response.ok ? response.json() : null))
      .then((payload: { clis?: LocalCliProbeItem[] } | null) => {
        if (!cancelled) {
          setLocalCliProbe(payload?.clis ?? []);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLocalCliProbe([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const cliItems = useMemo(
    () => codingCliItemsFromRuntimes(runtimes, runtimeNow, localCliProbe),
    [localCliProbe, runtimeNow, runtimes]
  );
  const detectedCount = cliItems.filter(item => item.detected).length;
  const dispatchableCount = cliItems.filter(item => item.dispatchable).length;
  const onlineRuntimeCount = runtimes.filter(runtime => isFreshOnlineRuntime(runtime, runtimeNow)).length;

  return (
    <div className="flex h-full flex-col bg-bg-surface">
      <AgentsHeader
        title="Coding Agent"
        subtitle="本机 CLI、runtime 心跳和调度入口。"
        returnHref={returnHref}
        badges={[
          `${detectedCount} CLI`,
          `${onlineRuntimeCount} runtime`,
          `${dispatchableCount} 可调度`,
        ]}
      />

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <section className="mx-auto w-full max-w-5xl">
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-text-main">本地 Coding CLI</h2>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                ccto daemon 上报 runtime；本机 fallback 只证明已安装，不代表能被平台调度。
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void runtimesQuery.refetch()}
            >
              <RefreshCw className="h-4 w-4" />
              刷新
            </Button>
          </div>

          <div className="overflow-hidden rounded-md border border-border-subtle bg-bg-surface">
            <div className="grid grid-cols-[1fr_auto] gap-3 border-b border-border-subtle bg-bg-subtle px-3 py-2 text-xs font-medium text-text-muted md:grid-cols-[1.5fr_1fr_1fr_auto]">
              <span>CLI</span>
              <span className="hidden md:block">来源</span>
              <span className="hidden md:block">Runtime</span>
              <span>状态</span>
            </div>
            {runtimesQuery.isLoading ? (
              <div className="flex items-center gap-2 px-3 py-6 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                正在检测本地 CLI...
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {cliItems.map(item => (
                  <CodingCliRow key={item.id} item={item} returnHref={returnHref} />
                ))}
              </div>
            )}
          </div>

          <div className="mt-4 rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="text-xs font-medium text-text-main">启动 ccto daemon</div>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              一个 daemon 对应一个 executor runtime；保持终端运行，页面会在 heartbeat 后把对应 CLI
              标成可调度。
            </p>
            <div className="mt-3 grid gap-3 lg:grid-cols-2">
              {daemonCommandDefinitions.map(command => (
                <DaemonCommandBlock key={command.title} command={command} />
              ))}
            </div>
          </div>

          <div className="mt-4 rounded-md border border-border-subtle bg-bg-subtle p-3">
            <div className="text-xs font-medium text-text-main">调度协议</div>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              ccto daemon 每 5-10 秒 heartbeat；API 发现 direct task 后返回 claim；
              daemon 用对应 executor 调 CLI，并把事件和结果回写到 agent task。
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}

export function AgentDispatchConsole() {
  const params = useParams<{ agentId?: string }>();
  const searchParams = useSearchParams();
  const returnHref = safeConsoleReturnHref(searchParams.get('return_to')) ?? '/console/agents';
  const agentId = normalizeCliId(params.agentId ?? 'codex_cli');
  const agent = codingCliDefinitions.find(item => item.id === agentId) ?? codingCliDefinitions[0];
  const runtimesQuery = useCodingCTORuntimes({ status: 'online', limit: 50 });
  const refetchRuntimes = runtimesQuery.refetch;
  const runtimes = useMemo(
    () => runtimesQuery.data?.runtimes ?? [],
    [runtimesQuery.data?.runtimes]
  );
  const [runtimeNow, setRuntimeNow] = useState(() => Date.now());
  const dispatchRuntime = useMemo(
    () => findDispatchRuntime(runtimes, runtimeNow, agent),
    [agent, runtimeNow, runtimes]
  );
  const [repositoryId, setRepositoryId] = useState(() => defaultRepositoryIdFromReturnHref(returnHref));
  const [prompt, setPrompt] = useState(
    '请只读验证当前仓库可访问性：返回当前工作目录、git status --short 摘要、可用 CLI 摘要；不要修改文件。'
  );
  const [error, setError] = useState('');
  const [historyProjects, setHistoryProjects] = useState<CodexHistoryProject[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const createTask = useCreateCodingCTODirectAgentTask();
  const tasksQuery = useCodingCTODirectAgentTasks({
    repository_id: repositoryId.trim() || undefined,
    executor: agent.executor,
    runtime_id: dispatchRuntime?.runtime_id,
    limit: 8,
  });
  const latestTask = tasksQuery.data?.tasks?.[0];
  const eventsQuery = useCodingCTODirectTaskEvents(latestTask?.id);
  const events = eventsQuery.data?.events ?? [];
  const canDispatch = Boolean(agent.executor && dispatchRuntime);

  useEffect(() => {
    const timer = window.setInterval(() => setRuntimeNow(Date.now()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void refetchRuntimes();
    }, 3_000);
    return () => window.clearInterval(timer);
  }, [refetchRuntimes]);

  useEffect(() => {
    if (agent.id !== 'codex_cli') {
      setHistoryProjects([]);
      return;
    }
    void loadCodexHistory();
  }, [agent.id]);

  async function loadCodexHistory() {
    setHistoryLoading(true);
    try {
      const response = await fetch('/api/runtime/codex-history?limit=120');
      const payload = (await response.json()) as { projects?: CodexHistoryProject[] };
      setHistoryProjects(payload.projects ?? []);
    } catch {
      setHistoryProjects([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function runDirectTask() {
    setError('');
    if (!canDispatch || !dispatchRuntime || !agent.executor) {
      setError('当前 CLI 没有可用 runtime 执行器。');
      return;
    }
    if (!repositoryId.trim()) {
      setError('Repository id 不能为空。');
      return;
    }
    if (!prompt.trim()) {
      setError('请输入要调度给 CLI 的任务。');
      return;
    }

    try {
      await createTask.mutateAsync({
        repository_id: repositoryId.trim(),
        title: `${agent.label} direct test`,
        prompt: prompt.trim(),
        executor: agent.executor,
        runtime_id: dispatchRuntime.runtime_id,
      });
      void tasksQuery.refetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建调度任务失败。');
    }
  }

  return (
    <div className="flex h-full flex-col bg-bg-surface">
      <AgentsHeader
        title={agent.label}
        subtitle={`${agent.command} 直接调度测试。`}
        returnHref={returnHref}
        badges={[canDispatch ? '可调度' : '未接执行器', dispatchRuntime?.runtime_id ?? 'no runtime']}
      />

      <main className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-8">
        <section className="mx-auto grid w-full max-w-7xl gap-4 xl:grid-cols-[280px_minmax(0,1fr)_320px]">
          <CodexHistorySidebar
            agent={agent}
            projects={historyProjects}
            isLoading={historyLoading}
            onRefresh={loadCodexHistory}
          />

          <div className="rounded-md border border-border-subtle bg-bg-surface p-4">
            <div className="flex items-start gap-3">
              <AgentModelIcon item={agent} active={canDispatch} size="lg" />
              <div className="min-w-0">
                <h2 className="text-sm font-semibold text-text-main">直接调度</h2>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  创建 direct agent task；ccto daemon claim 后用本机 {agent.command} 执行，并回写事件与结果。
                </p>
              </div>
            </div>

            <div className="mt-4 grid gap-3">
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-text-muted">Repository id</span>
                <Input
                  value={repositoryId}
                  onChange={event => setRepositoryId(event.target.value)}
                  placeholder="codingcto"
                />
              </label>
              <label className="grid gap-1.5">
                <span className="text-xs font-medium text-text-muted">任务</span>
                <Textarea
                  className="min-h-36"
                  value={prompt}
                  onChange={event => setPrompt(event.target.value)}
                />
              </label>
              {error ? (
                <div className="rounded-md bg-error-subtle px-3 py-2 text-sm text-error">{error}</div>
              ) : null}
              {!canDispatch ? (
                <div className="rounded-md bg-warning-subtle px-3 py-2 text-sm leading-6 text-warning">
                  当前 CLI 没有可用 executor runtime。启动 ccto daemon 并设置{' '}
                  {agent.executor ? `--executor ${agent.executor}` : '对应 executor'} 后会开放入口。
                </div>
              ) : null}
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  onClick={runDirectTask}
                  disabled={!canDispatch || createTask.isPending}
                  loading={createTask.isPending}
                >
                  <Play className="h-4 w-4" />
                  运行测试
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    void runtimesQuery.refetch();
                    void tasksQuery.refetch();
                  }}
                >
                  <RefreshCw className="h-4 w-4" />
                  刷新状态
                </Button>
              </div>
            </div>
          </div>

          <aside className="grid gap-3 xl:self-start">
            <RuntimeStatusPanel agent={agent} runtime={dispatchRuntime} now={runtimeNow} />
            <TaskStatusPanel task={latestTask} events={events} isLoading={tasksQuery.isLoading} />
          </aside>
        </section>
      </main>
    </div>
  );
}

function DaemonCommandBlock({ command }: { command: DaemonCommandDefinition }) {
  return (
    <div className="min-w-0 rounded-md border border-border-subtle bg-bg-surface p-3">
      <div className="text-xs font-medium text-text-main">{command.title}</div>
      <p className="mt-1 text-[11px] leading-5 text-text-muted">{command.description}</p>
      <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-bg-subtle p-2 text-[11px] leading-5 text-text-muted">
        <code>{command.command}</code>
      </pre>
    </div>
  );
}

function CodexHistorySidebar({
  agent,
  projects,
  isLoading,
  onRefresh,
}: {
  agent: CodingCliDefinition;
  projects: CodexHistoryProject[];
  isLoading: boolean;
  onRefresh: () => void;
}) {
  if (agent.id !== 'codex_cli') {
    return (
      <aside className="rounded-md border border-border-subtle bg-bg-surface p-3 xl:self-start">
        <div className="text-xs font-medium text-text-main">历史项目</div>
        <p className="mt-2 text-xs leading-5 text-text-muted">这个 CLI 还没有接入本地历史同步。</p>
      </aside>
    );
  }

  return (
    <aside className="rounded-md border border-border-subtle bg-bg-surface p-3 xl:max-h-[calc(100vh-7.5rem)] xl:self-start xl:overflow-y-auto">
      <div className="flex items-center justify-between gap-2">
        <div>
          <div className="text-xs font-medium text-text-main">Codex 历史项目</div>
          <p className="mt-1 text-[11px] text-text-muted">同步本机 Codex Desktop / CLI 会话</p>
        </div>
        <Button type="button" variant="ghost" size="xs" isIcon onClick={onRefresh} loading={isLoading}>
          <RefreshCw className="h-3.5 w-3.5" />
        </Button>
      </div>

      {isLoading && projects.length === 0 ? (
        <div className="mt-4 flex items-center gap-2 text-xs text-text-muted">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          同步中...
        </div>
      ) : null}

      <div className="mt-3 grid gap-4">
        {projects.map(project => (
          <div key={project.id} className="min-w-0">
            <div className="mb-1.5 flex min-w-0 items-center gap-2 text-xs font-medium text-text-muted">
              <Folder className="h-4 w-4 shrink-0" />
              <span className="truncate">{project.name}</span>
              {project.current ? (
                <Badge variant="outline" className="h-5 px-1.5 text-[10px] text-success">
                  当前
                </Badge>
              ) : null}
            </div>
            <div className="grid gap-1">
              {project.threads.map(thread => (
                <div
                  key={thread.id}
                  className={cn(
                    'rounded-md border px-2.5 py-2 text-left',
                    project.current
                      ? 'border-success/20 bg-success-subtle/40'
                      : 'border-border-subtle bg-bg-subtle'
                  )}
                  title={thread.preview || thread.title}
                >
                  <div className="truncate text-xs font-medium text-text-main">{thread.title}</div>
                  <div className="mt-1 flex min-w-0 items-center gap-2 text-[11px] text-text-muted">
                    {thread.branch ? (
                      <span className="flex min-w-0 items-center gap-1">
                        <GitBranch className="h-3 w-3 shrink-0" />
                        <span className="truncate">{thread.branch}</span>
                      </span>
                    ) : null}
                    <span className="ml-auto flex shrink-0 items-center gap-1">
                      <Clock3 className="h-3 w-3" />
                      {formatHistoryTime(thread.updated_at)}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {!isLoading && projects.length === 0 ? (
        <div className="mt-4 rounded-md bg-bg-subtle p-3 text-xs leading-5 text-text-muted">
          没读到本机 Codex 历史。
        </div>
      ) : null}
    </aside>
  );
}

function AgentsHeader({
  title,
  subtitle,
  returnHref,
  badges,
}: {
  title: string;
  subtitle: string;
  returnHref: string;
  badges: string[];
}) {
  const backHref = returnHref === '/console/agents' ? ROUTES.CONSOLE.AGENTS : returnHref;

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-border-subtle px-6">
      <div className="flex min-w-0 items-center gap-3">
        <Bot className="h-5 w-5 shrink-0 text-text-subtle" />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="truncate text-base font-semibold text-text-main">{title}</h1>
            {badges.map(badge => (
              <Badge key={badge} variant="outline" className="hidden text-text-muted sm:inline-flex">
                {badge}
              </Badge>
            ))}
          </div>
          <p className="hidden truncate text-xs text-text-muted md:block">{subtitle}</p>
        </div>
      </div>
      <Button asChild variant="outline" size="sm">
        <Link href={backHref}>
          {returnHref === '/console/agents' ? (
            <ArrowLeft className="h-4 w-4" />
          ) : (
            <ClipboardList className="h-4 w-4" />
          )}
          <span>{returnHref === '/console/agents' ? '返回列表' : '返回看板'}</span>
        </Link>
      </Button>
    </header>
  );
}

function CodingCliRow({ item, returnHref }: { item: CodingCliItem; returnHref: string }) {
  const href = `/console/agents/${item.id}?return_to=${encodeURIComponent(returnHref)}`;
  const row = (
    <div className="grid min-h-16 grid-cols-[1fr_auto] items-center gap-3 px-3 py-2 md:grid-cols-[1.5fr_1fr_1fr_auto]">
      <div className="flex min-w-0 items-center gap-3">
        <AgentModelIcon item={item} active={item.detected} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium text-text-main">{item.label}</span>
            {item.dispatchable ? <ChevronRight className="h-4 w-4 text-text-muted" /> : null}
          </div>
          <div className="mt-0.5 truncate text-xs text-text-muted">{item.command}</div>
        </div>
      </div>
      <div className="hidden min-w-0 text-xs leading-5 text-text-muted md:block">
        <div className="truncate">{sourceLabel(item)}</div>
        <div className="truncate">{item.version || 'version unknown'}</div>
      </div>
      <div className="hidden min-w-0 text-xs leading-5 text-text-muted md:block">
        <div className="truncate">{item.runtimeId || 'no runtime'}</div>
        <div className="truncate">{item.hostname || item.path || 'not detected'}</div>
      </div>
      <div className="flex justify-end">
        <StatusBadge item={item} />
      </div>
    </div>
  );

  if (!item.dispatchable) {
    return row;
  }

  return (
    <Link href={href} className="block transition-colors hover:bg-bg-subtle focus-ring">
      {row}
    </Link>
  );
}

function StatusBadge({ item }: { item: CodingCliItem }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        'gap-1.5',
        item.dispatchable
          ? 'border-success/30 text-success'
          : item.detected
            ? 'border-info/30 text-info'
            : 'border-border-subtle text-text-muted'
      )}
    >
      {item.dispatchable ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Circle className="h-3.5 w-3.5" />}
      {item.dispatchable
        ? '可调度'
        : item.detected
          ? item.source === 'local'
            ? '本机已装'
            : '已检测'
          : '未检测'}
    </Badge>
  );
}

function AgentModelIcon({
  item,
  active,
  size = 'md',
}: {
  item: Pick<CodingCliDefinition, 'iconLabel' | 'iconClassName'>;
  active: boolean;
  size?: 'md' | 'lg';
}) {
  return (
    <span
      className={cn(
        'relative flex shrink-0 items-center justify-center rounded-md text-[11px] font-semibold tracking-normal shadow-xs',
        size === 'lg' ? 'h-11 w-11 text-sm' : 'h-9 w-9',
        active ? item.iconClassName : 'bg-bg-subtle text-text-muted ring-1 ring-border-subtle'
      )}
    >
      {item.iconLabel}
      <span
        className={cn(
          'absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-bg-surface',
          active ? 'bg-success' : 'bg-border-strong'
        )}
      />
    </span>
  );
}

function RuntimeStatusPanel({
  agent,
  runtime,
  now,
}: {
  agent: CodingCliDefinition;
  runtime?: CodingCTORuntimeDTO;
  now: number;
}) {
  const cli = runtime?.available_clis?.find(item => normalizeCliId(item.command || item.name) === agent.id);
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
      <div className="text-xs font-medium text-text-main">Runtime</div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-text-muted">
        <Field label="状态" value={runtime ? 'online' : 'not ready'} />
        <Field label="runtime_id" value={runtime?.runtime_id ?? 'none'} />
        <Field label="executor" value={runtime?.executor ?? agent.executor ?? 'not wired'} />
        <Field label="last_seen" value={runtime ? relativeRuntimeSeen(runtime.last_seen_at, now) : 'none'} />
        <Field label="path" value={cli?.path ?? 'none'} />
      </div>
    </div>
  );
}

function TaskStatusPanel({
  task,
  events,
  isLoading,
}: {
  task?: CodingCTODirectAgentTaskDTO;
  events: CodingCTODirectTaskEventDTO[];
  isLoading: boolean;
}) {
  const summary = summarizeTaskEvents(events);
  const latestOutput =
    extractAgentMessage(task?.output_log) ||
    extractAgentMessage(events.findLast(event => event.output)?.output) ||
    '';
  const showErrorLog = Boolean(task?.error_log && !(task.status === 'completed' && task.exit_code === 0));
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="text-xs font-medium text-text-main">最近测试</div>
        {isLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin text-text-muted" /> : null}
      </div>
      <div className="mt-3 grid gap-2 text-xs leading-5 text-text-muted">
        <Field label="task" value={task ? `#${task.id}` : 'none'} />
        <Field label="status" value={task?.status ?? 'not created'} />
        <Field label="claim" value={summary.hasClaim ? 'yes' : 'no'} />
        <Field label="result" value={summary.hasResult ? 'yes' : 'no'} />
      </div>
      {latestOutput ? (
        <pre className="mt-3 max-h-48 overflow-auto rounded-md bg-bg-subtle p-2 text-xs leading-5 text-text-muted">
          {latestOutput}
        </pre>
      ) : null}
      {showErrorLog ? (
        <pre className="mt-3 max-h-40 overflow-auto rounded-md bg-error-subtle p-2 text-xs leading-5 text-error">
          {task?.error_log}
        </pre>
      ) : null}
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase text-text-muted">{label}</div>
      <div className="truncate text-text-main">{value || 'none'}</div>
    </div>
  );
}

function codingCliItemsFromRuntimes(
  runtimes: CodingCTORuntimeDTO[],
  now: number,
  localCliProbe: LocalCliProbeItem[]
): CodingCliItem[] {
  const detected = new Map<string, CodingCliItem>();

  for (const runtime of runtimes) {
    if (!isFreshOnlineRuntime(runtime, now)) {
      continue;
    }
    for (const cli of runtime.available_clis ?? []) {
      const command = cli.command || cli.name;
      const id = normalizeCliId(command || cli.name);
      const definition = definitionForCli(id, command);
      if (!definition || !cli.available) {
        continue;
      }
      const item: CodingCliItem = {
        ...definition,
        detected: true,
        dispatchable: runtimeCanDispatchCLI(runtime, definition),
        source: 'runtime',
        version: cli.version,
        path: cli.path,
        runtimeId: runtime.runtime_id,
        hostname: runtime.hostname,
        lastSeenAt: runtime.last_seen_at,
      };
      const current = detected.get(definition.id);
      if (!current || (!current.dispatchable && item.dispatchable)) {
        detected.set(definition.id, item);
      }
    }
  }

  for (const localCli of localCliProbe) {
    const id = normalizeCliId(localCli.command || localCli.id);
    const definition = definitionForCli(id, localCli.command);
    if (!definition || !localCli.available || detected.has(definition.id)) {
      continue;
    }
    detected.set(definition.id, {
      ...definition,
      detected: true,
      dispatchable: false,
      source: 'local',
      version: localCli.version,
      path: localCli.path,
    });
  }

  const baseItems = codingCliDefinitions.map(definition => {
    const item = detected.get(definition.id);
    return (
      item ?? {
        ...definition,
        detected: false,
        dispatchable: false,
        source: 'none' as const,
      }
    );
  });
  const baseIds = new Set(codingCliDefinitions.map(definition => definition.id));
  const extraItems = [...detected.values()]
    .filter(item => !baseIds.has(item.id))
    .sort((a, b) => a.label.localeCompare(b.label));

  return [...baseItems, ...extraItems];
}

function definitionForCli(id: string, command: string) {
  return (
    codingCliDefinitions.find(definition => definition.id === id) ??
    codingCliDefinitions.find(definition => definition.command === command)
  );
}

function runtimeCanDispatchCLI(runtime: CodingCTORuntimeDTO, definition: CodingCliDefinition) {
  return Boolean(definition.executor && runtime.executor === definition.executor);
}

function findDispatchRuntime(
  runtimes: CodingCTORuntimeDTO[],
  now: number,
  definition: CodingCliDefinition
) {
  if (!definition.executor) {
    return undefined;
  }
  return runtimes.find(runtime => {
    if (!isFreshOnlineRuntime(runtime, now) || runtime.executor !== definition.executor) {
      return false;
    }
    return runtime.available_clis?.some(
      cli => cli.available && normalizeCliId(cli.command || cli.name) === definition.id
    );
  });
}

function isFreshOnlineRuntime(runtime: CodingCTORuntimeDTO, now: number) {
  if (runtime.status !== 'online') {
    return false;
  }
  const lastSeen = new Date(runtime.last_seen_at).getTime();
  if (!Number.isFinite(lastSeen) || lastSeen <= 0) {
    return false;
  }
  return now - lastSeen <= ONLINE_RUNTIME_STALE_MS;
}

function normalizeCliId(value: string) {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const aliases: Record<string, string> = {
    codex: 'codex_cli',
    codex_cli: 'codex_cli',
    openai_codex: 'codex_cli',
    claude_code: 'claude_code_cli',
    claude_code_cli: 'claude_code_cli',
    claude: 'claude_code_cli',
    cursor: 'cursor_agent',
    cursor_agent: 'cursor_agent',
    copilot: 'github_copilot',
    github_copilot: 'github_copilot',
    github_copilot_cli: 'github_copilot',
    opencode: 'opencode',
    openclaw: 'openclaw',
    gemini: 'gemini',
    kimi: 'kimi',
    kiro: 'kiro',
  };
  return aliases[normalized] ?? normalized;
}

function sourceLabel(item: CodingCliItem) {
  if (item.source === 'runtime') {
    return 'ccto daemon';
  }
  if (item.source === 'local') {
    return 'local PATH';
  }
  return 'not detected';
}

function relativeRuntimeSeen(lastSeenAt: string, now: number) {
  const lastSeen = new Date(lastSeenAt).getTime();
  if (!Number.isFinite(lastSeen)) {
    return 'unknown';
  }
  const seconds = Math.max(0, Math.round((now - lastSeen) / 1000));
  if (seconds < 60) {
    return `${seconds}s ago`;
  }
  return `${Math.round(seconds / 60)}m ago`;
}

function formatHistoryTime(value: string) {
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) {
    return '';
  }
  const diffMs = Date.now() - timestamp;
  const minutes = Math.max(0, Math.round(diffMs / 60_000));
  if (minutes < 1) {
    return 'now';
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  return `${Math.round(hours / 24)}d`;
}

function summarizeTaskEvents(events: CodingCTODirectTaskEventDTO[]) {
  return {
    hasClaim: events.some(event => event.type === 'runtime_claimed'),
    hasResult: events.some(event => event.type === 'executor_result'),
  };
}

function extractAgentMessage(output?: string) {
  if (!output) {
    return '';
  }
  let latest = '';
  for (const line of output.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed.startsWith('{')) {
      continue;
    }
    try {
      const event = JSON.parse(trimmed) as {
        type?: string;
        item?: { type?: string; text?: string };
      };
      if (event.type === 'item.completed' && event.item?.type === 'agent_message') {
        latest = event.item.text?.trim() ?? latest;
      }
    } catch {
      continue;
    }
  }
  return latest || output.trim();
}
