'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import {
  Boxes,
  Building2,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  LogIn,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ProjectOnboardingWizard } from '@/features/project/components/project-onboarding-wizard';
import { useProjects } from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import { projectOverviewHref } from '@/features/project/project-utils';
import type { ProjectDTO } from '@/features/project/services/project-service';
import { useT } from '@/i18n';
import { cn } from '@/utils';

export function ProjectConsole() {
  const t = useT('dashboard.projectsConsole');
  const {
    workspacesQuery,
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
  } = useSelectedWorkspace();
  const projectsQuery = useProjects(selectedWorkspaceId);
  const backendUnavailable = workspacesQuery.isError;

  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects]
  );
  const hasWorkspace = Boolean(selectedWorkspaceId);

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-primary">
            <Sparkles className="h-3.5 w-3.5" />
            {t('eyebrow')}
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight text-text-main md:text-3xl">
            {t('title')}
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">{t('description')}</p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            workspacesQuery.refetch();
            if (selectedWorkspaceId) {
              projectsQuery.refetch();
            }
          }}
          disabled={workspacesQuery.isFetching || projectsQuery.isFetching}
        >
          {workspacesQuery.isFetching || projectsQuery.isFetching
            ? t('actions.refreshing')
            : t('actions.refresh')}
          <RefreshCw className="h-4 w-4" />
        </Button>
      </header>

      {backendUnavailable ? <BackendSessionGate t={t} /> : null}

      {!backendUnavailable ? (
        <>
          <ProjectOnboardingWizard
            workspaces={workspaces}
            projects={projects}
            selectedWorkspace={selectedWorkspace}
            selectedWorkspaceId={selectedWorkspaceId}
            setSelectedWorkspaceId={setSelectedWorkspaceId}
          />

          <Card className="gap-0 overflow-hidden border-border-subtle py-0 shadow-xs">
            <CardHeader className="flex flex-col gap-3 border-b border-border-subtle bg-background/95 p-5 md:flex-row md:items-center md:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Boxes className="h-4 w-4 text-primary" />
                  {t('projects.title')}
                </CardTitle>
                <CardDescription className="mt-1">{t('projects.description')}</CardDescription>
              </div>
              <Badge variant="outline" className="w-fit">
                {t('projects.count', { count: projects.length })}
              </Badge>
            </CardHeader>
            <CardContent className="p-0">
              {projectsQuery.isFetching ? (
                <div className="p-5 text-sm text-text-muted">{t('projects.loading')}</div>
              ) : projects.length > 0 ? (
                <div className="divide-y divide-border-subtle">
                  {projects.map(project => (
                    <ProjectRow key={`${project.id}-${project.slug}`} project={project} t={t} />
                  ))}
                </div>
              ) : (
                <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 p-8 text-center">
                  <div className="flex h-11 w-11 items-center justify-center rounded-[4px] border border-dashed border-border-subtle bg-bg-subtle text-primary">
                    {hasWorkspace ? (
                      <FolderGit2 className="h-5 w-5" />
                    ) : (
                      <Building2 className="h-5 w-5" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm font-medium text-text-main">
                      {hasWorkspace
                        ? t('projects.emptyForWorkspace')
                        : t('projects.selectWorkspace')}
                    </div>
                    <p className="mt-1 max-w-md text-sm leading-6 text-text-muted">
                      {hasWorkspace ? t('projects.emptyDescription') : t('workspace.empty')}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

function BackendSessionGate({
  t,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return (
    <Card className="border-warning/30 bg-warning-subtle shadow-xs">
      <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <div className="text-sm font-semibold text-text-main">{t('backendGate.title')}</div>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-text-muted">
            {t('backendGate.description')}
          </p>
          <p className="mt-2 text-xs leading-5 text-text-muted">{t('backendGate.localHint')}</p>
        </div>
        <Button asChild variant="outline" className="shrink-0">
          <Link href="/login?returnUrl=/console/projects">
            {t('actions.signInBackend')}
            <LogIn className="h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function ProjectRow({
  project,
  t,
}: {
  project: ProjectDTO;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
}) {
  return (
    <div className="group flex flex-col gap-4 p-4 transition-colors hover:bg-bg-subtle/70 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle bg-background text-primary">
            <Boxes className="h-4.5 w-4.5" />
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-text-main">{project.name}</h2>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
              <span className="font-mono">{project.slug}</span>
              <span>·</span>
              <span>{project.description || t('projects.noDescription')}</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={cn(project.status === 'active' && 'border-success/25 text-success')}
              >
                {project.status === 'active'
                  ? t('projects.status.active')
                  : t('projects.status.inactive')}
              </Badge>
              <Badge variant="outline">
                <GitBranch className="h-3.5 w-3.5" />
                {t('projects.primaryRepoRequired')}
              </Badge>
            </div>
          </div>
        </div>
      </div>
      <Button
        asChild
        variant="outline"
        className="shrink-0 md:opacity-85 md:transition-opacity md:group-hover:opacity-100"
      >
        <Link href={projectOverviewHref(project.id)}>
          {t('actions.openProject')}
          <GitPullRequest className="h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
