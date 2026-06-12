'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useState } from 'react';
import { GitBranch, Github } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  useBindProjectRepository,
  useProjectContext,
} from '@/features/project/hooks/use-projects';
import type {
  ProjectContextDTO,
  ProjectRepositoryContextDTO,
} from '@/features/project/services/project-service';
import { useGitHubRepositories } from '@/features/specforge/hooks/use-specforge';
import type { GitHubRepositoryDTO } from '@/features/specforge/services/specforge-service';
import { useT } from '@/i18n';

export function ProjectOverviewPage() {
  const t = useT('dashboard.projectOverview');
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const validProjectId = Number.isFinite(projectId) ? projectId : 0;
  const contextQuery = useProjectContext(validProjectId);
  const context = contextQuery.data?.context;

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

  return <ProjectRepositoryBindingPage context={context} />;
}

function ProjectRepositoryBindingPage({ context }: { context: ProjectContextDTO }) {
  const t = useT('dashboard.projectOverview');
  const bindRepository = useBindProjectRepository(context.project.id);
  const repositoriesQuery = useGitHubRepositories({ workspace_id: context.project.workspace_id });
  const authorizedRepositories = repositoriesQuery.data?.repositories ?? [];
  const repositories = context.repository_contexts ?? [];
  const boundRepositoriesById = new Map(
    repositories.map(item => [item.repository.repository_id, item])
  );
  const primaryRepository = repositories.find(item => item.repository.role === 'primary');
  const allAuthorizedRepositoriesBound =
    authorizedRepositories.length > 0 &&
    authorizedRepositories.every(repository => boundRepositoriesById.has(repository.repository_id));
  const authorizeMoreHref = `/console/settings?tab=github&return_to=${encodeURIComponent(
    `/console/projects/${context.project.id}`
  )}`;
  const [message, setMessage] = useState('');

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
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-5 px-4 py-7 md:px-8 md:py-10">
      <header className="border-b border-border-subtle pb-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="rounded-[4px] px-2 py-0.5 text-[11px]">
            {t('badges.project')}
          </Badge>
          <Badge
            variant="outline"
            className={
              primaryRepository
                ? 'rounded-[4px] border-success/30 px-2 py-0.5 text-[11px] text-success'
                : 'rounded-[4px] border-warning/30 px-2 py-0.5 text-[11px] text-warning'
            }
          >
            {primaryRepository ? t('status.connected') : t('status.notReady')}
          </Badge>
        </div>
        <h1 className="mt-4 text-2xl font-semibold tracking-tight text-text-main">
          {context.project.name}
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
          {context.project.description || t('brief.empty')}
        </p>
      </header>

      <section
        id="repository-binding"
        className="scroll-mt-20 rounded-[4px] border border-border-subtle bg-bg-surface p-5"
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
          <Button asChild variant="outline" size="sm" className="shrink-0">
            <Link href={authorizeMoreHref}>{repositoryCopy(t, 'authorizeMore')}</Link>
          </Button>
        </div>

        <div className="mt-5">
          {repositoriesQuery.isFetching ? (
            <div className="rounded-[4px] border border-border-subtle bg-bg-subtle/40 p-4 text-sm text-text-muted">
              {repositoryCopy(t, 'loading')}
            </div>
          ) : authorizedRepositories.length > 0 ? (
            <div className="divide-y divide-border-subtle rounded-[4px] border border-border-subtle">
              {authorizedRepositories.map(repository => (
                <AuthorizedRepositoryRow
                  key={repository.repository_id}
                  repository={repository}
                  boundRepository={boundRepositoriesById.get(repository.repository_id)}
                  isPending={bindRepository.isPending}
                  onBind={bind}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-subtle/40 p-4">
              <div className="text-sm font-medium text-text-main">
                {repositoryCopy(t, 'noAuthorizedTitle')}
              </div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {repositoryCopy(t, 'noAuthorizedDescription')}
              </p>
              <Button asChild size="sm" className="mt-3">
                <Link href={authorizeMoreHref}>{repositoryCopy(t, 'authorizeMore')}</Link>
              </Button>
            </div>
          )}
        </div>

        {allAuthorizedRepositoriesBound ? (
          <div className="mt-4 rounded-[4px] border border-border-subtle bg-bg-subtle/60 px-3 py-2 text-sm leading-6 text-text-muted">
            {repositoryCopy(t, 'allAuthorizedBoundHint')}
          </div>
        ) : null}

        {message ? (
          <div className="mt-4 rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-2 text-sm leading-6 text-text-muted">
            {message}
          </div>
        ) : null}
      </section>
    </main>
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
    <div className="flex flex-col gap-3 px-3 py-3 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-2">
        <GitBranch className="h-4 w-4 shrink-0 text-text-muted" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-main">
            {repository.github_owner}/{repository.github_repo}
          </div>
          <div className="mt-0.5 truncate text-xs text-text-muted">
            {repository.repository_id} · {repository.default_branch}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        {repository.is_private ? (
          <Badge variant="outline">{repositoryCopy(t, 'private')}</Badge>
        ) : (
          <Badge variant="outline">{repositoryCopy(t, 'public')}</Badge>
        )}
        {isBound ? (
          <>
            <Badge
              variant="outline"
              className={isPrimary ? 'border-success/30 text-success' : undefined}
            >
              {isPrimary
                ? t('roles.primary')
                : repositoryRoleLabel(boundRepository?.repository.role ?? '', t)}
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
            >
              {isPending ? repositoryCopy(t, 'binding') : repositoryCopy(t, 'primaryAction')}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isPending}
              onClick={() => onBind(repository.repository_id, 'dependency')}
            >
              {repositoryCopy(t, 'contextAction')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
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
    | 'allAuthorizedBoundHint'
    | 'loading'
    | 'noAuthorizedTitle'
    | 'noAuthorizedDescription'
    | 'private'
    | 'public'
    | 'bound'
    | 'binding'
    | 'primaryAction'
    | 'contextAction'
    | 'boundMessage'
    | 'bindFailed'
) {
  const value = t(`repositories.${key}`);
  if (!value.startsWith('dashboard.projectOverview.repositories.')) {
    return value;
  }
  return {
    authorizeMore: '授权更多仓库',
    allAuthorizedBoundHint:
      '当前已授权仓库都已绑定。要添加更多仓库，请先在 GitHub App 中授权更多仓库，再回到这里绑定。',
    loading: '正在加载已授权仓库...',
    noAuthorizedTitle: '没有已授权仓库',
    noAuthorizedDescription: '请先在设置中连接 GitHub，并授权至少一个仓库。',
    private: '私有',
    public: '公开',
    bound: '已绑定',
    binding: '绑定中',
    primaryAction: '设为主仓库',
    contextAction: '作为上下文',
    boundMessage: '仓库已绑定到项目。',
    bindFailed: '仓库绑定失败。请确认它属于当前工作区。',
  }[key];
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
