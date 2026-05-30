'use client';

import { useParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SpecForgeWorkbench } from '@/features/specforge';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextReadiness,
} from '@/features/project/project-context';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';

export function ProjectSpecForgeConsole() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const contextQuery = useProjectContext(Number.isFinite(projectId) ? projectId : 0);
  const context = contextQuery.data?.context;
  const selectedRepository = primaryRepositoryContext(context);
  const repositoryId = selectedRepository?.repository.repository_id;
  const hasProjectContext = Boolean(context);

  return (
    <div>
      <ProjectContextReadiness context={context} />
      {hasProjectContext && !repositoryId ? (
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          <Alert>
            <AlertTitle>Bind a primary repository to start planning</AlertTitle>
            <AlertDescription>
              CodingCTO can read dependency, docs, and infra repositories as context, but MVP
              execution only writes to the active primary repository.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <SpecForgeWorkbench
          key={repositoryId ?? 'demo'}
          projectId={Number.isFinite(projectId) ? projectId : undefined}
          initialRepositoryId={repositoryId}
          projectLabel={context?.project.name}
          repositoryLocked={Boolean(repositoryId)}
        />
      )}
    </div>
  );
}

function ProjectContextReadiness({ context }: { context?: ProjectContextDTO }) {
  const readiness = projectContextReadiness(context);
  const repositories = context?.repository_contexts ?? [];

  return (
    <section className="mx-auto w-full max-w-7xl px-4 pt-6 md:px-8">
      <div className="rounded-lg border border-border-subtle bg-bg-surface p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="outline" className="border-primary/30 text-primary">
                Project scoped
              </Badge>
              <Badge
                variant="outline"
                className={
                  readiness.hasPrimaryRepository
                    ? 'border-success/30 text-success'
                    : 'border-warning/30 text-warning'
                }
              >
                {readiness.hasPrimaryRepository ? 'Primary ready' : 'Primary repo required'}
              </Badge>
            </div>
            <h2 className="mt-3 text-base font-semibold text-text-main">
              {context?.project.name ?? 'Project context'}
            </h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
              {readiness.summary}
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <ReadinessMetric label="Repos" value={readiness.activeRepositoryCount} />
            <ReadinessMetric label="Read-only" value={readiness.readOnlyRepositoryCount} />
            <ReadinessMetric label="Skills" value={readiness.skillCount} />
            <ReadinessMetric label="Warnings" value={readiness.warningCount} />
          </div>
        </div>
        <div className="mt-4 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm">
          <div className="font-medium text-text-main">Next action</div>
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
}: {
  repositoryContext: ProjectRepositoryContextDTO;
}) {
  const { repository, profile, skills, warnings } = repositoryContext;
  const repoWarnings = [...(warnings ?? []), ...(profile?.warnings ?? [])];

  return (
    <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-main">
            {repository.repository_id}
          </div>
          <div className="mt-1 text-xs text-text-muted">{profile?.summary ?? 'No profile yet.'}</div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{repository.role}</Badge>
          <Badge variant="outline">{repository.active ? 'active' : 'inactive'}</Badge>
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
        <div>{profile?.test_commands?.length ?? 0} test commands</div>
        <div>{skills?.length ?? 0} skills</div>
      </div>
      {repoWarnings.length > 0 && (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle px-3 py-2 text-xs leading-5 text-warning">
          {repoWarnings[0]}
        </div>
      )}
    </div>
  );
}
