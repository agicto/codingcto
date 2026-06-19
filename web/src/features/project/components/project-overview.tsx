'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { ArrowRight, FileText, Github, RefreshCw, Sparkles } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ApiError } from '@/http/request';
import { ProjectRepositoryBindPanel } from '@/features/project/components/project-context-panel';
import {
  ProjectAdvancedDetails,
  ProjectCommandHeader,
  ProjectReadinessStrip,
  type ProjectReadinessStripItem,
} from '@/features/project/components/project-flow-primitives';
import { projectKeys, useProjectContext } from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextReadiness,
  projectOverviewDecision,
  projectSkillContract,
} from '@/features/project/project-context';
import {
  projectContextHref,
  projectRequirementNewHref,
} from '@/features/project/project-utils';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
import {
  useGitHubRepositoryReadiness,
  useReindexRepoArchitecture,
} from '@/features/specforge/hooks/use-specforge';

export function ProjectOverviewPage() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
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

  return <ProjectDetailPage context={context} />;
}

function ProjectDetailPage({ context }: { context: ProjectContextDTO }) {
  const repositories = context.repository_contexts ?? [];
  const primaryRepository = primaryRepositoryContext(context);
  const boundRepositoryIds = repositories.map(item => item.repository.repository_id);
  const readiness = projectContextReadiness(context);
  const decision = projectOverviewDecision(context);
  const skills = projectSkillContract(context);
  const analyzedRepositoryCount = repositories.filter(
    item => item.architecture_snapshot && !item.architecture_stale
  ).length;
  const readinessStrip: ProjectReadinessStripItem[] = [
    {
      label: 'Project status',
      value: readiness.hasPrimaryRepository ? 'Ready to plan' : 'Setup required',
      helper: readiness.nextAction,
      tone: readiness.hasPrimaryRepository ? 'ready' : 'blocked',
    },
    {
      label: 'Primary repository',
      value: primaryRepository?.repository.repository_id ?? 'Missing',
      helper: primaryRepository ? 'Execution target selected' : 'Bind one writable repository',
      tone: primaryRepository ? 'ready' : 'blocked',
    },
    {
      label: 'Context',
      value: `${readiness.activeRepositoryCount} repos`,
      helper: `${analyzedRepositoryCount} analyzed · ${readiness.warningCount} warnings`,
      tone: readiness.warningCount > 0 ? 'waiting' : 'ready',
    },
    {
      label: 'Skills',
      value:
        skills.effectiveSkillNames.length > 0
          ? `${skills.effectiveSkillNames.length} active`
          : 'None',
      helper: skills.summary,
      tone: skills.effectiveSkillNames.length > 0 ? 'ready' : 'waiting',
    },
  ];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <ProjectCommandHeader
        title={context.project.name}
        description={context.project.description || 'No project description yet.'}
        badges={[
          { label: 'Project' },
          {
            label: readiness.hasPrimaryRepository ? 'GitHub bound' : 'GitHub required',
            tone: readiness.hasPrimaryRepository ? 'ready' : 'blocked',
          },
          {
            label: context.project.status,
            tone: context.project.status === 'active' ? 'ready' : 'muted',
          },
        ]}
        primaryAction={{
          label: decision.actionLabel,
          href: normalizeProjectActionHref(context.project.id, decision.actionHref),
          icon: <ArrowRight className="ml-1.5 h-3.5 w-3.5" />,
        }}
        secondaryActions={[
          {
            label: 'Review context',
            href: projectContextHref(context.project.id),
            variant: 'outline',
          },
        ]}
      />

      <ProjectReadinessStrip items={readinessStrip} />

      <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <Sparkles className="h-4 w-4 text-text-muted" />
              <h2 className="text-base font-medium text-text-main">Next action</h2>
            </div>
            <h3 className="mt-3 text-lg font-semibold text-text-main">{decision.title}</h3>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              {decision.description}
            </p>
          </div>
          <Button asChild className="shrink-0">
            <Link href={normalizeProjectActionHref(context.project.id, decision.actionHref)}>
              {decision.actionLabel}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </section>

      <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <h2 className="flex items-center gap-2 text-base font-medium text-text-main">
              <Github className="h-4 w-4 text-text-muted" />
              GitHub repository
            </h2>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              Keep one primary repository visible. Additional repositories stay as planning
              context.
            </p>
          </div>
          {primaryRepository ? (
            <Badge variant="outline" className="w-fit border-success/30 text-success">
              {primaryRepository.repository.repository_id}
            </Badge>
          ) : (
            <Badge variant="outline" className="w-fit border-warning/30 text-warning">
              Primary repository required
            </Badge>
          )}
        </div>
        <div className="mt-4">
          <ProjectRepositoryBindPanel
            id="repository-binding"
            projectId={context.project.id}
            workspaceId={context.project.workspace_id}
            boundRepositoryIds={boundRepositoryIds}
          />
        </div>
      </section>

      <ProjectAdvancedDetails
        title="Advanced project details"
        description="Identity, generated materials, repository scans, warnings, and raw context are kept here so the overview can stay focused on readiness and the next action."
      >
        <div className="space-y-5">
          <div className="grid gap-2 text-sm text-text-muted sm:grid-cols-4">
            <MaterialMetric label="Workspace" value={context.project.workspace_id} />
            <MaterialMetric label="Bound repos" value={String(repositories.length)} />
            <MaterialMetric label="Analyzed repos" value={String(analyzedRepositoryCount)} />
            <MaterialMetric label="Warnings" value={String(readiness.warningCount)} />
          </div>

          {repositories.length > 0 ? (
            <section className="rounded-md border border-border-subtle bg-bg-surface p-4">
              <h2 className="flex items-center gap-2 text-base font-medium text-text-main">
                <FileText className="h-4 w-4 text-text-muted" />
                Repository materials
              </h2>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                Generated from repository tree and key files. Regenerate only when context is stale.
              </p>
              <div className="mt-4 divide-y divide-border-subtle rounded-md border border-border-subtle">
                {repositories.map(item => (
                  <ProjectRepositoryMaterialRow
                    key={item.repository.repository_id}
                    projectId={context.project.id}
                    item={item}
                  />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      </ProjectAdvancedDetails>
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
        {message ? <div className="mt-1 text-xs leading-5 text-text-muted">{message}</div> : null}
        {scanBlocked ? (
          <div className="mt-2 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
            {readinessProblemSummary(readinessBlockingChecks)}
          </div>
        ) : null}
      </div>
      <Button type="button" variant={analyzed ? 'outline' : 'default'} size="sm" disabled={scanDisabled} onClick={handleScan}>
        {scanLabel}
        <RefreshCw
          className={
            reindexArchitecture.isPending
              ? 'ml-1.5 h-3.5 w-3.5 animate-spin'
              : 'ml-1.5 h-3.5 w-3.5'
          }
        />
      </Button>
    </div>
  );
}

function normalizeProjectActionHref(projectId: number, href: string) {
  if (href === '#project-requirement') {
    return projectRequirementNewHref(projectId);
  }
  if (href === '#project-context') {
    return projectContextHref(projectId);
  }
  return href;
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
      <div className="truncate text-sm font-medium text-text-main">{value}</div>
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
