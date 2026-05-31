'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { SpecForgeWorkbench } from '@/features/specforge';
import { useT } from '@/i18n';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import { primaryRepositoryContext } from '@/features/project/project-context';
import type { ProjectContextDTO } from '@/features/project/services/project-service';
import { ProjectContextPanel } from '@/features/project/components/project-context-panel';
import { ProjectOverview } from '@/features/project/components/project-overview';

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

  if (contextQuery.isError || !hasProjectContext) {
    return (
      <ProjectScopedState
        title={t('states.unavailable.title')}
        description={t('states.unavailable.description')}
        actionHref="/console/projects"
        actionLabel={t('states.unavailable.action')}
      />
    );
  }

  const projectContext = context as ProjectContextDTO;

  return (
    <div>
      <ProjectOverview context={projectContext} selectedRepository={selectedRepository} />
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
        {!repositoryId ? (
          <Alert className="mb-5">
            <AlertTitle>{t('primaryRequired.title')}</AlertTitle>
            <AlertDescription>{t('primaryRequired.description')}</AlertDescription>
          </Alert>
        ) : null}
        <ProjectContextPanel context={projectContext} />
      </div>
      {repositoryId ? (
        <div id="project-delivery">
          <SpecForgeWorkbench
            key={repositoryId}
            projectId={validProjectId}
            initialRepositoryId={repositoryId}
            projectLabel={context?.project.name}
            repositoryLocked
          />
        </div>
      ) : null}
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
