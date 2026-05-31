'use client';

import { FormEvent, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { SpecForgeWorkbench } from '@/features/specforge';
import { useGitHubRepositories } from '@/features/specforge/hooks/use-specforge';
import { useT } from '@/i18n';
import {
  useBindProjectRepository,
  useProjectContext,
  useUnbindProjectRepository,
} from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextContract,
  projectContextReadiness,
} from '@/features/project/project-context';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
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
  const workspaceId = context?.project.workspace_id ?? '';

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
      <ProjectContextReadiness context={projectContext} />
      <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
        {!repositoryId ? (
          <Alert>
            <AlertTitle>{t('primaryRequired.title')}</AlertTitle>
            <AlertDescription>{t('primaryRequired.description')}</AlertDescription>
          </Alert>
        ) : null}
        <ProjectRepositoryBindPanel
          id="repository-binding"
          projectId={projectId}
          workspaceId={workspaceId}
          boundRepositoryIds={(context?.repository_contexts ?? []).map(
            item => item.repository.repository_id
          )}
        />
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

function ProjectRepositoryBindPanel({
  id,
  projectId,
  workspaceId,
  boundRepositoryIds = [],
}: {
  id?: string;
  projectId: number;
  workspaceId: string;
  boundRepositoryIds?: string[];
}) {
  const t = useT('dashboard.projectDelivery.bindPanel');
  const bindRepository = useBindProjectRepository(projectId);
  const repositoriesQuery = useGitHubRepositories({ workspace_id: workspaceId });
  const repositories = repositoriesQuery.data?.repositories ?? [];
  const availableRepositories = repositories.filter(
    repository => !boundRepositoryIds.includes(repository.repository_id)
  );
  const allConnectedRepositoriesBound =
    repositories.length > 0 && availableRepositories.length === 0;
  const [repositoryId, setRepositoryId] = useState('');
  const [role, setRole] = useState('primary');
  const [message, setMessage] = useState('');

  async function bindRepositoryToProject(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const nextRepositoryId = repositoryId.trim();
    if (!nextRepositoryId) {
      setMessage(t('messages.repositoryRequired'));
      return;
    }
    setMessage('');
    try {
      const response = await bindRepository.mutateAsync({
        repository_id: nextRepositoryId,
        role: role as 'primary' | 'dependency' | 'docs' | 'infra',
      });
      setRepositoryId('');
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
    <Card id={id} className="mt-4 scroll-mt-20">
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <CardDescription>{t('description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]"
          onSubmit={bindRepositoryToProject}
        >
          <div className="space-y-2">
            <Label htmlFor="project-repository-id">{t('repositoryId')}</Label>
            {repositories.length > 0 ? (
              <Select
                value={repositoryId}
                onValueChange={setRepositoryId}
                disabled={allConnectedRepositoriesBound}
              >
                <SelectTrigger id="project-repository-id">
                  <SelectValue
                    placeholder={
                      allConnectedRepositoriesBound
                        ? t('allRepositoriesBound')
                        : t('selectRepository')
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {availableRepositories.map(repository => (
                    <SelectItem key={repository.repository_id} value={repository.repository_id}>
                      {repository.github_owner}/{repository.github_repo} (
                      {repository.default_branch})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : (
              <Input
                id="project-repository-id"
                value={repositoryId}
                onChange={event => setRepositoryId(event.target.value)}
                placeholder="github_multica_ai__multica"
              />
            )}
            {repositoriesQuery.isFetching && (
              <p className="text-xs leading-5 text-text-muted">{t('loadingRepositories')}</p>
            )}
            {!repositoriesQuery.isFetching && repositories.length === 0 && (
              <p className="text-xs leading-5 text-text-muted">
                {t('emptyRepositories')}{' '}
                <Link href="/console/settings?tab=github" className="text-primary hover:underline">
                  {t('connectRepository')}
                </Link>
              </p>
            )}
            {!repositoriesQuery.isFetching &&
              repositories.length > 0 &&
              availableRepositories.length === 0 && (
                <p className="text-xs leading-5 text-text-muted">{t('allRepositoriesBound')}</p>
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
                bindRepository.isPending || allConnectedRepositoriesBound || !repositoryId.trim()
              }
            >
              {bindRepository.isPending ? t('binding') : t('submit')}
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

function ProjectContextReadiness({ context }: { context?: ProjectContextDTO }) {
  const t = useT('dashboard.projectDelivery.readiness');
  const readiness = projectContextReadiness(context);
  const contract = projectContextContract(context);
  const repositories = context?.repository_contexts ?? [];
  const unbindRepository = useUnbindProjectRepository(context?.project.id ?? 0);
  const [message, setMessage] = useState('');

  async function handleUnbind(repositoryContext: ProjectRepositoryContextDTO) {
    if (repositoryContext.repository.role === 'primary') {
      setMessage(t('repository.primaryRemoveBlocked'));
      return;
    }
    setMessage('');
    try {
      await unbindRepository.mutateAsync(repositoryContext.repository.repository_id);
      setMessage(t('repository.removed', { repoId: repositoryContext.repository.repository_id }));
    } catch {
      setMessage(t('repository.removeFailed'));
    }
  }

  return (
    <section
      id="project-context"
      className="mx-auto w-full max-w-7xl scroll-mt-20 px-4 pt-6 md:px-8"
    >
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
        {contract && (
          <div className="mt-3 grid gap-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-xs md:grid-cols-[220px_minmax(0,1fr)]">
            <div>
              <div className="font-medium text-text-main">{t('contract.title')}</div>
              <div className="mt-1 text-text-muted">{contract.version}</div>
            </div>
            <div className="grid gap-2 sm:grid-cols-3">
              <div>
                <div className="font-medium text-text-main">{t('contract.execution')}</div>
                <div className="mt-1 text-text-muted">
                  {contract.primary_repository_id || t('repository.missing')}
                </div>
              </div>
              <div>
                <div className="font-medium text-text-main">{t('contract.skills')}</div>
                <div className="mt-1 text-text-muted">{contract.skill_names?.length ?? 0}</div>
              </div>
              <div>
                <div className="font-medium text-text-main">{t('contract.missingEvidence')}</div>
                <div className="mt-1 text-text-muted">{contract.missing_evidence?.length ?? 0}</div>
              </div>
            </div>
          </div>
        )}
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
                t={t}
                onUnbind={() => handleUnbind(repositoryContext)}
                unbinding={unbindRepository.isPending}
              />
            ))}
          </div>
        )}
        {message && (
          <div className="mt-3 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
            {message}
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
  t,
  onUnbind,
  unbinding,
}: {
  repositoryContext: ProjectRepositoryContextDTO;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  onUnbind: () => void;
  unbinding: boolean;
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
          {repository.role !== 'primary' ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-text-muted hover:text-text-main"
              disabled={unbinding}
              onClick={onUnbind}
            >
              {unbinding ? t('repository.removing') : t('repository.remove')}
            </Button>
          ) : null}
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
          {repoWarnings[0]}
        </div>
      )}
    </div>
  );
}
