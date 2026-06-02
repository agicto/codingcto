'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SpecForgeWorkbench } from '@/features/specforge';
import { useLocale } from '@/hooks/use-locale';
import { useT } from '@/i18n';
import { useBindProjectRepository, useProjectContext } from '@/features/project/hooks/use-projects';
import {
  localizeProjectContextText,
  primaryRepositoryContext,
  projectContextReadiness,
} from '@/features/project/project-context';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
import {
  useApproveSpecForgePlan,
  useCreateGitHubIssue,
  useCreateSpecForgeProjectIdea,
  useDispatchExecutionRun,
  useGitHubRepositories,
  useGitHubRepositoryReadiness,
  useStartExecutionRun,
  useUpsertGitHubRepository,
} from '@/features/specforge/hooks/use-specforge';
import {
  specForgeService,
  type GitHubRepositoryReadinessCheckDTO,
} from '@/features/specforge/services/specforge-service';

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
      <ProjectContextReadiness context={loadedContext} />
      {!repositoryId ? (
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          <Alert>
            <AlertTitle>{t('primaryRequired.title')}</AlertTitle>
            <AlertDescription>
              {t('primaryRequired.description')}
            </AlertDescription>
          </Alert>
          <ProjectRepositoryBindPanel
            projectId={projectId}
            workspaceId={loadedContext.project.workspace_id}
          />
        </div>
      ) : (
        <>
          <ProjectE2ERunPanel
            projectId={validProjectId}
            projectName={loadedContext.project.name}
            repository={selectedRepository?.repository}
          />
          <SpecForgeWorkbench
            key={repositoryId}
            projectId={validProjectId}
            initialRepositoryId={repositoryId}
            projectLabel={loadedContext.project.name}
            repositoryLocked
            pageScroll
          />
        </>
      )}
    </div>
  );
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

function ProjectRepositoryBindPanel({
  projectId,
  workspaceId,
}: {
  projectId: number;
  workspaceId: string;
}) {
  const t = useT('dashboard.projectDelivery.bindPanel');
  const bindRepository = useBindProjectRepository(projectId);
  const globalRepositoriesQuery = useGitHubRepositories();
  const upsertRepository = useUpsertGitHubRepository();
  const repositories = globalRepositoriesQuery.data?.repositories ?? [];
  const [repositoryUrl, setRepositoryUrl] = useState('');
  const [role, setRole] = useState('primary');
  const [message, setMessage] = useState('');
  const parsedRepository = useMemo(() => parseGitHubRepositoryURL(repositoryUrl), [repositoryUrl]);

  function findInstalledRepository() {
    if (!parsedRepository) {
      return undefined;
    }
    return repositories.find(
      repository =>
        repository.github_owner.toLowerCase() === parsedRepository.owner.toLowerCase() &&
        repository.github_repo.toLowerCase() === parsedRepository.repo.toLowerCase()
    );
  }

  async function bindRepositoryToProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!parsedRepository) {
      setMessage('请输入有效的 GitHub 仓库链接，例如 https://github.com/owner/repo。');
      return;
    }
    const installedRepository = findInstalledRepository();
    if (!installedRepository) {
      setMessage('GitHub App 已安装，但当前可访问仓库列表里没有这个仓库。请确认安装时选择了该仓库，然后刷新。');
      return;
    }
    setMessage('');
    try {
      const repository = await upsertRepository.mutateAsync({
        repository_id: installedRepository.repository_id,
        workspace_id: workspaceId,
        github_installation_id: installedRepository.github_installation_id,
        github_owner: installedRepository.github_owner,
        github_repo: installedRepository.github_repo,
        default_branch: installedRepository.default_branch,
        is_private: installedRepository.is_private,
      });
      const response = await bindRepository.mutateAsync({
        repository_id: repository.repository_id,
        role: role as 'primary' | 'dependency' | 'docs' | 'infra',
      });
      setRepositoryUrl('');
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
        <CardDescription>
          直接粘贴 GitHub 仓库链接。CodingCTO 会从已安装的 GitHub App 仓库列表中匹配，然后绑定到当前项目。
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
          onSubmit={bindRepositoryToProject}
        >
          <div className="space-y-2">
            <Label htmlFor="project-repository-url">GitHub 仓库链接</Label>
            <Input
              id="project-repository-url"
              value={repositoryUrl}
              onChange={event => setRepositoryUrl(event.target.value)}
              placeholder="https://github.com/owner/repo"
            />
            {repositories.length > 0 ? (
              <div className="text-xs leading-5 text-text-muted">
                已检测到 {repositories.length} 个 GitHub App 可访问仓库。
              </div>
            ) : (
              <div className="text-xs leading-5 text-warning">
                暂未读取到 GitHub App 仓库，请先在 GitHub 设置里同步安装结果。
              </div>
            )}
          </div>
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
          <div className="flex items-end">
            <Button
              type="submit"
              disabled={
                bindRepository.isPending ||
                upsertRepository.isPending ||
                !repositoryUrl.trim()
              }
            >
              {bindRepository.isPending || upsertRepository.isPending ? t('binding') : '绑定仓库'}
            </Button>
          </div>
        </form>
        {message && (
          <div className="mt-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-5 text-text-muted">
            {message}
          </div>
        )}
      </CardContent>
    </Card>
  );
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
  const readiness = readinessQuery.data;
  const readinessBlockingChecks =
    readiness?.checks.filter(check => check.required && check.status !== 'ok') ?? [];
  const readinessChecking = Boolean(repository?.repository_id) && readinessQuery.isFetching && !readiness;
  const readinessBlocked = Boolean(readiness && !readiness.ready);

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
                <div className="mt-3 grid gap-2 md:grid-cols-2">
                  {readiness.checks.map(check => (
                    <ReadinessCheckRow key={check.key} check={check} />
                  ))}
                </div>
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
            <Button
              type="button"
              onClick={runFlow}
              disabled={
                running ||
                readinessChecking ||
                readinessBlocked ||
                !repository?.repository_id ||
                !issueTitle.trim()
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
    installation: 'GitHub App installation is synced',
    installation_token: 'GitHub App token is available',
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
    return `GitHub App is missing ${permissionName}; later CI reads may be unavailable`;
  }
  return `GitHub App is missing required ${permissionName} permission`;
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

function parseGitHubRepositoryURL(value: string) {
  const normalized = value.trim();
  if (!normalized) {
    return null;
  }
  const shorthand = normalized.match(/^([\w.-]+)\/([\w.-]+?)(?:\.git)?$/);
  if (shorthand) {
    return { owner: shorthand[1], repo: shorthand[2] };
  }
  try {
    const url = new URL(normalized);
    if (!url.hostname.endsWith('github.com')) {
      return null;
    }
    const [owner, repo] = url.pathname.replace(/^\/+|\/+$/g, '').split('/');
    if (!owner || !repo) {
      return null;
    }
    return { owner, repo: repo.replace(/\.git$/, '') };
  } catch {
    return null;
  }
}

function ProjectContextReadiness({ context }: { context?: ProjectContextDTO }) {
  const t = useT('dashboard.projectDelivery.readiness');
  const { locale } = useLocale();
  const readiness = projectContextReadiness(context, locale);
  const repositories = context?.repository_contexts ?? [];

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-6 md:px-8">
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 text-primary">
                {t('projectScoped')}
              </Badge>
              <Badge
                variant="outline"
                className={
                  readiness.hasPrimaryRepository
                    ? 'border-success/30 text-success'
                    : 'border-warning/30 text-warning'
                }
              >
                {readiness.hasPrimaryRepository ? t('primaryReady') : t('primaryRequired')}
              </Badge>
            </div>
            <h2 className="mt-3 text-base font-semibold text-text-main">
              {context?.project.name ?? t('projectContext')}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">{readiness.summary}</p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <ReadinessMetric label={t('metrics.repos')} value={readiness.activeRepositoryCount} />
            <ReadinessMetric
              label={t('metrics.readOnly')}
              value={readiness.readOnlyRepositoryCount}
            />
            <ReadinessMetric label={t('metrics.skills')} value={readiness.skillCount} />
            <ReadinessMetric label={t('metrics.warnings')} value={readiness.warningCount} />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm">
          <div className="font-medium text-text-main">{t('nextAction')}</div>
          <div className="mt-1 text-text-muted">{readiness.nextAction}</div>
        </div>
        {readiness.guardrails.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2">
            {readiness.guardrails.map(guardrail => (
              <Badge key={guardrail} variant="outline" className="text-text-muted">
                {guardrail}
              </Badge>
            ))}
          </div>
        )}
        {repositories.length > 0 && (
          <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {repositories.map(repositoryContext => (
              <ProjectRepositoryCard
                key={repositoryContext.repository.repository_id}
                repositoryContext={repositoryContext}
                locale={locale}
                t={t}
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function ReadinessMetric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-sm font-semibold text-text-main">{value}</div>
      <div className="mt-1 text-text-muted">{label}</div>
    </div>
  );
}

function ProjectRepositoryCard({
  repositoryContext,
  locale,
  t,
}: {
  repositoryContext: ProjectRepositoryContextDTO;
  locale: string;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  const {
    repository,
    profile,
    architecture_snapshot: architectureSnapshot,
    skills,
    warnings,
  } = repositoryContext;
  const repoWarnings = [
    ...(warnings ?? []),
    ...(repositoryContext.architecture_warnings ?? []),
    ...(profile?.warnings ?? []),
  ];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-main">
            {repository.repository_id}
          </div>
          <div className="mt-1 text-xs text-text-muted">
            {profile?.summary ?? t('repository.noProfile')}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{t(`roles.${repository.role}`)}</Badge>
          <Badge variant="outline">
            {repository.active ? t('repository.active') : t('repository.inactive')}
          </Badge>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {(profile?.stack ?? []).slice(0, 5).map(stack => (
          <Badge key={stack} variant="outline" className="text-text-muted">
            {stack}
          </Badge>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2 text-xs text-text-muted">
        <div>{t('repository.testCommands', { count: profile?.test_commands?.length ?? 0 })}</div>
        <div>{t('repository.skills', { count: skills?.length ?? 0 })}</div>
        <div>{t('repository.modules', { count: architectureSnapshot?.modules.length ?? 0 })}</div>
        <div>
          {t('repository.ciWorkflows', { count: architectureSnapshot?.ci_workflows.length ?? 0 })}
        </div>
      </div>
      <div className="mt-3 rounded-md border border-border-subtle bg-bg-surface px-3 py-2 text-xs leading-5 text-text-muted">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium text-text-main">{t('repository.architecture')}</span>
          <Badge
            variant="outline"
            className={
              architectureSnapshot && !repositoryContext.architecture_stale
                ? 'border-success/30 text-success'
                : 'border-warning/30 text-warning'
            }
          >
            {architectureSnapshot
              ? repositoryContext.architecture_stale
                ? t('repository.stale')
                : t('repository.fresh')
              : t('repository.missing')}
          </Badge>
        </div>
        <div className="mt-1 truncate">
          {architectureSnapshot?.commit_sha || t('repository.generateSnapshot')}
        </div>
      </div>
      {repoWarnings.length > 0 && (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
          {localizeProjectContextText(repoWarnings[0], locale)}
        </div>
      )}
    </div>
  );
}
