'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileText, Github, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/http/request';
import { ProjectRepositoryBindPanel } from '@/features/project/components/project-context-panel';
import {
  projectReadinessBadgeClass,
  projectReadinessDecision,
} from '@/features/project/project-readiness';
import {
  githubReadinessRecoveryActions,
  githubReadinessRecoveryDiagnostics,
  githubReadinessRecoveryTargetFromRepositoryId,
} from '@/features/project/github-readiness-recovery';
import {
  githubRepositoryIdentitySummary,
  type GitHubRepositoryIdentitySummary,
} from '@/features/project/github-repository-identity';
import {
  projectKeys,
  useProjectContext,
  useProjectReadiness,
} from '@/features/project/hooks/use-projects';
import { projectContextHref, projectOverviewHref } from '@/features/project/project-utils';
import {
  useGitHubRepositoryReadiness,
  useReindexRepoArchitecture,
} from '@/features/specforge/hooks/use-specforge';
import type {
  ProjectContextDTO,
  ProjectReadinessDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';

export function ProjectOverviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const readinessQuery = useProjectReadiness(validProjectId);
  const context = contextQuery.data?.context;

  if (!validProjectId) {
    return (
      <ProjectOverviewState
        title="Invalid project"
        description="Open a valid project from the project list."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!context && contextQuery.isFetching) {
    return <ProjectOverviewState title="Loading project" description="Reading project." />;
  }

  if (contextQuery.isError || !context) {
    return (
      <ProjectOverviewState
        title="Project unavailable"
        description="The project could not be loaded. Confirm backend auth and try again."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  return (
    <ProjectRepositoryBindingPage context={context} readiness={readinessQuery.data?.readiness} />
  );
}

function ProjectRepositoryBindingPage({
  context,
  readiness,
}: {
  context: ProjectContextDTO;
  readiness?: ProjectReadinessDTO;
}) {
  const repositories = context.repository_contexts ?? [];
  const primaryRepository = repositories.find(item => item.repository.role === 'primary');
  const boundRepositoryIds = repositories.map(item => item.repository.repository_id);
  const readinessDecision = projectReadinessDecision(context.project.id, readiness);

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-6 md:px-8">
      <header className="border-b border-border-subtle pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">Project</Badge>
          <Badge
            variant="outline"
            className={
              readiness
                ? projectReadinessBadgeClass(readiness.readiness_status)
                : primaryRepository
                  ? 'border-success/30 text-success'
                  : 'border-warning/30 text-warning'
            }
          >
            {readiness
              ? readiness.readiness_status === 'ready'
                ? 'Execution ready'
                : readiness.readiness_status === 'blocked'
                  ? 'Setup blocked'
                  : 'Needs attention'
              : primaryRepository
                ? 'GitHub bound'
                : 'GitHub required'}
          </Badge>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-tight text-text-main">
          {context.project.name}
        </h1>
        {context.project.description ? (
          <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
            {context.project.description}
          </p>
        ) : null}
      </header>

      {readiness ? (
        <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge
                  variant="outline"
                  className={projectReadinessBadgeClass(readiness.readiness_status)}
                >
                  {readiness.readiness_status === 'ready'
                    ? 'Ready'
                    : readiness.readiness_status === 'blocked'
                      ? 'Blocked'
                      : 'Attention'}
                </Badge>
                <span className="text-sm font-medium text-text-main">
                  {readinessDecision.title}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-text-muted">{readiness.summary}</p>
              <p className="mt-1 text-sm leading-6 text-text-muted">{readiness.next_action}</p>
            </div>
            <Button
              asChild
              variant={readiness.readiness_status === 'ready' ? 'default' : 'outline'}
            >
              <Link href={readinessDecision.actionHref}>
                {readinessDecision.actionLabel}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(readiness.checks ?? []).map(check => (
              <div key={check.key} className="rounded-md border border-border-subtle px-3 py-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="text-sm font-medium text-text-main">{check.label}</div>
                  <Badge variant="outline" className={projectReadinessBadgeClass(check.status)}>
                    {check.status === 'ready'
                      ? 'Ready'
                      : check.status === 'blocked'
                        ? 'Blocked'
                        : 'Attention'}
                  </Badge>
                </div>
                {check.detail ? (
                  <div className="mt-1 text-xs leading-5 text-text-muted">{check.detail}</div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-medium text-text-main">
              <Github className="h-4 w-4 text-primary" />
              GitHub repositories
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              Bind one primary repository first. Additional repositories can be dependency, docs, or
              infra context.
            </p>
          </div>
          {primaryRepository ? (
            <Button asChild variant="outline">
              <Link href={projectContextHref(context.project.id)}>
                Review context
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          ) : null}
        </div>

        {repositories.length > 0 ? (
          <div className="mt-4 divide-y divide-border-subtle rounded-md border border-border-subtle">
            {repositories.map(item => (
              <ProjectRepositoryMaterialRow
                key={item.repository.repository_id}
                projectId={context.project.id}
                item={item}
              />
            ))}
          </div>
        ) : null}
      </section>

      <ProjectRepositoryBindPanel
        id="repository-binding"
        projectId={context.project.id}
        workspaceId={context.project.workspace_id}
        boundRepositoryIds={boundRepositoryIds}
      />

      {repositories.length > 0 ? (
        <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
          <h2 className="flex items-center gap-2 text-base font-medium text-text-main">
            <FileText className="h-4 w-4 text-primary" />
            Generated materials
          </h2>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            Generated from repository tree and key files. No clone or sandbox is required in this
            first version.
          </p>
          <div className="mt-4 grid gap-2 text-sm text-text-muted sm:grid-cols-3">
            <MaterialMetric label="Bound repos" value={String(repositories.length)} />
            <MaterialMetric
              label="Analyzed repos"
              value={String(
                repositories.filter(item => item.architecture_snapshot && !item.architecture_stale)
                  .length
              )}
            />
            <MaterialMetric
              label="Profiles"
              value={String(repositories.filter(item => item.profile).length)}
            />
          </div>
        </section>
      ) : null}
    </main>
  );
}

function ProjectRepositoryMaterialRow({
  projectId,
  item,
}: {
  projectId: number;
  item: ProjectRepositoryContextDTO;
}) {
  const queryClient = useQueryClient();
  const reindexArchitecture = useReindexRepoArchitecture(item.repository.repository_id);
  const readinessQuery = useGitHubRepositoryReadiness(item.repository.repository_id);
  const [message, setMessage] = useState('');
  const analyzed = Boolean(item.architecture_snapshot && !item.architecture_stale);
  const readiness = readinessQuery.data;
  const readinessBlockingChecks =
    readiness?.checks.filter(check => check.required && check.status !== 'ok') ?? [];
  const readinessChecking = readinessQuery.isFetching && !readiness;
  const scanBlocked = Boolean(readiness && !readiness.ready);
  const inferredRecoveryTarget = githubReadinessRecoveryTargetFromRepositoryId(
    item.repository.repository_id
  );
  const recoveryTarget =
    readiness?.github_owner && readiness.github_repo
      ? {
          owner: readiness.github_owner,
          repo: readiness.github_repo,
          repositoryId: item.repository.repository_id,
          returnTo: projectOverviewHref(projectId),
        }
      : inferredRecoveryTarget
        ? { ...inferredRecoveryTarget, returnTo: projectOverviewHref(projectId) }
        : undefined;
  const recoveryActions = githubReadinessRecoveryActions(readinessBlockingChecks, recoveryTarget);
  const recoveryDiagnostics = githubReadinessRecoveryDiagnostics(readinessBlockingChecks);
  const identitySummary = githubRepositoryIdentitySummary({
    repositoryId: item.repository.repository_id,
    githubOwner: readiness?.github_owner,
    githubRepo: readiness?.github_repo,
  });

  async function handleScan() {
    if (scanBlocked || readinessChecking) {
      setMessage(readinessProblemSummary(readinessBlockingChecks));
      return;
    }
    setMessage('');
    try {
      await reindexArchitecture.mutateAsync({
        default_branch: item.profile?.default_branch,
      });
      await queryClient.invalidateQueries({ queryKey: projectKeys.readiness(projectId) });
      await queryClient.invalidateQueries({ queryKey: projectKeys.context(projectId) });
      setMessage('Materials generated from repository tree.');
    } catch (error) {
      setMessage(
        error instanceof ApiError
          ? `Scan failed: ${error.message}`
          : 'Scan failed. Check GitHub setup and try again.'
      );
    }
  }
  const scanDisabled = reindexArchitecture.isPending || readinessChecking || scanBlocked;
  const scanLabel = reindexArchitecture.isPending
    ? 'Generating'
    : readinessChecking
      ? 'Checking GitHub'
      : scanBlocked
        ? 'GitHub setup required'
        : analyzed
          ? 'Regenerate materials'
          : 'Generate materials';

  return (
    <div className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <div className="truncate text-sm font-medium text-text-main">
            {item.repository.repository_id}
          </div>
          <Badge variant="outline">{item.repository.role}</Badge>
          <Badge
            variant="outline"
            className={
              analyzed ? 'border-success/30 text-success' : 'border-warning/30 text-warning'
            }
          >
            {analyzed ? 'Materials ready' : 'Needs scan'}
          </Badge>
        </div>
        <div className="mt-1 text-xs leading-5 text-text-muted">
          {item.profile?.summary ?? 'No generated materials yet. Scan the repository first.'}
        </div>
        {item.profile || item.architecture_snapshot ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {(item.profile?.stack ?? item.architecture_snapshot?.stack ?? [])
              .slice(0, 5)
              .map(value => (
                <Badge key={value} variant="outline" className="text-[11px] text-text-muted">
                  {value}
                </Badge>
              ))}
            {(item.architecture_snapshot?.modules ?? []).slice(0, 3).map(value => (
              <Badge key={value} variant="outline" className="text-[11px] text-text-muted">
                {value}
              </Badge>
            ))}
            {(item.profile?.test_commands ?? item.architecture_snapshot?.test_commands ?? [])
              .slice(0, 3)
              .map(value => (
                <Badge key={value} variant="outline" className="text-[11px] text-text-muted">
                  {value}
                </Badge>
              ))}
          </div>
        ) : null}
        {message ? <div className="mt-1 text-xs leading-5 text-text-muted">{message}</div> : null}
        {scanBlocked ? (
          <RepositoryMaterialRecoveryPanel
            summary={readinessProblemSummary(readinessBlockingChecks)}
            actions={recoveryActions}
            diagnostics={recoveryDiagnostics}
            identity={identitySummary}
            isChecking={readinessQuery.isFetching}
            onRefresh={() => readinessQuery.refetch()}
          />
        ) : null}
      </div>
      <Button
        type="button"
        variant={analyzed ? 'outline' : 'default'}
        size="sm"
        disabled={scanDisabled}
        onClick={handleScan}
      >
        {scanLabel}
        <RefreshCw
          className={
            reindexArchitecture.isPending ? 'ml-1.5 h-3.5 w-3.5 animate-spin' : 'ml-1.5 h-3.5 w-3.5'
          }
        />
      </Button>
    </div>
  );
}

function RepositoryMaterialRecoveryPanel({
  summary,
  actions,
  diagnostics,
  identity,
  isChecking,
  onRefresh,
}: {
  summary: string;
  actions: ReturnType<typeof githubReadinessRecoveryActions>;
  diagnostics: ReturnType<typeof githubReadinessRecoveryDiagnostics>;
  identity: GitHubRepositoryIdentitySummary;
  isChecking: boolean;
  onRefresh: () => void;
}) {
  return (
    <div className="mt-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2">
      <div className="text-xs font-medium leading-5 text-warning">GitHub setup required</div>
      <div className="mt-1 text-xs leading-5 text-warning">{summary}</div>
      <RepositoryIdentityDiagnostic identity={identity} />
      {diagnostics.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {diagnostics.map(diagnostic => (
            <div key={diagnostic.checkKey} className="rounded-md bg-bg-surface px-2.5 py-2">
              <div className="text-xs font-medium leading-5 text-text-main">
                {diagnostic.checkKey} - {diagnostic.setupStep}
              </div>
              <div className="mt-0.5 text-xs leading-5 text-text-muted">{diagnostic.detail}</div>
            </div>
          ))}
        </div>
      ) : null}
      {actions.length > 0 ? (
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          {actions.map(action => (
            <div key={action.id} className="rounded-md bg-bg-surface px-2.5 py-2">
              <div className="text-xs font-medium leading-5 text-text-main">{action.label}</div>
              <div className="mt-0.5 text-xs leading-5 text-text-muted">{action.description}</div>
              <Button asChild variant="outline" size="sm" className="mt-2 h-7 text-xs">
                <Link href={action.href}>{action.label}</Link>
              </Button>
            </div>
          ))}
        </div>
      ) : null}
      <div className="mt-2 flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-7 text-xs"
          disabled={isChecking}
          onClick={onRefresh}
        >
          {isChecking ? 'Checking' : 'Recheck GitHub'}
        </Button>
      </div>
    </div>
  );
}

function RepositoryIdentityDiagnostic({ identity }: { identity: GitHubRepositoryIdentitySummary }) {
  return (
    <div className="mt-2 rounded-md bg-bg-surface px-2.5 py-2">
      <div className="text-xs font-medium leading-5 text-text-main">{identity.headline}</div>
      <div className="mt-0.5 text-xs leading-5 text-text-muted">{identity.detail}</div>
    </div>
  );
}

function readinessProblemSummary(
  checks: Array<{ message: string; detail?: string; required: boolean; status: string }>
) {
  if (checks.length === 0) {
    return 'GitHub repository is not ready for scanning.';
  }
  return checks
    .slice(0, 2)
    .map(check => check.detail || check.message)
    .join(' ');
}

function MaterialMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="text-sm font-medium text-text-main">{value}</div>
      <div className="mt-1 text-xs text-text-muted">{label}</div>
    </div>
  );
}

function ProjectOverviewState({
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
