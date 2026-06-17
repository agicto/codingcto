'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Circle,
  CircleAlert,
  Sparkles,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useLocale } from '@/hooks/use-locale';
import { useT } from '@/i18n';
import {
  useBindProjectRepository,
  useProjectContext,
  useProjectRepositoryOptions,
} from '@/features/project/hooks/use-projects';
import { primaryRepositoryContext } from '@/features/project/project-context';
import { projectRequirementNewHref, projectSpecForgeHref } from '@/features/project/project-utils';
import {
  projectDeliverySetupChecklist,
  type ProjectDeliverySetupItem,
} from '@/features/project/project-delivery-setup';
import {
  githubReadinessRecoveryActions,
  githubReadinessRecoveryDiagnostics,
  githubReadinessRecoveryTargetFromRepositoryId,
} from '@/features/project/github-readiness-recovery';
import {
  githubRepositoryIdentitySummary,
  type GitHubRepositoryIdentitySummary,
} from '@/features/project/github-repository-identity';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
import {
  useApproveSpecForgePlan,
  useCreateGitHubIssue,
  useCreateSpecForgeProjectIdea,
  useDispatchExecutionRun,
  useGitHubRepositoryReadiness,
  useRepoArchitectureStatus,
  useSpecForgeRuntimes,
  useStartExecutionRun,
} from '@/features/specforge/hooks/use-specforge';
import {
  specForgeService,
  type GitHubRepositoryReadinessCheckDTO,
} from '@/features/specforge/services/specforge-service';
import { hasFreshDispatchRuntime } from '@/features/specforge/runtime-dispatch-readiness';
import { cn } from '@/utils';

export function ProjectSpecForgeConsole() {
  const t = useT('dashboard.projectDelivery');
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const context = contextQuery.data?.context;
  const selectedRepository = primaryRepositoryContext(context);
  const repositoryId = selectedRepository?.repository.repository_id;
  const hasProjectContext = Boolean(context);

  if (!validProjectId) {
    return (
      <ProjectScopedState
        title={t('states.invalidProject.title')}
        description={t('states.invalidProject.description')}
      />
    );
  }

  if (!hasProjectContext && contextQuery.isFetching) {
    return (
      <ProjectScopedState
        title={t('states.loading.title')}
        description={t('states.loading.description')}
      />
    );
  }

  if (contextQuery.isError || !context) {
    return (
      <ProjectScopedState
        title={t('states.unavailable.title')}
        description={t('states.unavailable.description')}
        actionHref="/console/projects"
        actionLabel={t('states.unavailable.action')}
      />
    );
  }

  const loadedContext = context;

  return (
    <div className="h-full overflow-y-auto overflow-x-hidden pb-28">
      {!repositoryId ? (
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          <Alert>
            <AlertTitle>{t('primaryRequired.title')}</AlertTitle>
            <AlertDescription>
              {t('primaryRequired.description')}
            </AlertDescription>
          </Alert>
          <ProjectRepositoryBindPanel projectId={projectId} />
        </div>
      ) : (
        <ProjectMvpBoard
          projectId={validProjectId}
          context={loadedContext}
          repository={selectedRepository}
        />
      )}
    </div>
  );
}

type MvpBoardColumnId = 'setup' | 'intake' | 'approve' | 'delivery';

interface MvpBoardCard {
  id: string;
  column: MvpBoardColumnId;
  title: string;
  summary: string;
  status: string;
  tone: 'ready' | 'waiting' | 'blocked' | 'running';
  details: string[];
  actionLabel?: string;
  actionHref?: string;
  actionDisabled?: boolean;
}

const mvpBoardColumns: Array<{
  id: MvpBoardColumnId;
  title: string;
  hint: string;
  emptyLabel: string;
}> = [
  {
    id: 'setup',
    title: '准备',
    hint: '确认项目能交付 PR',
    emptyLabel: '仓库、上下文和运行器都准备好后进入需求录入。',
  },
  {
    id: 'intake',
    title: '需求',
    hint: '输入一个产品目标',
    emptyLabel: '新需求会出现在这里。',
  },
  {
    id: 'approve',
    title: '审批',
    hint: '只做一次人工决策',
    emptyLabel: '生成计划后在这里审批 PR 拆分。',
  },
  {
    id: 'delivery',
    title: '交付',
    hint: '查看 PR、CI 和阻塞项',
    emptyLabel: '审批后 PR 进度会出现在这里。',
  },
];

function ProjectMvpBoard({
  projectId,
  context,
  repository,
}: {
  projectId: number;
  context: ProjectContextDTO;
  repository?: ProjectRepositoryContextDTO;
}) {
  const repoId = repository?.repository.repository_id ?? '';
  const [runtimeNow] = useState(() => Date.now());
  const [selectedCardId, setSelectedCardId] = useState<string | undefined>();
  const runtimesQuery = useSpecForgeRuntimes({ status: 'online', limit: 20 });
  const architectureQuery = useRepoArchitectureStatus(repoId);
  const readinessQuery = useGitHubRepositoryReadiness(repoId || undefined);
  const localAgentReady = ['codex_cli', 'kimi_cli', 'claude_code_cli'].some(executor =>
    hasFreshDispatchRuntime(runtimesQuery.data?.runtimes, runtimeNow, executor, repoId)
  );
  const readiness = readinessQuery.data;
  const githubReady = Boolean(readiness?.ready);
  const snapshot = architectureQuery.data?.snapshot ?? repository?.architecture_snapshot;
  const profile = repository?.profile;
  const repoReady = Boolean(repoId);
  const wikiReady = Boolean(snapshot || profile);
  const projectName = context.project.name || `Project ${projectId}`;
  const newRequirementHref = projectRequirementNewHref(projectId);

  const cards: MvpBoardCard[] = [
    {
      id: 'setup',
      column: 'setup',
      title: '项目准备',
      summary: repoReady ? '主仓库已绑定，可以生成计划。' : '先绑定一个 primary repository。',
      status: repoReady && localAgentReady ? '可交付' : '需检查',
      tone: repoReady && localAgentReady ? 'ready' : 'blocked',
      details: [
        `项目：${projectName}`,
        repoReady ? `目标仓库：${repoId}` : '还没有选择主仓库',
        wikiReady ? '仓库上下文已可用，可用于计划生成。' : '仓库上下文还不完整，建议先生成或更新。',
        localAgentReady
          ? '本地 ccto agent 已在线并匹配目标仓库。'
          : '本地 ccto agent 未就绪；可以先生成计划，执行前再处理。',
        githubReady ? 'GitHub readiness 检查通过。' : 'GitHub readiness 还需要检查。',
      ],
      actionLabel: repoReady ? '新建需求' : '检查项目',
      actionHref: repoReady ? newRequirementHref : undefined,
      actionDisabled: !repoReady,
    },
    {
      id: 'requirement',
      column: 'intake',
      title: '新建需求',
      summary: '描述一个功能、bugfix、重构或测试目标。',
      status: '等待输入',
      tone: repoReady ? 'waiting' : 'blocked',
      details: [
        '只需要输入产品目标、约束和非目标。',
        'CodingCTO 会生成产品计划、技术计划和 1-5 个 PR 节点。',
        '不会在计划审批前执行代码。',
      ],
      actionLabel: '新建需求',
      actionHref: repoReady ? newRequirementHref : undefined,
      actionDisabled: !repoReady,
    },
    {
      id: 'approval',
      column: 'approve',
      title: '计划审批',
      summary: '检查 PR 边界、依赖、风险和测试命令。',
      status: '等待计划',
      tone: 'waiting',
      details: [
        '这是用户必须做的一次决策。',
        '审批后系统按 PR 依赖顺序执行。',
        'Prompt、Skill 和运行日志只作为高级详情展示。',
      ],
      actionLabel: '先生成计划',
      actionHref: repoReady ? newRequirementHref : undefined,
      actionDisabled: !repoReady,
    },
    {
      id: 'delivery',
      column: 'delivery',
      title: 'PR 交付',
      summary: '跟踪 PR、CI、自动修复和需要人工判断的阻塞项。',
      status: '等待审批',
      tone: 'waiting',
      details: [
        '交付单位是 GitHub PR，不是 agent 任务。',
        'CI 失败会先自动分类和尝试修复。',
        '无法安全继续时，只显示需要用户判断的阻塞项。',
      ],
      actionLabel: '等待审批',
      actionDisabled: true,
    },
  ];

  const selectedCard = cards.find(card => card.id === selectedCardId);

  return (
    <main className="mx-auto flex w-full max-w-[1500px] flex-col gap-4 px-4 py-4 md:px-6">
      <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-semibold text-text-main">{projectName}</h1>
              <Badge variant="outline">CodingCTO Delivery</Badge>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              从一个需求开始，审批一次计划，然后跟踪 GitHub PR。仓库上下文、Prompt 和运行器是后台能力，不作为主流程步骤。
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" asChild>
              <Link href={newRequirementHref}>
                新建需求
                <Sparkles className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-2 md:grid-cols-4">
          <MvpStatusMetric label="主仓库" value={repoId || '未绑定'} state={repoReady ? 'ready' : 'blocked'} />
          <MvpStatusMetric label="仓库上下文" value={wikiReady ? '可用' : '待生成'} state={wikiReady ? 'ready' : 'waiting'} />
          <MvpStatusMetric label="运行器" value={localAgentReady ? '在线' : '未在线'} state={localAgentReady ? 'ready' : 'blocked'} />
          <MvpStatusMetric label="GitHub" value={githubReady ? 'Ready' : '需检查'} state={githubReady ? 'ready' : 'waiting'} />
        </div>
        <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-6 text-text-muted">
          主流程只保留准备、需求、审批、交付。Coding Agent 作为独立左侧菜单入口，不放在看板里。
        </div>
      </section>

      <section className="grid gap-3 xl:grid-cols-4">
        {mvpBoardColumns.map(column => {
          const columnCards = cards.filter(card => card.column === column.id);
          return (
            <div key={column.id} className="min-h-[360px] rounded-lg border border-border-subtle bg-bg-subtle p-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="text-sm font-semibold text-text-main">{column.title}</div>
                  <div className="mt-1 text-xs leading-5 text-text-muted">{column.hint}</div>
                </div>
                <span className="rounded-full bg-bg-surface px-2 py-0.5 text-xs text-text-muted">
                  {columnCards.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {columnCards.length ? (
                  columnCards.map(card => (
                    <button
                      key={card.id}
                      type="button"
                      onClick={() => setSelectedCardId(card.id)}
                      className="w-full rounded-md border border-border-subtle bg-bg-surface p-3 text-left shadow-sm transition hover:border-primary/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-text-main">{card.title}</span>
                        <MvpToneIcon tone={card.tone} />
                      </div>
                      <p className="mt-2 line-clamp-3 text-xs leading-5 text-text-muted">{card.summary}</p>
                      <div className="mt-3 flex items-center justify-between gap-2 text-xs">
                        <Badge variant="outline" className={mvpToneClassName(card.tone)}>
                          {card.status}
                        </Badge>
                        <span className="text-primary">查看</span>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="flex min-h-32 items-center rounded-md border border-dashed border-border-subtle bg-bg-surface/60 px-3 py-4 text-sm leading-6 text-text-muted">
                    {column.emptyLabel}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <Dialog open={Boolean(selectedCard)} onOpenChange={open => !open && setSelectedCardId(undefined)}>
        <DialogContent size="lg">
          {selectedCard ? (
            <>
              <DialogHeader className="pr-8">
                <DialogTitle>{selectedCard.title}</DialogTitle>
                <DialogDescription>{selectedCard.summary}</DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                <div className="grid gap-2 sm:grid-cols-2">
                  <MvpDetailMetric
                    label="当前状态"
                    value={selectedCard.status}
                    helper={mvpBoardColumns.find(column => column.id === selectedCard.column)?.title ?? ''}
                    tone={selectedCard.tone}
                  />
                  <MvpDetailMetric
                    label="下一步"
                    value={selectedCard.actionLabel ?? '继续'}
                    helper={selectedCard.actionDisabled ? '等待前置产物' : '可以继续推进'}
                    tone={selectedCard.actionDisabled ? 'waiting' : selectedCard.tone}
                  />
                </div>

                <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
                  <div className="text-sm font-medium text-text-main">产物</div>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {['产品计划', '技术计划', 'PR 拆分', '执行记录', 'GitHub PR'].map(item => (
                      <div key={item} className="flex items-center justify-between rounded-md bg-bg-surface px-3 py-2 text-sm">
                        <span className="text-text-main">{item}</span>
                        <Badge variant="outline" className="text-text-muted">待生成</Badge>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-sm font-medium text-text-main">说明</div>
                  {selectedCard.details.map(detail => (
                    <div key={detail} className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm leading-6 text-text-muted">
                      {detail}
                    </div>
                  ))}
                </div>
              </DialogBody>
              <DialogFooter>
                {selectedCard.actionHref ? (
                  <Button type="button" asChild>
                    <Link href={selectedCard.actionHref}>
                      {selectedCard.actionLabel ?? '继续'}
                      <ArrowRight className="ml-1.5 h-4 w-4" />
                    </Link>
                  </Button>
                ) : (
                  <Button type="button" disabled={selectedCard.actionDisabled}>
                    {selectedCard.actionLabel ?? '继续'}
                    <ArrowRight className="ml-1.5 h-4 w-4" />
                  </Button>
                )}
                <Button type="button" variant="outline" onClick={() => setSelectedCardId(undefined)}>
                  关闭
                </Button>
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </main>
  );
}

function MvpStatusMetric({
  label,
  value,
  state,
}: {
  label: string;
  value: string;
  state: 'ready' | 'waiting' | 'blocked';
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="truncate text-sm font-medium text-text-main">{value}</span>
        <span className={cn('h-2 w-2 shrink-0 rounded-full', state === 'ready' ? 'bg-success' : state === 'blocked' ? 'bg-error' : 'bg-warning')} />
      </div>
    </div>
  );
}

function MvpDetailMetric({
  label,
  value,
  helper,
  tone,
}: {
  label: string;
  value: string;
  helper: string;
  tone: MvpBoardCard['tone'];
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-xs text-text-muted">{label}</div>
      <div className="mt-1 flex items-center justify-between gap-2">
        <span className="text-sm font-medium text-text-main">{value}</span>
        <Badge variant="outline" className={mvpToneClassName(tone)}>
          {helper}
        </Badge>
      </div>
    </div>
  );
}

function MvpToneIcon({ tone }: { tone: MvpBoardCard['tone'] }) {
  if (tone === 'ready') {
    return <CheckCircle2 className="h-4 w-4 text-success" />;
  }
  if (tone === 'blocked') {
    return <CircleAlert className="h-4 w-4 text-warning" />;
  }
  if (tone === 'running') {
    return <CheckCircle2 className="h-4 w-4 text-primary" />;
  }
  return <Circle className="h-4 w-4 text-text-muted" />;
}

function mvpToneClassName(tone: MvpBoardCard['tone']) {
  switch (tone) {
    case 'ready':
      return 'border-success/30 text-success';
    case 'blocked':
      return 'border-warning/30 text-warning';
    case 'running':
      return 'border-primary/30 text-primary';
    default:
      return 'border-border-subtle text-text-muted';
  }
}

function ProjectScopedState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <div className="mx-auto w-full max-w-4xl px-4 py-10 md:px-8">
      <Alert>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">{description}</AlertDescription>
      </Alert>
      {actionHref && actionLabel ? (
        <Button asChild variant="outline" className="mt-4">
          <Link href={actionHref}>{actionLabel}</Link>
        </Button>
      ) : null}
    </div>
  );
}

function ProjectRepositoryBindPanel({ projectId }: { projectId: number }) {
  const t = useT('dashboard.projectDelivery.bindPanel');
  const bindRepository = useBindProjectRepository(projectId);
  const repositoryOptionsQuery = useProjectRepositoryOptions(projectId);
  const repositories = repositoryOptionsQuery.data?.repositories ?? [];
  const selectableRepositories = repositories.filter(repository => repository.selectable);
  const [selectedRepositoryId, setSelectedRepositoryId] = useState('');
  const [role, setRole] = useState('primary');
  const [message, setMessage] = useState('');
  const selectedRepository = repositories.find(
    repository => repository.repository_id === selectedRepositoryId
  );

  async function bindRepositoryToProject() {
    if (!selectedRepository?.selectable) {
      setMessage(t('messages.repositoryRequired'));
      return;
    }
    setMessage('');
    try {
      const response = await bindRepository.mutateAsync({
        repository_id: selectedRepository.repository_id,
        role: role as 'primary' | 'dependency' | 'docs' | 'infra',
      });
      setSelectedRepositoryId('');
      setRole('primary');
      setMessage(
        t('messages.bound', {
          role: t(`roles.${response.repository.role}`),
          repoId: response.repository.repository_id,
        })
      );
    } catch {
      setMessage(t('messages.bindFailed'));
    }
  }

  return (
    <Card className="mt-4">
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs leading-5 text-text-muted">
            {repositoryOptionsQuery.isLoading
              ? t('loadingRepositories')
              : t('repositoryCount', { count: selectableRepositories.length })}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href="/console/settings?tab=github">{t('connectRepository')}</Link>
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={repositoryOptionsQuery.isFetching}
              onClick={() => repositoryOptionsQuery.refetch()}
            >
              {t('refreshRepositories')}
            </Button>
          </div>
        </div>

        {repositoryOptionsQuery.isLoading ? (
          <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
            {t('loadingRepositories')}
          </div>
        ) : repositories.length > 0 ? (
          <div className="max-h-[360px] space-y-2 overflow-y-auto pr-1">
            {repositories.map(repository => {
              const selected = selectedRepositoryId === repository.repository_id;
              return (
                <button
                  key={repository.repository_id}
                  type="button"
                  disabled={!repository.selectable}
                  onClick={() => setSelectedRepositoryId(repository.repository_id)}
                  className={cn(
                    'flex w-full items-start justify-between gap-3 rounded-[4px] border px-3 py-3 text-left transition-colors',
                    selected
                      ? 'border-primary bg-primary-subtle'
                      : 'border-border-subtle bg-bg-surface hover:bg-bg-subtle',
                    !repository.selectable && 'cursor-not-allowed opacity-65 hover:bg-bg-surface'
                  )}
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium text-text-main">
                      {repository.access.full_name}
                    </span>
                    <span className="mt-0.5 block text-xs leading-5 text-text-muted">
                      {repository.access.default_branch} · {repositorySourceLabel(repository)}
                      {repository.disabled_reason ? ` · ${repository.disabled_reason}` : ''}
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-wrap justify-end gap-1">
                    {repository.already_bound ? (
                      <Badge variant="outline" className="border-border-subtle text-text-muted">
                        {t(`roles.${repository.bound_role || 'dependency'}`)}
                      </Badge>
                    ) : null}
                    <Badge
                      variant="outline"
                      className={
                        repository.writable
                          ? 'border-success/30 text-success'
                          : 'border-border-subtle text-text-muted'
                      }
                    >
                      {repository.writable ? t('writable') : t('readOnly')}
                    </Badge>
                  </span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
            {t('emptyRepositories')}
          </div>
        )}

        <div className="grid gap-3 md:grid-cols-[220px_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="project-repository-role">{t('role')}</Label>
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger id="project-repository-role">
                <SelectValue placeholder={t('role')} />
              </SelectTrigger>
              <SelectContent>
                {['primary', 'dependency', 'docs', 'infra'].map(item => (
                  <SelectItem key={item} value={item}>
                    {t(`roles.${item}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex justify-end">
            <Button
              type="button"
              disabled={bindRepository.isPending || !selectedRepository?.selectable}
              onClick={bindRepositoryToProject}
            >
              {bindRepository.isPending ? t('binding') : t('submit')}
            </Button>
          </div>
        </div>

        {message && (
          <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-5 text-text-muted">
            {message}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function repositorySourceLabel(repository: {
  access: {
    source_type: string;
    organization_login?: string;
    visibility?: string;
  };
}) {
  const source =
    repository.access.source_type === 'organization' && repository.access.organization_login
      ? repository.access.organization_login
      : 'personal';
  return `${source} · ${repository.access.visibility || 'repository'}`;
}

type FlowStepStatus = 'pending' | 'running' | 'success' | 'error';

type FlowStep = {
  id: string;
  title: string;
  status: FlowStepStatus;
  detail?: string;
  href?: string;
};

function ProjectE2ERunPanel({
  projectId,
  projectName,
  repository,
}: {
  projectId: number;
  projectName?: string;
  repository?: ProjectRepositoryContextDTO['repository'];
}) {
  const t = useT('dashboard.projectDelivery.e2e');
  const { locale } = useLocale();
  const createIssue = useCreateGitHubIssue();
  const createRequirement = useCreateSpecForgeProjectIdea(projectId);
  const approvePlan = useApproveSpecForgePlan();
  const startRun = useStartExecutionRun();
  const dispatchRun = useDispatchExecutionRun();
  const readinessQuery = useGitHubRepositoryReadiness(repository?.repository_id);
  const [issueTitle, setIssueTitle] = useState(t('defaultIssueTitle'));
  const [issueBody, setIssueBody] = useState(t('defaultIssueBody'));
  const [steps, setSteps] = useState<FlowStep[]>([]);
  const [running, setRunning] = useState(false);
  const [impactAcknowledged, setImpactAcknowledged] = useState(false);
  const copy = (key: string, fallback: string) => {
    const translated = t(key);
    return translated.startsWith('dashboard.projectDelivery.e2e.') ? fallback : translated;
  };
  const readiness = readinessQuery.data;
  const readinessBlockingChecks =
    readiness?.checks.filter(check => check.required && check.status !== 'ok') ?? [];
  const readinessChecking = Boolean(repository?.repository_id) && readinessQuery.isFetching && !readiness;
  const readinessBlocked = Boolean(readiness && !readiness.ready);
  const setupChecklist = projectDeliverySetupChecklist({
    hasRepository: Boolean(repository?.repository_id),
    githubReady: readiness?.ready,
    githubChecking: readinessChecking,
    githubBlockingCheckCount: readinessBlockingChecks.length,
    issueTitle,
    issueBody,
    impactAcknowledged,
  });

  function setStep(next: FlowStep) {
    setSteps(current => {
      const index = current.findIndex(step => step.id === next.id);
      if (index === -1) {
        return [...current, next];
      }
      const copy = [...current];
      copy[index] = { ...copy[index], ...next };
      return copy;
    });
  }

  async function runFlow() {
    if (!repository?.repository_id) {
      setSteps([
        {
          id: 'repository',
          title: t('steps.repository.title'),
          status: 'error',
          detail: t('errors.noRepository'),
        },
      ]);
      return;
    }
    if (readinessBlocked) {
      setSteps([
        {
          id: 'readiness',
          title: t('readiness.title'),
          status: 'error',
          detail: readinessProblemSummary(readinessBlockingChecks, t('readiness.noChecks'), locale),
        },
      ]);
      return;
    }
    if (!impactAcknowledged) {
      setSteps([
        {
          id: 'impact',
          title: copy('impact.title', '正式试跑影响'),
          status: 'error',
          detail: copy('impact.required', '请先确认正式试跑影响，再开始端到端试跑。'),
        },
      ]);
      return;
    }
    setRunning(true);
    setSteps([]);
    try {
      setStep({ id: 'repository', title: t('steps.repository.title'), status: 'success', detail: repository.repository_id });

      setStep({ id: 'issue', title: t('steps.issue.title'), status: 'running' });
      const issue = await createIssue.mutateAsync({
        repository_id: repository.repository_id,
        title: issueTitle,
        body: issueBody,
      });
      setStep({
        id: 'issue',
        title: t('steps.issue.title'),
        status: 'success',
        detail: `#${issue.number} ${issue.title}`,
        href: issue.html_url,
      });

      setStep({ id: 'plan', title: t('steps.plan.title'), status: 'running' });
      const planBundle = await createRequirement.mutateAsync({
        type: 'docs',
        input: [
          `GitHub Issue: #${issue.number}`,
          `Issue URL: ${issue.html_url}`,
          `项目：${projectName || '未命名项目'}`,
          '',
          issueTitle,
          issueBody,
        ].join('\n'),
      });
      setStep({
        id: 'plan',
        title: t('steps.plan.title'),
        status: 'success',
        detail: t('steps.plan.detail', { count: planBundle.pr_nodes.length }),
      });

      const firstNode = planBundle.pr_nodes.find(node => node.depends_on.length === 0) ?? planBundle.pr_nodes[0];
      if (!firstNode) {
        throw new Error(t('errors.noExecutableNode'));
      }

      setStep({ id: 'approve', title: t('steps.approve.title'), status: 'running' });
      const approved = await approvePlan.mutateAsync({
        planId: planBundle.implementation_plan.id,
        payload: { approved: true },
      });
      setStep({
        id: 'approve',
        title: t('steps.approve.title'),
        status: 'success',
        detail: t('steps.approve.detail', { id: approved.implementation_plan.id }),
      });

      setStep({ id: 'run', title: t('steps.run.title'), status: 'running' });
      const run = await startRun.mutateAsync({
        planId: approved.implementation_plan.id,
        payload: { executor: 'codex_cli', pr_node_ids: [firstNode.id] },
      });
      setStep({
        id: 'run',
        title: t('steps.run.title'),
        status: 'success',
        detail: `Run #${run.run.id}`,
      });

      setStep({ id: 'dispatch', title: t('steps.dispatch.title'), status: 'running' });
      const dispatched = await dispatchRun.mutateAsync({
        runId: run.run.id,
        payload: { max_tasks: 1, require_runtime_ready: true },
      });
      const task = dispatched.tasks.find(candidate => candidate.status === 'dispatched');
      if (!task) {
        throw new Error(t('errors.noDispatchedTask'));
      }
      setStep({
        id: 'dispatch',
        title: t('steps.dispatch.title'),
        status: 'success',
        detail: `Task #${task.id}`,
      });

      setStep({
        id: 'codex',
        title: t('steps.codexWaiting.title'),
        status: 'running',
        detail: t('steps.codexWaiting.detail'),
      });
      const executed = await waitForRuntimeTaskCompletion(run.run.id, task.id, t('errors.timeout'));
      const executedTask = executed.tasks.find(candidate => candidate.id === task.id);
      if (!executedTask || executedTask.status !== 'completed') {
        throw new Error(executedTask?.failure_reason || executedTask?.error_log || t('errors.codexFailed'));
      }
      setStep({
        id: 'codex',
        title: t('steps.codexDone.title'),
        status: 'success',
        detail: t('steps.codexDone.detail'),
      });

      const prNode = executed.plan?.pr_nodes.find(node => node.id === task.pr_node_id);
      setStep({
        id: 'pr',
        title: t('steps.pr.title'),
        status: prNode?.github_pr_url ? 'success' : 'error',
        detail: prNode?.github_pr_url ? t('steps.pr.detail', { number: prNode.github_pr_number ?? '' }) : t('steps.pr.missing'),
        href: prNode?.github_pr_url,
      });
    } catch (error) {
      const detail = error instanceof Error ? error.message : t('errors.flowFailed');
      setStep({ id: 'error', title: t('steps.error.title'), status: 'error', detail });
    } finally {
      setRunning(false);
    }
  }

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-8">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
          <CardDescription>
            {t('description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="space-y-3">
            <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <div className="text-sm font-medium text-text-main">{t('readiness.title')}</div>
                  <div className="mt-1 text-xs leading-5 text-text-muted">
                    {t('readiness.description')}
                  </div>
                </div>
                <Badge
                  variant="outline"
                  className={
                    readiness?.ready
                      ? 'border-success/30 text-success'
                      : readinessBlocked || readinessQuery.isError
                        ? 'border-error/30 text-error'
                        : 'border-primary/30 text-primary'
                  }
                >
                  {readiness?.ready
                    ? t('readiness.status.ready')
                    : readinessBlocked || readinessQuery.isError
                      ? t('readiness.status.blocked')
                      : t('readiness.status.checking')}
                </Badge>
              </div>
              {readinessQuery.isError ? (
                <div className="mt-3 rounded-md border border-error/30 bg-error-subtle px-3 py-2 text-xs leading-5 text-error">
                  {t('readiness.error')}
                </div>
              ) : readiness ? (
                <>
                  <div className="mt-3 grid gap-2 md:grid-cols-2">
                    {readiness.checks.map(check => (
                      <ReadinessCheckRow key={check.key} check={check} />
                    ))}
                  </div>
                  {readinessBlocked ? (
                    <ReadinessRecoveryActions
                      checks={readinessBlockingChecks}
                      repositoryId={repository?.repository_id ?? ''}
                      githubOwner={readiness.github_owner}
                      githubRepo={readiness.github_repo}
                      returnTo={projectSpecForgeHref(projectId)}
                      isChecking={readinessQuery.isFetching}
                      onRefresh={() => readinessQuery.refetch()}
                    />
                  ) : null}
                </>
              ) : (
                <div className="mt-3 text-xs leading-5 text-text-muted">{t('readiness.checkingRepository')}</div>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="e2e-issue-title">{t('issueTitleLabel')}</Label>
              <Input
                id="e2e-issue-title"
                value={issueTitle}
                onChange={event => setIssueTitle(event.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="e2e-issue-body">{t('issueBodyLabel')}</Label>
              <Textarea
                id="e2e-issue-body"
                value={issueBody}
                rows={4}
                onChange={event => setIssueBody(event.target.value)}
              />
            </div>
            <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3">
              <div className="text-sm font-medium text-warning">
                {copy('impact.title', '正式试跑影响')}
              </div>
              <p className="mt-1 text-sm leading-6 text-warning">
                {copy(
                  'impact.description',
                  '这不是只读验证。开始后会创建 GitHub Issue、生成并审批计划、派发 Codex 任务；成功后会提交代码、推送分支并尝试打开 PR。'
                )}
              </p>
              <div className="mt-3 flex items-start justify-between gap-3 rounded-md bg-bg-surface px-3 py-2">
                <div>
                  <div className="text-sm font-medium text-text-main">
                    {copy('impact.confirmTitle', '我确认要运行真实端到端试跑')}
                  </div>
                  <p className="mt-1 text-xs leading-5 text-text-muted">
                    {copy(
                      'impact.confirmDescription',
                      '已理解该动作会修改目标仓库，并可能创建 Issue、分支和 PR。'
                    )}
                  </p>
                </div>
                <Switch checked={impactAcknowledged} onCheckedChange={setImpactAcknowledged} />
              </div>
            </div>
            <ProjectDeliverySetupChecklistPanel summary={setupChecklist} />
            <Button
              type="button"
              onClick={runFlow}
              disabled={
                running ||
                !setupChecklist.canStart
              }
            >
              {running
                ? t('button.running')
                : readinessBlocked
                  ? t('button.blocked')
                  : t('button.start')}
            </Button>
          </div>
          <div className="space-y-2 rounded-lg border border-border-subtle bg-bg-subtle p-3">
            <div className="text-sm font-medium text-text-main">{t('timeline.title')}</div>
            {steps.length === 0 ? (
              <div className="text-sm leading-6 text-text-muted">
                {t('timeline.empty')}
              </div>
            ) : (
              <div className="space-y-2">
                {steps.map(step => (
                  <FlowStepRow key={step.id} step={step} />
                ))}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}

function FlowStepRow({ step }: { step: FlowStep }) {
  const t = useT('dashboard.projectDelivery.e2e');
  const tone =
    step.status === 'success'
      ? 'border-success/30 text-success'
      : step.status === 'error'
        ? 'border-error/30 text-error'
        : step.status === 'running'
          ? 'border-primary/30 text-primary'
          : 'border-border-subtle text-text-muted';

  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium text-text-main">{step.title}</span>
        <Badge variant="outline" className={tone}>
          {step.status === 'running'
            ? t('stepStatus.running')
            : step.status === 'success'
              ? t('stepStatus.success')
              : step.status === 'error'
                ? t('stepStatus.error')
                : t('stepStatus.pending')}
        </Badge>
      </div>
      {step.detail ? <div className="mt-1 text-xs leading-5 text-text-muted">{step.detail}</div> : null}
      {step.href ? (
        <a
          href={step.href}
          target="_blank"
          rel="noreferrer"
          className="mt-1 inline-flex text-xs font-medium text-primary hover:underline"
        >
          {t('linkLabel')}
        </a>
      ) : null}
    </div>
  );
}

function ReadinessCheckRow({ check }: { check: GitHubRepositoryReadinessCheckDTO }) {
  const t = useT('dashboard.projectDelivery.e2e');
  const { locale } = useLocale();
  const localizedCheck = localizeGitHubReadinessCheck(check, locale);
  const tone =
    check.status === 'ok'
      ? 'border-success/30 bg-success-subtle text-success'
      : check.status === 'warning'
        ? 'border-warning/30 bg-warning-subtle text-warning'
        : 'border-error/30 bg-error-subtle text-error';
  const label = check.status === 'ok' ? t('checkStatus.ok') : check.status === 'warning' ? t('checkStatus.warning') : t('checkStatus.error');

  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="font-medium leading-5 text-text-main">{localizedCheck.message}</div>
          {localizedCheck.detail ? (
            <div className="mt-1 break-words leading-5 text-text-muted">{localizedCheck.detail}</div>
          ) : null}
        </div>
        <Badge variant="outline" className={tone}>
          {label}
        </Badge>
      </div>
    </div>
  );
}

function ReadinessRecoveryActions({
  checks,
  repositoryId,
  githubOwner,
  githubRepo,
  returnTo,
  isChecking,
  onRefresh,
}: {
  checks: GitHubRepositoryReadinessCheckDTO[];
  repositoryId: string;
  githubOwner?: string;
  githubRepo?: string;
  returnTo: string;
  isChecking: boolean;
  onRefresh: () => void;
}) {
  const inferredRecoveryTarget = githubReadinessRecoveryTargetFromRepositoryId(repositoryId);
  const recoveryTarget =
    githubOwner && githubRepo
      ? { owner: githubOwner, repo: githubRepo, repositoryId, returnTo }
      : inferredRecoveryTarget
        ? { ...inferredRecoveryTarget, returnTo }
        : undefined;
  const actions = githubReadinessRecoveryActions(
    checks,
    recoveryTarget
  );
  const diagnostics = githubReadinessRecoveryDiagnostics(checks);
  const identity = githubRepositoryIdentitySummary({
    repositoryId,
    githubOwner,
    githubRepo,
  });

  if (!actions.length) {
    return null;
  }

  return (
    <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle p-3">
      <div className="text-sm font-medium text-warning">下一步处理</div>
      <p className="mt-1 text-xs leading-5 text-warning">
        真实端到端试跑需要 GitHub 连接、仓库绑定和写权限都就绪。先完成下面的配置，再回到这里重新检查。
      </p>
      <ProjectRepositoryIdentityDiagnostic identity={identity} />
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {diagnostics.map(diagnostic => (
          <div key={diagnostic.checkKey} className="rounded-md bg-bg-surface px-3 py-2">
            <div className="text-xs font-medium leading-5 text-text-main">
              {diagnostic.checkKey} - {diagnostic.setupStep}
            </div>
            <div className="mt-0.5 text-xs leading-5 text-text-muted">{diagnostic.detail}</div>
          </div>
        ))}
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {actions.map(action => (
          <div key={action.id} className="rounded-md bg-bg-surface px-3 py-2">
            <div className="text-xs font-medium leading-5 text-text-main">{action.label}</div>
            <div className="mt-0.5 text-xs leading-5 text-text-muted">{action.description}</div>
            <Button asChild variant="outline" size="sm" className="mt-2">
              <Link href={action.href}>{action.label}</Link>
            </Button>
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={onRefresh} disabled={isChecking}>
          {isChecking ? '检查中' : '重新检查'}
        </Button>
      </div>
    </div>
  );
}

function ProjectRepositoryIdentityDiagnostic({
  identity,
}: {
  identity: GitHubRepositoryIdentitySummary;
}) {
  return (
    <div className="mt-3 rounded-md bg-bg-surface px-3 py-2">
      <div className="text-xs font-medium leading-5 text-text-main">{identity.headline}</div>
      <div className="mt-0.5 text-xs leading-5 text-text-muted">{identity.detail}</div>
    </div>
  );
}

function ProjectDeliverySetupChecklistPanel({
  summary,
}: {
  summary: ReturnType<typeof projectDeliverySetupChecklist>;
}) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">真实试跑启动清单</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            {summary.headline} {summary.nextAction}
          </p>
        </div>
        <Badge
          variant="outline"
          className={summary.canStart ? 'border-success/30 text-success' : 'border-warning/30 text-warning'}
        >
          {summary.readyCount}/{summary.totalCount} 就绪
        </Badge>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {summary.items.map(item => (
          <ProjectDeliverySetupChecklistRow key={item.id} item={item} />
        ))}
      </div>
    </div>
  );
}

function ProjectDeliverySetupChecklistRow({
  item,
}: {
  item: ProjectDeliverySetupItem;
}) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-xs font-medium leading-5 text-text-main">{item.label}</div>
        <Badge variant="outline" className={projectDeliverySetupStateClassName(item.state)}>
          {projectDeliverySetupStateLabel(item.state)}
        </Badge>
      </div>
      <div className="mt-1 text-xs leading-5 text-text-muted">{item.detail}</div>
    </div>
  );
}

function projectDeliverySetupStateLabel(state: ProjectDeliverySetupItem['state']) {
  switch (state) {
    case 'ready':
      return '就绪';
    case 'waiting':
      return '检查中';
    default:
      return '阻塞';
  }
}

function projectDeliverySetupStateClassName(state: ProjectDeliverySetupItem['state']) {
  switch (state) {
    case 'ready':
      return 'border-success/30 text-success';
    case 'waiting':
      return 'border-primary/30 text-primary';
    default:
      return 'border-error/30 text-error';
  }
}

function readinessProblemSummary(
  checks: GitHubRepositoryReadinessCheckDTO[],
  emptyMessage: string,
  locale: string
) {
  if (checks.length === 0) {
    return emptyMessage;
  }
  return checks
    .map(check => {
      const localizedCheck = localizeGitHubReadinessCheck(check, locale);
      return `${localizedCheck.message}${localizedCheck.detail ? `: ${localizedCheck.detail}` : ''}`;
    })
    .join(locale.startsWith('zh') ? '；' : '; ');
}

function localizeGitHubReadinessCheck(
  check: GitHubRepositoryReadinessCheckDTO,
  locale: string
) {
  if (locale.startsWith('zh')) {
    return { message: check.message, detail: check.detail };
  }

  const permissionName = githubPermissionLabel(check.key);
  const permissionMessage = check.key.startsWith('permission_')
    ? permissionReadinessMessage(permissionName, check.status)
    : undefined;
  const messages: Record<string, string> = {
    repository: 'Repository is bound to this project',
    settings: 'GitHub integration is enabled',
    connection: 'GitHub account connection is active',
    oauth_token: 'GitHub OAuth token is available',
    repository_access: 'Repository access record is available',
    repository_read: 'Repository can be read',
    repository_write: 'Repository can be written',
    repository_ref: 'Default branch can be read',
    installation: 'Legacy GitHub App installation is synced',
    installation_token: 'Legacy GitHub App token is available',
  };

  return {
    message: permissionMessage ?? messages[check.key] ?? check.message,
    detail: localizeGitHubReadinessDetail(check.detail),
  };
}

function permissionReadinessMessage(permissionName: string, status: GitHubRepositoryReadinessCheckDTO['status']) {
  if (status === 'ok') {
    return `${permissionName} permission is available`;
  }
  if (status === 'warning') {
    return `GitHub access is missing ${permissionName}; later CI reads may be unavailable`;
  }
  return `GitHub access is missing required ${permissionName} permission`;
}

function githubPermissionLabel(key: string) {
  const labels: Record<string, string> = {
    permission_metadata: 'metadata:read',
    permission_contents: 'contents:write',
    permission_pull_requests: 'pull_requests:write',
    permission_issues: 'issues:write',
    permission_actions: 'actions:read',
    permission_statuses: 'statuses:read',
  };
  return labels[key] ?? key.replace(/^permission_/, '').replaceAll('_', ':');
}

function localizeGitHubReadinessDetail(detail?: string) {
  if (!detail) {
    return undefined;
  }
  const permissionDetail = detail.match(/^当前权限：(.+)，需要：(.+)$/);
  if (permissionDetail) {
    return `Current permission: ${permissionDetail[1]}; required: ${permissionDetail[2]}`;
  }
  return detail;
}

async function waitForRuntimeTaskCompletion(runId: number, taskId: number, timeoutMessage: string) {
  const terminalStatuses = new Set([
    'completed',
    'failed',
    'cancelled',
    'blocked',
    'dependency_closed',
  ]);
  for (let attempt = 0; attempt < 90; attempt += 1) {
    const bundle = await specForgeService.getRun(runId);
    const task = bundle.tasks.find(candidate => candidate.id === taskId);
    if (task && terminalStatuses.has(task.status)) {
      return bundle;
    }
    await sleep(2000);
  }
  throw new Error(timeoutMessage);
}

function sleep(ms: number) {
  return new Promise(resolve => window.setTimeout(resolve, ms));
}
