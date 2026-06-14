'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  ArrowRight,
  FolderGit2,
  Github,
  ScrollText,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  useBindProjectRepository,
  useProjectContext,
  useProjectReadiness,
} from '@/features/project/hooks/use-projects';
import {
  primaryRepositoryContext,
  projectContextSnapshotState,
  projectSkillContract,
} from '@/features/project/project-context';
import {
  projectContextHref,
  projectRequirementNewHref,
} from '@/features/project/project-utils';
import {
  projectReadinessBadgeClass,
  projectReadinessDecision,
} from '@/features/project/project-readiness';
import type {
  ProjectContextDTO,
  ProjectReadinessCheckDTO,
  ProjectReadinessDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
import { useGitHubRepositories } from '@/features/specforge/hooks/use-specforge';
import type { GitHubRepositoryDTO } from '@/features/specforge/services/specforge-service';
import { useT } from '@/i18n';
import { cn } from '@/utils';

export function ProjectOverviewPage() {
  const t = useT('dashboard.projectOverview');
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const readinessQuery = useProjectReadiness(validProjectId);
  const context = contextQuery.data?.context;
  const readiness = readinessQuery.data?.readiness;

  if (!validProjectId) {
    return (
      <ProjectOverviewState
        title={t('states.invalidTitle')}
        description={t('states.invalidDescription')}
      />
    );
  }

  if (!context && contextQuery.isFetching) {
    return (
      <ProjectOverviewState
        title={t('states.loadingTitle')}
        description={t('states.loadingDescription')}
      />
    );
  }

  if (contextQuery.isError || !context) {
    return (
      <ProjectOverviewState
        title={t('states.unavailableTitle')}
        description={t('states.unavailableDescription')}
      />
    );
  }

  return <ProjectDetailPage context={context} readiness={readiness} />;
}

function ProjectDetailPage({
  context,
  readiness,
}: {
  context: ProjectContextDTO;
  readiness?: ProjectReadinessDTO;
}) {
  const t = useT('dashboard.projectOverview');
  const repositories = context.repository_contexts ?? [];
  const primaryRepository = primaryRepositoryContext(context);
  const decision = localizedDecision(t, context.project.id, readiness);
  const requiredChecks = (readiness?.checks ?? []).filter(check => check.required);
  const optionalChecks = (readiness?.checks ?? []).filter(check => !check.required);
  const snapshotState = projectContextSnapshotState(context);
  const skills = projectSkillContract(context);
  const architectureReadyCount = repositories.filter(
    item => item.profile && item.architecture_snapshot && !item.architecture_stale
  ).length;
  const knowledgeReadyCount = [
    Boolean(context.project.description?.trim()),
    snapshotState.deepWikiCount > 0,
    architectureReadyCount > 0,
    skills.effectiveSkillNames.length > 0,
  ].filter(Boolean).length;

  return (
    <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="border-b border-border-subtle pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-[4px] px-2 py-0.5 text-[11px]">
            {t('badges.project')}
          </Badge>
          <Badge
            variant="outline"
            className={cn(
              'rounded-[4px] px-2 py-0.5 text-[11px]',
              projectReadinessBadgeClass(readiness?.readiness_status)
            )}
          >
            {readinessStatusLabel(t, readiness?.readiness_status)}
          </Badge>
          <Badge variant="outline" className="rounded-[4px] px-2 py-0.5 text-[11px]">
            {projectStatusLabel(context.project.status, t)}
          </Badge>
        </div>
        <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight text-text-main">
              {context.project.name}
            </h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
              {context.project.description || t('brief.empty')}
            </p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2">
            <Button asChild variant="outline" size="sm">
              <Link href={projectContextHref(context.project.id)}>{t('actions.context')}</Link>
            </Button>
            <Button
              asChild
              size="sm"
              disabled={readiness?.next_step !== 'create_requirement'}
              className="rounded-[4px]"
            >
              <Link href={projectRequirementNewHref(context.project.id)}>
                {t('actions.newRequirement')}
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <ProjectIdentitySection context={context} primaryRepository={primaryRepository} />
          <ProjectRepositoriesSection context={context} />
          <ProjectRecentWorkSection projectId={context.project.id} readyForRequirement={readiness?.next_step === 'create_requirement'} />
        </div>
        <aside className="space-y-6 xl:sticky xl:top-6 xl:self-start">
          <ProjectNextActionSection
            projectId={context.project.id}
            decision={decision}
            requiredChecks={requiredChecks}
            optionalChecks={optionalChecks}
          />
          <ProjectKnowledgeSection
            context={context}
            knowledgeReadyCount={knowledgeReadyCount}
            architectureReadyCount={architectureReadyCount}
          />
        </aside>
      </div>
    </main>
  );
}

function ProjectIdentitySection({
  context,
  primaryRepository,
}: {
  context: ProjectContextDTO;
  primaryRepository?: ProjectRepositoryContextDTO;
}) {
  const t = useT('dashboard.projectOverview');

  return (
    <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-center gap-2">
        <ScrollText className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-medium text-text-main">{t('identity.title')}</h2>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <IdentityItem label={t('identity.slug')} value={context.project.slug} />
        <IdentityItem label={t('identity.workspace')} value={context.project.workspace_id} />
        <IdentityItem
          label={t('identity.status')}
          value={projectStatusLabel(context.project.status, t)}
        />
        <IdentityItem
          label={t('identity.primaryRepo')}
          value={primaryRepository?.repository.repository_id || t('primaryRepository.notConnected')}
        />
      </div>
    </section>
  );
}

function ProjectRepositoriesSection({ context }: { context: ProjectContextDTO }) {
  const t = useT('dashboard.projectOverview');
  const bindRepository = useBindProjectRepository(context.project.id);
  const repositoriesQuery = useGitHubRepositories({ workspace_id: context.project.workspace_id });
  const authorizedRepositories = repositoriesQuery.data?.repositories ?? [];
  const appAuthorizedRepositories = authorizedRepositories.filter(
    repository => repository.github_installation_id > 0
  );
  const manualRepositories = authorizedRepositories.filter(
    repository => repository.github_installation_id === 0
  );
  const repositories = context.repository_contexts ?? [];
  const primaryRepository = primaryRepositoryContext(context);
  const contextRepositories = repositories.filter(
    item => item.repository.active && item.repository.role !== 'primary'
  );
  const boundRepositoriesById = new Map(
    repositories.map(item => [item.repository.repository_id, item])
  );
  const allAuthorizedRepositoriesBound =
    appAuthorizedRepositories.length > 0 &&
    appAuthorizedRepositories.every(repository => boundRepositoriesById.has(repository.repository_id));
  const [message, setMessage] = useState('');
  const [query, setQuery] = useState('');
  const filteredRepositories = (() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) {
      return appAuthorizedRepositories;
    }
    return appAuthorizedRepositories.filter(repository =>
      [
        repository.github_owner,
        repository.github_repo,
        `${repository.github_owner}/${repository.github_repo}`,
        repository.repository_id,
      ]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(normalized))
    );
  })();
  const authorizeMoreHref = `/console/settings?tab=github&return_to=${encodeURIComponent(
    `/console/projects/${context.project.id}`
  )}`;

  async function bind(repositoryId: string, role: 'primary' | 'dependency') {
    setMessage('');
    try {
      await bindRepository.mutateAsync({ repository_id: repositoryId, role });
      setMessage(repositoryCopy(t, 'boundMessage'));
    } catch {
      setMessage(repositoryCopy(t, 'bindFailed'));
    }
  }

  return (
    <section
      id="repository-binding"
      className="rounded-[4px] border border-border-subtle bg-bg-surface p-5"
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Github className="h-4 w-4 text-text-muted" />
            <h2 className="text-base font-medium text-text-main">{t('repositories.title')}</h2>
          </div>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            {t('repositories.description')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href={projectContextHref(context.project.id)}>{t('repositories.openContext')}</Link>
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="rounded-[4px]">
                {t('repositories.bindRepository')}
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-3xl">
              <DialogHeader>
                <DialogTitle>{t('repositories.dialogTitle')}</DialogTitle>
                <DialogDescription>{t('repositories.dialogDescription')}</DialogDescription>
              </DialogHeader>
              <DialogBody className="space-y-4">
                  <div className="rounded-[4px] border border-border-subtle bg-bg-subtle/40 p-4">
                  <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                    <div>
                      <div className="text-sm font-medium text-text-main">
                        {t('repositories.connectedRepositories')}
                      </div>
                      <p className="mt-1 text-sm leading-6 text-text-muted">
                        {primaryRepository
                          ? primaryRepository.repository.repository_id
                          : t('primaryRepository.notConnected')}
                      </p>
                      {primaryRepository &&
                      authorizedRepositories.some(
                        repository =>
                          repository.repository_id === primaryRepository.repository.repository_id &&
                          repository.github_installation_id === 0
                      ) ? (
                        <p className="mt-2 text-xs leading-5 text-warning">
                          {t('repositories.primaryNotAppAuthorized')}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      variant="outline"
                      className={cn(
                        'w-fit rounded-[4px]',
                        primaryRepository ? 'border-success/30 text-success' : 'border-warning/30 text-warning'
                      )}
                    >
                      {primaryRepository ? t('roles.primary') : t('status.notReady')}
                    </Badge>
                  </div>
                </div>

                <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  <div>
                    <div className="text-sm font-medium text-text-main">
                      {t('repositories.availableRepositories')}
                    </div>
                    <p className="mt-1 text-xs leading-5 text-text-muted">
                      {t('repositories.authorizedCount', {
                        count: appAuthorizedRepositories.length,
                      })}
                    </p>
                  </div>
                  <Button asChild variant="outline" size="sm" className="rounded-[4px]">
                    <Link href={authorizeMoreHref}>{repositoryCopy(t, 'authorizeMore')}</Link>
                  </Button>
                </div>

                <div className="rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-2">
                  <input
                    value={query}
                    onChange={event => setQuery(event.target.value)}
                    placeholder={t('repositories.searchPlaceholder')}
                    className="w-full bg-transparent text-sm text-text-main outline-none placeholder:text-text-muted"
                  />
                </div>
                {repositoriesQuery.isFetching ? (
                  <div className="rounded-[4px] border border-border-subtle bg-bg-subtle/40 p-4 text-sm text-text-muted">
                    {repositoryCopy(t, 'loading')}
                  </div>
                ) : filteredRepositories.length > 0 ? (
                  <>
                    <div className="max-h-[420px] overflow-y-auto rounded-[4px] border border-border-subtle">
                      {filteredRepositories.map(repository => (
                        <AuthorizedRepositoryRow
                          key={repository.repository_id}
                          repository={repository}
                          boundRepository={boundRepositoriesById.get(repository.repository_id)}
                          isPending={bindRepository.isPending}
                          onBind={bind}
                        />
                      ))}
                    </div>
                    {allAuthorizedRepositoriesBound ? (
                      <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-subtle/60 p-4">
                        <div className="text-sm font-medium text-text-main">
                          {t('repositories.allAuthorizedBoundTitle')}
                        </div>
                        <p className="mt-1 text-sm leading-6 text-text-muted">
                          {repositoryCopy(t, 'allAuthorizedBoundHint')}
                        </p>
                        <Button asChild variant="outline" size="sm" className="mt-3 rounded-[4px]">
                          <Link href={authorizeMoreHref}>
                            {repositoryCopy(t, 'authorizeMore')}
                          </Link>
                        </Button>
                      </div>
                    ) : null}
                  </>
                ) : appAuthorizedRepositories.length > 0 ? (
                  <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-subtle/40 p-4 text-sm text-text-muted">
                    {t('repositories.emptySearch')}
                  </div>
                ) : (
                  <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-subtle/40 p-4">
                    <div className="text-sm font-medium text-text-main">
                      {repositoryCopy(t, 'noAuthorizedTitle')}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      {repositoryCopy(t, 'noAuthorizedDescription')}
                    </p>
                    <Button asChild size="sm" className="mt-3 rounded-[4px]">
                      <Link href={authorizeMoreHref}>{repositoryCopy(t, 'authorizeMore')}</Link>
                    </Button>
                  </div>
                )}
                {manualRepositories.length > 0 ? (
                  <div className="rounded-[4px] border border-warning/30 bg-bg-subtle/40 p-4">
                    <div className="text-sm font-medium text-text-main">
                      {t('repositories.manualRepositoriesTitle')}
                    </div>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      {t('repositories.manualRepositoriesDescription')}
                    </p>
                    <div className="mt-3 space-y-2">
                      {manualRepositories.map(repository => (
                        <div
                          key={repository.repository_id}
                          className="flex flex-col gap-2 rounded-[4px] border border-border-subtle bg-bg-surface px-3 py-2 md:flex-row md:items-center md:justify-between"
                        >
                          <div className="min-w-0">
                            <div className="truncate text-sm font-medium text-text-main">
                              {repository.github_owner}/{repository.github_repo}
                            </div>
                            <div className="mt-0.5 truncate text-xs text-text-muted">
                              {repository.repository_id}
                            </div>
                          </div>
                          <Badge
                            variant="outline"
                            className="w-fit shrink-0 rounded-[4px] border-warning/30 text-warning"
                          >
                            {t('repositories.needsAppAuthorization')}
                          </Badge>
                        </div>
                      ))}
                    </div>
                    <Button asChild variant="outline" size="sm" className="mt-3 rounded-[4px]">
                      <Link href={authorizeMoreHref}>{repositoryCopy(t, 'authorizeMore')}</Link>
                    </Button>
                  </div>
                ) : null}
              </DialogBody>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <RepositorySummaryBlock
          title={t('repositories.primaryRepository')}
          description={
            primaryRepository?.repository.repository_id || t('primaryRepository.notConnected')
          }
          badge={primaryRepository ? t('roles.primary') : t('status.notReady')}
          tone={primaryRepository ? 'ready' : 'warning'}
          meta={
            primaryRepository?.architecture_snapshot
              ? t('repositories.architectureReady')
              : t('repositories.needsContext')
          }
        />
        <RepositorySummaryBlock
          title={t('repositories.contextRepositories')}
          description={
            contextRepositories.length > 0
              ? contextRepositories.map(item => item.repository.repository_id).join(', ')
              : t('repositories.noContextRepositories')
          }
          badge={t('repositories.boundCount', { count: contextRepositories.length })}
          tone="neutral"
          meta={t('repositories.contextHint')}
        />
      </div>

      {message ? (
        <div className="mt-4 rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-6 text-text-muted">
          {message}
        </div>
      ) : null}
    </section>
  );
}

function ProjectRecentWorkSection({
  projectId,
  readyForRequirement,
}: {
  projectId: number;
  readyForRequirement: boolean;
}) {
  const t = useT('dashboard.projectOverview');

  return (
    <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <FolderGit2 className="h-4 w-4 text-text-muted" />
            <h2 className="text-base font-medium text-text-main">{t('recent.title')}</h2>
          </div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{t('recent.description')}</p>
        </div>
        <Button asChild size="sm" disabled={!readyForRequirement} className="rounded-[4px]">
          <Link href={projectRequirementNewHref(projectId)}>{t('recent.createRequirement')}</Link>
        </Button>
      </div>
      <div className="mt-5 rounded-[4px] border border-dashed border-border-subtle bg-bg-subtle/30 p-4">
        <div className="text-sm font-medium text-text-main">{t('recent.emptyTitle')}</div>
        <p className="mt-1 text-sm leading-6 text-text-muted">
          {readyForRequirement ? t('recent.emptyDescription') : t('recent.readinessHint')}
        </p>
      </div>
    </section>
  );
}

function ProjectNextActionSection({
  projectId,
  decision,
  requiredChecks,
  optionalChecks,
}: {
  projectId: number;
  decision: ReturnType<typeof projectReadinessDecision>;
  requiredChecks: ProjectReadinessCheckDTO[];
  optionalChecks: ProjectReadinessCheckDTO[];
}) {
  const t = useT('dashboard.projectOverview');

  return (
    <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-medium text-text-main">{t('next.title')}</h2>
      </div>
      <p className="mt-1 text-sm leading-6 text-text-muted">{t('next.description')}</p>
      <div className="mt-4 rounded-[4px] border border-border-subtle bg-bg-subtle/40 p-4">
        <div className="text-sm font-medium text-text-main">{decision.title}</div>
        <p className="mt-1 text-sm leading-6 text-text-muted">
          {decision.description || t('next.fallback')}
        </p>
        <Button asChild size="sm" className="mt-4 rounded-[4px]">
          <Link href={normalizeProjectActionHref(projectId, decision.actionHref)}>
            {decision.actionLabel}
            <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
          </Link>
        </Button>
      </div>
      <CheckListBlock title={t('next.requiredChecks')} checks={requiredChecks} />
      {optionalChecks.length > 0 ? (
        <CheckListBlock title={t('next.optionalChecks')} checks={optionalChecks} className="mt-4" />
      ) : null}
    </section>
  );
}

function ProjectKnowledgeSection({
  context,
  knowledgeReadyCount,
  architectureReadyCount,
}: {
  context: ProjectContextDTO;
  knowledgeReadyCount: number;
  architectureReadyCount: number;
}) {
  const t = useT('dashboard.projectOverview');
  const snapshotState = projectContextSnapshotState(context);
  const skills = projectSkillContract(context);
  const repositories = context.repository_contexts ?? [];

  return (
    <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-5">
      <div className="flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-text-muted" />
        <h2 className="text-base font-medium text-text-main">{t('knowledge.title')}</h2>
      </div>
      <p className="mt-1 text-sm leading-6 text-text-muted">{t('knowledge.description')}</p>

      <div className="mt-4 space-y-3">
        <KnowledgeMetric
          label={t('knowledge.projectPrd')}
          value={
            context.project.description?.trim()
              ? t('knowledge.backgroundStarted')
              : t('knowledge.backgroundMissing')
          }
        />
        <KnowledgeMetric
          label={t('knowledge.wiki')}
          value={
            snapshotState.deepWikiCount > 0
              ? t('knowledge.wikiReady', { count: snapshotState.deepWikiCount })
              : t('knowledge.noWiki')
          }
        />
        <KnowledgeMetric
          label={t('knowledge.architecture')}
          value={t('knowledge.architectureReady', {
            ready: architectureReadyCount,
            total: repositories.length,
          })}
        />
        <KnowledgeMetric
          label={t('knowledge.skills')}
          value={
            skills.effectiveSkillNames.length > 0
              ? t('knowledge.skillsReady', { count: skills.effectiveSkillNames.length })
              : t('knowledge.noSkills')
          }
        />
        <KnowledgeMetric
          label={t('knowledge.latestSnapshot')}
          value={
            snapshotState.snapshot?.updated_at
              ? new Date(snapshotState.snapshot.updated_at).toLocaleString()
              : t('knowledge.noSnapshotTitle')
          }
        />
      </div>

      <div className="mt-4 rounded-[4px] border border-border-subtle bg-bg-subtle/40 px-3 py-2 text-sm text-text-muted">
        {t('knowledge.ready', { ready: knowledgeReadyCount, total: 4 })}
      </div>

      <Button asChild variant="outline" size="sm" className="mt-4 rounded-[4px]">
        <Link href={projectContextHref(context.project.id)}>{t('knowledge.manage')}</Link>
      </Button>
    </section>
  );
}

function CheckListBlock({
  title,
  checks,
  className,
}: {
  title: string;
  checks: ProjectReadinessCheckDTO[];
  className?: string;
}) {
  const t = useT('dashboard.projectOverview');

  return (
    <div className={cn('mt-4', className)}>
      <div className="text-xs font-medium uppercase tracking-[0.08em] text-text-muted">{title}</div>
      {checks.length > 0 ? (
        <div className="mt-2 space-y-2">
          {checks.map(check => (
            <div
              key={check.key}
              className="rounded-[4px] border border-border-subtle bg-bg-subtle/30 px-3 py-2"
            >
              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-text-main">{check.label}</div>
                  {check.detail ? (
                    <div className="mt-1 text-xs leading-5 text-text-muted">{check.detail}</div>
                  ) : null}
                </div>
                <Badge
                  variant="outline"
                  className={cn(
                    'shrink-0 rounded-[4px] text-[11px]',
                    check.status === 'ready'
                      ? 'border-success/30 text-success'
                      : check.status === 'blocked'
                        ? 'border-warning/30 text-warning'
                        : 'border-primary/30 text-primary'
                  )}
                >
                  {readinessStatusLabel(t, check.status)}
                </Badge>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="mt-2 text-sm text-text-muted">{t('next.noRequiredChecks')}</div>
      )}
    </div>
  );
}

function AuthorizedRepositoryRow({
  repository,
  boundRepository,
  isPending,
  onBind,
}: {
  repository: GitHubRepositoryDTO;
  boundRepository?: ProjectRepositoryContextDTO;
  isPending: boolean;
  onBind: (repositoryId: string, role: 'primary' | 'dependency') => void;
}) {
  const t = useT('dashboard.projectOverview');
  const isBound = Boolean(boundRepository);
  const isPrimary = boundRepository?.repository.role === 'primary';

  return (
    <div className="flex flex-col gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0">
        <div className="truncate text-sm font-medium text-text-main">
          {repository.github_owner}/{repository.github_repo}
        </div>
        <div className="mt-0.5 truncate text-xs text-text-muted">
          {repository.repository_id} · {repository.default_branch}
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <Badge variant="outline">{repository.is_private ? repositoryCopy(t, 'private') : repositoryCopy(t, 'public')}</Badge>
        {isBound ? (
          <>
            <Badge
              variant="outline"
              className={isPrimary ? 'border-success/30 text-success' : undefined}
            >
              {isPrimary ? t('roles.primary') : repositoryRoleLabel(boundRepository?.repository.role ?? '', t)}
            </Badge>
            <Badge variant="outline">{repositoryCopy(t, 'bound')}</Badge>
          </>
        ) : (
          <>
            <Button
              type="button"
              size="sm"
              disabled={isPending}
              onClick={() => onBind(repository.repository_id, 'primary')}
              className="rounded-[4px]"
            >
              {isPending ? repositoryCopy(t, 'binding') : repositoryCopy(t, 'primaryAction')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => onBind(repository.repository_id, 'dependency')}
              className="rounded-[4px]"
            >
              {repositoryCopy(t, 'contextAction')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function IdentityItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[4px] border border-border-subtle bg-bg-subtle/30 px-3 py-2">
      <div className="text-xs uppercase tracking-[0.08em] text-text-muted">{label}</div>
      <div className="mt-1 break-words text-sm font-medium text-text-main">{value}</div>
    </div>
  );
}

function RepositorySummaryBlock({
  title,
  description,
  badge,
  tone,
  meta,
}: {
  title: string;
  description: string;
  badge: string;
  tone: 'ready' | 'warning' | 'neutral';
  meta: string;
}) {
  return (
    <div className="rounded-[4px] border border-border-subtle bg-bg-subtle/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-sm font-medium text-text-main">{title}</div>
          <div className="mt-1 text-sm leading-6 text-text-muted">{description}</div>
        </div>
        <Badge
          variant="outline"
          className={cn(
            'shrink-0 rounded-[4px] text-[11px]',
            tone === 'ready'
              ? 'border-success/30 text-success'
              : tone === 'warning'
                ? 'border-warning/30 text-warning'
                : ''
          )}
        >
          {badge}
        </Badge>
      </div>
      <div className="mt-3 text-xs leading-5 text-text-muted">{meta}</div>
    </div>
  );
}

function KnowledgeMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[4px] border border-border-subtle bg-bg-subtle/30 px-3 py-2">
      <div className="text-sm text-text-muted">{label}</div>
      <div className="text-sm font-medium text-text-main">{value}</div>
    </div>
  );
}

function localizedDecision(
  t: ReturnType<typeof useT<'dashboard.projectOverview'>>,
  projectId: number,
  readiness?: ProjectReadinessDTO
) {
  const decision = projectReadinessDecision(projectId, readiness);
  const step = readiness?.next_step;

  switch (step) {
    case 'bind_repository':
    case 'configure_github':
    case 'review_context':
    case 'connect_runtime':
    case 'add_skills':
    case 'configure_expert_policy':
    case 'create_requirement':
      return {
        ...decision,
        title: t(`decisions.${step}.title`),
        actionLabel: t(`decisions.${step}.action`),
      };
    default:
      return {
        ...decision,
        title: t('decisions.default.title'),
        actionLabel: t('decisions.default.action'),
      };
  }
}

function projectStatusLabel(
  status: string,
  t: ReturnType<typeof useT<'dashboard.projectOverview'>>
) {
  return status === 'archived' ? t('projectStatus.archived') : t('projectStatus.active');
}

function readinessStatusLabel(
  t: ReturnType<typeof useT<'dashboard.projectOverview'>>,
  status?: string
) {
  switch (status) {
    case 'ready':
      return t('status.ready');
    case 'blocked':
      return t('status.blocked');
    default:
      return t('status.attention');
  }
}

function normalizeProjectActionHref(projectId: number, actionHref: string) {
  if (actionHref === '#repository-binding') {
    return projectContextHref(projectId);
  }
  if (actionHref === '#github-setup') {
    return '/console/settings?tab=github';
  }
  return actionHref;
}

function repositoryRoleLabel(
  role: string,
  t: ReturnType<typeof useT<'dashboard.projectOverview'>>
) {
  switch (role) {
    case 'primary':
      return t('roles.primary');
    case 'dependency':
      return t('roles.dependency');
    case 'docs':
      return t('roles.docs');
    case 'infra':
      return t('roles.infra');
    default:
      return role;
  }
}

function repositoryCopy(
  t: ReturnType<typeof useT<'dashboard.projectOverview'>>,
  key:
    | 'authorizeMore'
    | 'loading'
    | 'noAuthorizedTitle'
    | 'noAuthorizedDescription'
    | 'private'
    | 'public'
    | 'bound'
    | 'binding'
    | 'primaryAction'
    | 'contextAction'
    | 'allAuthorizedBoundHint'
    | 'boundMessage'
    | 'bindFailed'
) {
  return t(`repositories.${key}`);
}

function ProjectOverviewState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 md:px-8">
      <Alert>
        <AlertTitle>{title}</AlertTitle>
        <AlertDescription className="mt-2">{description}</AlertDescription>
      </Alert>
    </div>
  );
}
