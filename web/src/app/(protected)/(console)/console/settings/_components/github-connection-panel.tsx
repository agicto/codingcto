'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  CheckCircle2,
  Github,
  GitPullRequest,
  Link2,
  PanelRight,
  Plus,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { env } from '@/config/env';
import { ROUTES } from '@/constants/routes';
import { useT } from '@/i18n';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  useGitHubRepositories,
  useGitHubSettings,
  useSyncGitHubInstallation,
  useUpsertGitHubSettings,
  useUpsertGitHubRepository,
} from '@/features/specforge/hooks/use-specforge';
import {
  parseGitHubRepositoryURL,
} from '@/features/specforge/github-repositories';

type GitHubSettings = {
  enabled: boolean;
  pullRequestSidebar: boolean;
  coAuthoredByTrailer: boolean;
  issuePrAutoLink: boolean;
};

const defaultSettings: GitHubSettings = {
  enabled: true,
  pullRequestSidebar: true,
  coAuthoredByTrailer: true,
  issuePrAutoLink: true,
};

type PendingRepository = {
  repositoryId: string;
  owner: string;
  repo: string;
  defaultBranch: string;
  isPrivate: boolean;
};

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

function repositoryIdFor(owner: string, repo: string) {
  return `github_${owner.trim()}__${repo.trim()}`;
}

type GitHubConnectionPanelProps = {
  mode?: 'github' | 'repositories';
};

export function GitHubConnectionPanel({ mode = 'github' }: GitHubConnectionPanelProps) {
  const t = useT('settings.github.panel');
  const router = useRouter();
  const searchParams = useSearchParams();
  const syncedInstallationReturnRef = useRef<string | null>(null);
  const stateWorkspaceId = searchParams.get('state')?.trim() || '';
  const [, setInstallationId] = useState(
    () => searchParams.get('installation_id')?.trim() || ''
  );
  const [repositoryURL, setRepositoryURL] = useState('https://github.com/agicto/codingcto-key');
  const [defaultBranch] = useState('main');
  const [pendingRepositories, setPendingRepositories] = useState<PendingRepository[]>([]);
  const [savedRepoId, setSavedRepoId] = useState('');
  const [message, setMessage] = useState('');
  const [installEntry] = useState(
    env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL || env.NEXT_PUBLIC_GITHUB_APP_SLUG || ''
  );

  const {
    selectedWorkspaceId: workspaceId,
  } = useSelectedWorkspace(stateWorkspaceId);
  const githubSettings = useGitHubSettings(workspaceId.trim());
  const connectedRepositoriesQuery = useGitHubRepositories(
    workspaceId.trim() ? { workspace_id: workspaceId.trim() } : undefined
  );
  const connectedRepositories = connectedRepositoriesQuery.data?.repositories ?? [];
  const connectedRepository = connectedRepositories[0];
  const visibleRepositoryDrafts = [
    ...pendingRepositories.map(repository => ({
      id: repository.repositoryId,
      owner: repository.owner,
      repo: repository.repo,
      defaultBranch: repository.defaultBranch,
      isPending: true,
    })),
    ...connectedRepositories
      .filter(
        repository =>
          !pendingRepositories.some(
            pending => pending.repositoryId === repository.repository_id
          )
      )
      .map(repository => ({
        id: repository.repository_id,
        owner: repository.github_owner,
        repo: repository.github_repo,
        defaultBranch: repository.default_branch,
        isPending: false,
      })),
  ];
  const upsertSettings = useUpsertGitHubSettings();
  const syncInstallation = useSyncGitHubInstallation();
  const upsertRepository = useUpsertGitHubRepository();
  const isSaving =
    upsertSettings.isPending ||
    syncInstallation.isPending ||
    upsertRepository.isPending;
  const settings: GitHubSettings = {
    enabled: githubSettings.data?.enabled ?? defaultSettings.enabled,
    pullRequestSidebar:
      githubSettings.data?.pull_request_sidebar ?? defaultSettings.pullRequestSidebar,
    coAuthoredByTrailer:
      githubSettings.data?.co_authored_by_trailer ?? defaultSettings.coAuthoredByTrailer,
    issuePrAutoLink: githubSettings.data?.issue_pr_auto_link ?? defaultSettings.issuePrAutoLink,
  };
  const repoIdForHref = savedRepoId || connectedRepository?.repository_id || '';
  const specForgeHref = repoIdForHref
    ? `${ROUTES.CONSOLE.SPECFORGE}?repo_id=${encodeURIComponent(repoIdForHref)}`
    : ROUTES.CONSOLE.SPECFORGE;
  const installURL = useMemo(() => {
    const entry = installEntry.trim();
    if (!entry) {
      return '';
    }
    if (entry.startsWith('https://github.com/')) {
      return entry;
    }
    const slug = entry
      .replace(/^https?:\/\/github\.com\/apps\//, '')
      .replace(/\/installations\/new.*$/, '')
      .replace(/^\/+|\/+$/g, '');
    const state = encodeURIComponent(workspaceId.trim());
    return `https://github.com/apps/${slug}/installations/new?state=${state}`;
  }, [installEntry, workspaceId]);
  const syncGitHubInstallation = useCallback(
    async (
      installationIdValue: string,
      workspaceIdValue: string,
      options: { clearReturnParams?: boolean } = {}
    ) => {
      if (!workspaceIdValue.trim()) {
        setMessage(t('messages.selectWorkspaceBeforeSync'));
        return false;
      }
      const parsedInstallationId = Number(installationIdValue);
      if (!Number.isFinite(parsedInstallationId) || parsedInstallationId <= 0) {
        setMessage(t('messages.validInstallationId'));
        return false;
      }
      setMessage('');
      try {
        const result = await syncInstallation.mutateAsync({
          workspace_id: workspaceIdValue.trim(),
          installation_id: parsedInstallationId,
        });
        setInstallationId(String(result.installation.installation_id));
        setMessage(
          result.repositories.length > 0
            ? t('messages.syncedWithRepos')
            : t('messages.syncedNoRepos')
        );
        if (options.clearReturnParams) {
          router.replace(`${ROUTES.CONSOLE.SETTINGS}?tab=github`, { scroll: false });
        }
        return true;
      } catch (error) {
        setMessage(
          `${errorMessage(error, t('messages.connectionFailed'))} ${t('messages.githubAppConfigHint')}`
        );
        return false;
      }
    },
    [router, syncInstallation, t]
  );

  useEffect(() => {
    const returnedInstallationId = searchParams.get('installation_id')?.trim();
    const setupAction = searchParams.get('setup_action')?.trim();
    const returnWorkspaceId = searchParams.get('state')?.trim() || workspaceId;
    if (!returnedInstallationId || !returnWorkspaceId) {
      return;
    }
    const syncKey = `${returnWorkspaceId}:${returnedInstallationId}:${setupAction || ''}`;
    if (syncedInstallationReturnRef.current === syncKey) {
      return;
    }
    syncedInstallationReturnRef.current = syncKey;
    const timeoutId = window.setTimeout(() => {
      void syncGitHubInstallation(returnedInstallationId, returnWorkspaceId, {
        clearReturnParams: true,
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [searchParams, syncGitHubInstallation, workspaceId]);

  async function updateSetting<Key extends keyof GitHubSettings>(
    key: Key,
    value: GitHubSettings[Key]
  ) {
    if (!workspaceId.trim()) {
      setMessage(t('messages.selectWorkspaceBeforeSettings'));
      return;
    }
    const next = { ...settings, [key]: value };
    setMessage('');
    try {
      await upsertSettings.mutateAsync({
        workspace_id: workspaceId.trim(),
        enabled: next.enabled,
        pull_request_sidebar: next.pullRequestSidebar,
        co_authored_by_trailer: next.coAuthoredByTrailer,
        issue_pr_auto_link: next.issuePrAutoLink,
      });
      setMessage(t('messages.settingsSaved'));
    } catch (error) {
      setMessage(`${errorMessage(error, t('messages.connectionFailed'))} ${t('messages.settingsNotSaved')}`);
    }
  }

  function addRepositoryDraft() {
    const parsedRepository = parseGitHubRepositoryURL(repositoryURL);
    if (!workspaceId.trim()) {
      setMessage(t('messages.selectWorkspaceBeforeSettings'));
      return false;
    }
    if (!parsedRepository) {
      setMessage(t('messages.repositoryURLInvalid'));
      return false;
    }

    const repositoryId = repositoryIdFor(parsedRepository.owner, parsedRepository.repo);
    const alreadyExists =
      connectedRepositories.some(repository => repository.repository_id === repositoryId) ||
      pendingRepositories.some(repository => repository.repositoryId === repositoryId);
    if (alreadyExists) {
      setSavedRepoId(repositoryId);
      setRepositoryURL('');
      setMessage(t('messages.repositoryAlreadyAdded'));
      return true;
    }

    setPendingRepositories(current => [
      {
        repositoryId,
        owner: parsedRepository.owner,
        repo: parsedRepository.repo,
        defaultBranch: defaultBranch.trim() || 'main',
        isPrivate: false,
      },
      ...current,
    ]);
    setSavedRepoId(repositoryId);
    setRepositoryURL('');
    setMessage(t('messages.repositoryQueued'));
    return true;
  }

  async function saveRepository(repository: PendingRepository) {
    return upsertRepository.mutateAsync({
      repository_id: repository.repositoryId,
      workspace_id: workspaceId.trim(),
      github_owner: repository.owner,
      github_repo: repository.repo,
      default_branch: repository.defaultBranch,
      is_private: repository.isPrivate,
    });
  }

  async function saveRepositoryURL() {
    if (!workspaceId.trim()) {
      setMessage(t('messages.selectWorkspaceBeforeSettings'));
      return;
    }
    let repositoriesToSave = pendingRepositories;
    if (repositoriesToSave.length === 0 && repositoryURL.trim()) {
      const parsedRepository = parseGitHubRepositoryURL(repositoryURL);
      if (!parsedRepository) {
        setMessage(t('messages.repositoryURLInvalid'));
        return;
      }
      repositoriesToSave = [
        {
          repositoryId: repositoryIdFor(parsedRepository.owner, parsedRepository.repo),
          owner: parsedRepository.owner,
          repo: parsedRepository.repo,
          defaultBranch: defaultBranch.trim() || 'main',
          isPrivate: false,
        },
      ];
    }
    if (repositoriesToSave.length === 0) {
      setMessage(t('messages.noRepositoryToSave'));
      return;
    }

    setMessage('');
    try {
      let lastRepositoryId = '';
      for (const repository of repositoriesToSave) {
        const saved = await saveRepository(repository);
        lastRepositoryId = saved.repository_id;
      }
      setPendingRepositories(current =>
        current.filter(
          pending =>
            !repositoriesToSave.some(repository => repository.repositoryId === pending.repositoryId)
        )
      );
      setRepositoryURL('');
      setSavedRepoId(lastRepositoryId);
      setMessage(t('messages.repositorySaved'));
    } catch (error) {
      setMessage(`${errorMessage(error, t('messages.connectionFailed'))} ${t('messages.backendAuthHint')}`);
    }
  }

  if (mode === 'repositories') {
    return (
      <div className="mx-auto w-full max-w-3xl">
        {message ? (
          <div className="mb-3 rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
            {message}
          </div>
        ) : null}

        <Card>
          <CardHeader>
            <CardTitle>{t('simpleRepository.title')}</CardTitle>
            <CardDescription>{t('simpleRepository.description')}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Input
              value={repositoryURL}
              onChange={event => setRepositoryURL(event.target.value)}
              placeholder="https://github.com/agicto/codingcto-key"
            />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="outline" onClick={addRepositoryDraft}>
                <Plus className="h-4 w-4" />
                {t('simpleRepository.addRepository')}
              </Button>
              <div className="flex items-center gap-3">
                <span className="text-sm text-text-muted">
                  {pendingRepositories.length > 0
                    ? t('simpleRepository.unsaved', { count: pendingRepositories.length })
                    : t('simpleRepository.saved')}
                </span>
                <Button type="button" onClick={saveRepositoryURL} disabled={upsertRepository.isPending}>
                  {upsertRepository.isPending ? t('actions.connecting') : t('simpleRepository.save')}
                </Button>
              </div>
            </div>

            {visibleRepositoryDrafts.length > 0 ? (
              <div className="space-y-2">
                {visibleRepositoryDrafts.map(repository => (
                  <div
                    key={repository.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2 text-sm text-text-muted"
                  >
                    <div className="min-w-0">
                      <div className="truncate font-medium text-text-main">
                        {repository.owner}/{repository.repo}
                      </div>
                      <div className="mt-0.5 text-xs">
                        {repository.isPending
                          ? t('simpleRepository.pending')
                          : repository.defaultBranch}
                      </div>
                    </div>
                    {repository.isPending ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-8 w-8 shrink-0"
                        onClick={() =>
                          setPendingRepositories(current =>
                            current.filter(item => item.repositoryId !== repository.id)
                          )
                        }
                        aria-label={t('simpleRepository.removePending')}
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  const repositoryManagementCard = (
    <section className="space-y-3">
      <h3 className="text-base font-semibold">{t('sections.repository')}</h3>
      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
              {connectedRepository ? (
                <CheckCircle2 className="h-5 w-5 text-success" />
              ) : (
                <GitPullRequest className="h-5 w-5" />
              )}
            </div>
            <div>
              <div className="font-medium">
                {connectedRepository
                  ? `${connectedRepository.github_owner}/${connectedRepository.github_repo}`
                  : t('repositoryCta.title')}
              </div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {connectedRepository
                  ? `${t('status.connected', { repoId: connectedRepository.repository_id })} · ${connectedRepository.default_branch}`
                  : t('repositoryCta.description')}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`${ROUTES.CONSOLE.SETTINGS}?tab=repositories`}
              className={buttonVariants({
                variant: 'outline',
                className: 'inline-flex flex-row items-center gap-1.5 whitespace-nowrap',
              })}
            >
              <span>{t('actions.enterRepository')}</span>
              <ArrowRight className="h-4 w-4 shrink-0" />
            </Link>
            {connectedRepository ? (
              <Link
                href={specForgeHref}
                className={buttonVariants({
                  className: 'inline-flex flex-row items-center gap-1.5 whitespace-nowrap',
                })}
              >
                <span>{t('actions.useInCodingCTO')}</span>
                <ArrowRight className="h-4 w-4 shrink-0" />
              </Link>
            ) : null}
          </div>
        </CardContent>
      </Card>
    </section>
  );

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <p className="text-sm leading-6 text-text-muted">
        {t('intro')}
      </p>

      {message ? (
        <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
          {message}
        </div>
      ) : null}

      {mode === 'github' ? (
        <>
          <Card>
            <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
              <div className="flex gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
                  <Github className="h-5 w-5" />
                </div>
                <div>
                  <div className="font-medium">{t('enable.title')}</div>
                  <p className="mt-1 text-sm leading-6 text-text-muted">
                    {t('enable.description')}
                  </p>
                </div>
              </div>
              <Switch
                checked={settings.enabled}
                disabled={isSaving}
                onCheckedChange={checked => updateSetting('enabled', checked)}
              />
            </CardContent>
          </Card>

          <section className="space-y-3">
            <h3 className="text-base font-semibold">{t('sections.connection')}</h3>
            <Card>
              <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
                <div className="flex gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
                    <Github className="h-5 w-5" />
                  </div>
                  <div>
                    <div className="font-medium">{t('app.title')}</div>
                    <p className="mt-1 text-sm leading-6 text-text-muted">
                      {t('app.descriptionPrefix')}{' '}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">MUL-123</code>
                      {t('app.descriptionSuffix')}
                    </p>
                  </div>
                </div>
                {installURL && workspaceId.trim() ? (
                  <Button asChild disabled={!settings.enabled}>
                    <a href={installURL} target="_blank" rel="noreferrer">
                      {t('actions.installApp')}
                    </a>
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      setMessage(
                        workspaceId.trim()
                          ? t('messages.installEntryRequired')
                          : t('messages.selectWorkspaceBeforeInstall')
                      );
                    }}
                    disabled={!settings.enabled}
                  >
                    {t('actions.installApp')}
                  </Button>
                )}
              </CardContent>
            </Card>
          </section>

          <section className="space-y-3">
            <h3 className="text-base font-semibold">{t('sections.features')}</h3>
            <Card>
              <CardContent className="divide-y divide-border-subtle p-0">
                <FeatureToggle
                  icon={PanelRight}
                  title={t('features.prSidebar.title')}
                  description={t('features.prSidebar.description')}
                  checked={settings.pullRequestSidebar}
                  disabled={!settings.enabled || isSaving}
                  onCheckedChange={checked => updateSetting('pullRequestSidebar', checked)}
                />
                <FeatureToggle
                  icon={SlidersHorizontal}
                  title={t('features.coAuthor.title')}
                  description={
                    <>
                      {t('features.coAuthor.descriptionPrefix')}{' '}
                      <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">
                        Co-authored-by: codingcto-agent &lt;github@codingcto.local&gt;
                      </code>{' '}
                      {t('features.coAuthor.descriptionSuffix')}
                    </>
                  }
                  checked={settings.coAuthoredByTrailer}
                  disabled={!settings.enabled || isSaving}
                  onCheckedChange={checked => updateSetting('coAuthoredByTrailer', checked)}
                />
                <FeatureToggle
                  icon={Link2}
                  title={t('features.autoLink.title')}
                  description={t('features.autoLink.description')}
                  checked={settings.issuePrAutoLink}
                  disabled={!settings.enabled || isSaving}
                  onCheckedChange={checked => updateSetting('issuePrAutoLink', checked)}
                />
              </CardContent>
            </Card>
          </section>

          {repositoryManagementCard}
        </>
      ) : null}
    </div>
  );
}

function FeatureToggle({
  icon: Icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: typeof GitPullRequest;
  title: string;
  description: ReactNode;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
      <div className="flex gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium">{title}</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}
