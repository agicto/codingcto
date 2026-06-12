'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ChevronDown,
  Github,
  GitPullRequest,
  Link2,
  PanelRight,
  Plus,
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
  X,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
import {
  githubSetupChecklist,
  type GitHubSetupChecklistItem,
} from '@/features/project/github-setup-checklist';
import { useT } from '@/i18n';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  useGitHubRepositories,
  useGitHubInstallationStatus,
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
const defaultRepositoryURL = 'https://github.com/agicto/codingcto-key';
const githubRecoveryStoragePrefix = 'codingcto.githubRecovery.';

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

function parsedTargetRepositoryLabel(repositoryURL: string) {
  const parsed = parseGitHubRepositoryURL(repositoryURL);
  return parsed ? `${parsed.owner}/${parsed.repo}` : '';
}

function safeConsoleReturnPath(value: string) {
  const trimmed = value.trim();
  return trimmed.startsWith('/console/') ? trimmed : '';
}

function githubRecoveryStorageKey(workspaceId: string) {
  return `${githubRecoveryStoragePrefix}${workspaceId.trim()}`;
}

function withGitHubInstallState(installURL: string, workspaceId: string) {
  try {
    const url = new URL(installURL);
    url.searchParams.set('state', workspaceId);
    return url.toString();
  } catch {
    return installURL;
  }
}

function shellArg(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
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
  const targetRepositoryURL = searchParams.get('repository_url')?.trim() || '';
  const targetOwner = searchParams.get('owner')?.trim() || '';
  const targetRepo = searchParams.get('repo')?.trim() || '';
  const targetRepositoryId = searchParams.get('repository_id')?.trim() || '';
  const returnTo = safeConsoleReturnPath(searchParams.get('return_to') || '');
  const [, setInstallationId] = useState(
    () => searchParams.get('installation_id')?.trim() || ''
  );
  const [repositoryURL, setRepositoryURL] = useState(
    () =>
      targetRepositoryURL ||
      (targetOwner && targetRepo ? `https://github.com/${targetOwner}/${targetRepo}` : '') ||
      defaultRepositoryURL
  );
  const [defaultBranch] = useState('main');
  const [pendingRepositories, setPendingRepositories] = useState<PendingRepository[]>([]);
  const [savedRepoId, setSavedRepoId] = useState('');
  const [message, setMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [installEntry] = useState(
    env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL || env.NEXT_PUBLIC_GITHUB_APP_SLUG || ''
  );
  const targetRepositoryLabel =
    targetOwner && targetRepo
      ? `${targetOwner}/${targetRepo}`
      : targetRepositoryId || parsedTargetRepositoryLabel(targetRepositoryURL);
  const targetQuery = useMemo(() => {
    const params = new URLSearchParams();
    if (targetOwner) {
      params.set('owner', targetOwner);
    }
    if (targetRepo) {
      params.set('repo', targetRepo);
    }
    if (targetRepositoryURL) {
      params.set('repository_url', targetRepositoryURL);
    }
    if (targetRepositoryId) {
      params.set('repository_id', targetRepositoryId);
    }
    if (returnTo) {
      params.set('return_to', returnTo);
    }
    return params.toString();
  }, [returnTo, targetOwner, targetRepo, targetRepositoryId, targetRepositoryURL]);
  const repositorySettingsHref = `${ROUTES.CONSOLE.SETTINGS}?tab=repositories${targetQuery ? `&${targetQuery}` : ''}`;

  const {
    selectedWorkspaceId: workspaceId,
  } = useSelectedWorkspace(stateWorkspaceId);
  const githubSettings = useGitHubSettings(workspaceId.trim());
  const connectedRepositoriesQuery = useGitHubRepositories(
    workspaceId.trim() ? { workspace_id: workspaceId.trim() } : undefined
  );
  const installationStatusQuery = useGitHubInstallationStatus(workspaceId.trim());
  const connectedRepositories = connectedRepositoriesQuery.data?.repositories ?? [];
  const connectedInstallations = installationStatusQuery.data?.installations ?? [];
  const authorizedRepositoryCount =
    installationStatusQuery.data?.repository_count ?? connectedRepositories.length;
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
    const workspaceState = workspaceId.trim();
    if (!entry || !workspaceState) {
      return '';
    }
    if (entry.startsWith('https://github.com/')) {
      return withGitHubInstallState(entry, workspaceState);
    }
    const slug = entry
      .replace(/^https?:\/\/github\.com\/apps\//, '')
      .replace(/\/installations\/new.*$/, '')
      .replace(/^\/+|\/+$/g, '');
    return withGitHubInstallState(
      `https://github.com/apps/${slug}/installations/new`,
      workspaceState
    );
  }, [installEntry, workspaceId]);
  const setupChecklist = githubSetupChecklist({
    workspaceId,
    enabled: settings.enabled,
    installURL,
    connectedRepositoryCount: connectedRepositories.length,
  });
  const rememberGitHubRecoveryContext = useCallback(() => {
    if (!workspaceId.trim() || !targetQuery) {
      return;
    }
    window.sessionStorage.setItem(githubRecoveryStorageKey(workspaceId), targetQuery);
  }, [targetQuery, workspaceId]);
  const syncGitHubInstallation = useCallback(
    async (
      installationIdValue: string,
      workspaceIdValue: string,
      options: { clearReturnParams?: boolean; recoveryQuery?: string } = {}
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
          const recoveryQuery = options.recoveryQuery?.trim();
          router.replace(
            `${ROUTES.CONSOLE.SETTINGS}?tab=github${recoveryQuery ? `&${recoveryQuery}` : ''}`,
            { scroll: false }
          );
          window.sessionStorage.removeItem(githubRecoveryStorageKey(workspaceIdValue));
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
    const storedRecoveryQuery =
      window.sessionStorage.getItem(githubRecoveryStorageKey(returnWorkspaceId)) || '';
    if (!targetQuery && storedRecoveryQuery) {
      const params = new URLSearchParams(storedRecoveryQuery);
      params.set('tab', 'github');
      params.set('installation_id', returnedInstallationId);
      params.set('state', returnWorkspaceId);
      if (setupAction) {
        params.set('setup_action', setupAction);
      }
      router.replace(`${ROUTES.CONSOLE.SETTINGS}?${params.toString()}`, { scroll: false });
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
        recoveryQuery: targetQuery || storedRecoveryQuery,
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [router, searchParams, syncGitHubInstallation, targetQuery, workspaceId]);

  useEffect(() => {
    if (!targetRepositoryURL && (!targetOwner || !targetRepo)) {
      return;
    }
    const nextURL =
      targetRepositoryURL || `https://github.com/${targetOwner}/${targetRepo}`;
    const timeoutId = window.setTimeout(() => {
      setRepositoryURL(current => {
        const trimmed = current.trim();
        return !trimmed || trimmed === defaultRepositoryURL ? nextURL : current;
      });
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [targetOwner, targetRepo, targetRepositoryURL]);

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

  async function syncExistingInstallation(installationIdValue: number) {
    await syncGitHubInstallation(String(installationIdValue), workspaceId.trim());
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

        {targetRepositoryLabel ? (
          <GitHubRecoveryTargetPanel
            label={targetRepositoryLabel}
            repositoryId={targetRepositoryId}
            mode="repositories"
            returnTo={returnTo}
          />
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

  const hasInstallEntry = Boolean(installURL.trim());
  const connectionStatus = !settings.enabled
    ? 'disabled'
    : !hasInstallEntry
      ? 'notConfigured'
      : installationStatusQuery.isFetching
      ? 'checking'
      : connectedInstallations.length > 0
        ? 'connected'
        : 'notConnected';
  const connectionReady = connectionStatus === 'connected';
  const visibleConnectedRepositories = connectedRepositories.slice(0, 6);

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {message ? (
        <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
          {message}
        </div>
      ) : null}

      {targetRepositoryLabel ? (
        <GitHubRecoveryTargetPanel
          label={targetRepositoryLabel}
          repositoryId={targetRepositoryId}
          mode="github"
          returnTo={returnTo}
        />
      ) : null}

      <section className="rounded-[4px] border border-border-subtle bg-bg-surface">
        <div className="flex flex-col gap-5 border-b border-border-subtle p-6 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 gap-4">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle bg-bg-subtle">
              <Github className="h-5 w-5 text-text-main" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-semibold tracking-tight text-text-main">
                  {t('connectionPage.title')}
                </h3>
                <span className={githubConnectionStatusClassName(connectionStatus)}>
                  {t(`connectionPage.status.${connectionStatus}`)}
                </span>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-text-muted">
                {t('connectionPage.description')}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            {hasInstallEntry && workspaceId.trim() ? (
              <Button asChild disabled={!settings.enabled}>
                <a
                  href={installURL}
                  target="_blank"
                  rel="noreferrer"
                  onClick={rememberGitHubRecoveryContext}
                >
                  {connectionReady
                    ? t('connectionPage.actions.manageConnection')
                    : t('connectionPage.actions.connect')}
                </a>
              </Button>
            ) : (
              <Button
                type="button"
                disabled={!settings.enabled || (!hasInstallEntry && !workspaceId.trim())}
                onClick={() => {
                  if (!hasInstallEntry) {
                    setAdvancedOpen(true);
                    setMessage(t('connectionPage.notConfiguredMessage'));
                    return;
                  }
                  setMessage(t('messages.selectWorkspaceBeforeInstall'));
                }}
              >
                {hasInstallEntry
                  ? t('connectionPage.actions.connect')
                  : t('connectionPage.actions.configure')}
              </Button>
            )}
            <Button
              type="button"
              variant="outline"
              disabled={installationStatusQuery.isFetching}
              onClick={() => installationStatusQuery.refetch()}
            >
              <RefreshCw
                className={
                  installationStatusQuery.isFetching
                    ? 'h-4 w-4 animate-spin'
                    : 'h-4 w-4'
                }
              />
              {t('connectionPage.actions.refresh')}
            </Button>
          </div>
        </div>

        <div className="grid divide-y divide-border-subtle md:grid-cols-3 md:divide-x md:divide-y-0">
          <ConnectionMetric
            label={t('connectionPage.metrics.owners')}
            value={String(connectedInstallations.length)}
          />
          <ConnectionMetric
            label={t('connectionPage.metrics.repositories')}
            value={String(authorizedRepositoryCount)}
          />
          <ConnectionToggleMetric
            label={t('connectionPage.metrics.enabled')}
            checked={settings.enabled}
            disabled={isSaving}
            onCheckedChange={checked => updateSetting('enabled', checked)}
          />
        </div>
      </section>

      <section className="rounded-[4px] border border-border-subtle bg-bg-surface">
        <div className="border-b border-border-subtle px-5 py-4">
          <h3 className="text-sm font-semibold text-text-main">
            {t('connectionPage.accounts.title')}
          </h3>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {t('connectionPage.accounts.description')}
          </p>
        </div>
        <div className="divide-y divide-border-subtle">
          {installationStatusQuery.isLoading ? (
            <ConnectionEmptyRow text={t('connectionPage.accounts.loading')} />
          ) : connectedInstallations.length > 0 ? (
            connectedInstallations.map(installation => (
              <div
                key={installation.id}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Github className="h-5 w-5 shrink-0 text-text-main" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-main">
                      {installation.account_login}
                    </div>
                    <div className="mt-0.5 text-xs leading-5 text-text-muted">
                      {t('connectionPage.accounts.repoCount', {
                        count: installation.repository_count,
                      })}{' '}
                      · {t('connectionPage.accounts.lastSynced')}{' '}
                      {new Date(installation.updated_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={syncInstallation.isPending || !settings.enabled}
                  onClick={() => syncExistingInstallation(installation.installation_id)}
                >
                  {syncInstallation.isPending
                    ? t('actions.syncing')
                    : t('connectionPage.actions.sync')}
                </Button>
              </div>
            ))
          ) : (
            <ConnectionEmptyRow text={t('connectionPage.accounts.empty')} />
          )}
        </div>
      </section>

      <section className="rounded-[4px] border border-border-subtle bg-bg-surface">
        <div className="flex flex-col gap-3 border-b border-border-subtle px-5 py-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h3 className="text-sm font-semibold text-text-main">
              {t('connectionPage.repositories.title')}
            </h3>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {t('connectionPage.repositories.description')}
            </p>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href={`${ROUTES.CONSOLE.SETTINGS}?tab=repositories`}>
              {t('connectionPage.actions.manageRepositories')}
            </Link>
          </Button>
        </div>
        <div className="divide-y divide-border-subtle">
          {connectedRepositoriesQuery.isLoading ? (
            <ConnectionEmptyRow text={t('connectionPage.repositories.loading')} />
          ) : visibleConnectedRepositories.length > 0 ? (
            visibleConnectedRepositories.map(repository => (
              <div
                key={repository.repository_id}
                className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <GitPullRequest className="h-5 w-5 shrink-0 text-text-main" />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-text-main">
                      {repository.github_owner}/{repository.github_repo}
                    </div>
                    <div className="mt-0.5 text-xs leading-5 text-text-muted">
                      {repository.default_branch} · {repository.repository_id}
                    </div>
                  </div>
                </div>
                {connectedRepository?.repository_id === repository.repository_id ? (
                  <Button asChild size="sm">
                    <Link href={specForgeHref}>{t('actions.useInCodingCTO')}</Link>
                  </Button>
                ) : null}
              </div>
            ))
          ) : (
            <ConnectionEmptyRow text={t('connectionPage.repositories.empty')} />
          )}
        </div>
      </section>

      <section className="rounded-[4px] border border-border-subtle bg-bg-surface">
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-5 py-4 text-left"
          onClick={() => setAdvancedOpen(open => !open)}
        >
          <span>
            <span className="block text-sm font-semibold text-text-main">
              {t('connectionPage.advanced.title')}
            </span>
            <span className="mt-1 block text-sm leading-6 text-text-muted">
              {t('connectionPage.advanced.description')}
            </span>
          </span>
          <ChevronDown
            className={
              advancedOpen
                ? 'h-4 w-4 rotate-180 text-text-muted transition-transform'
                : 'h-4 w-4 text-text-muted transition-transform'
            }
          />
        </button>
        {advancedOpen ? (
          <div className="space-y-5 border-t border-border-subtle p-5">
            <section className="rounded-[4px] border border-border-subtle">
              <div className="border-b border-border-subtle px-4 py-3 text-sm font-medium text-text-main">
                {t('connectionPage.advanced.preferences')}
              </div>
              <div className="divide-y divide-border-subtle">
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
              </div>
            </section>

            <GitHubSetupChecklistPanel
              summary={setupChecklist}
              installURL={installURL}
              enabled={settings.enabled}
              isSaving={isSaving}
              repositorySettingsHref={repositorySettingsHref}
              targetOwner={targetOwner}
              targetRepo={targetRepo}
              targetRepositoryURL={targetRepositoryURL}
              targetRepositoryId={targetRepositoryId}
              returnTo={returnTo}
              onBeforeInstall={rememberGitHubRecoveryContext}
              onMissingInstall={() => {
                setMessage(
                  workspaceId.trim()
                    ? t('messages.installEntryRequired')
                    : t('messages.selectWorkspaceBeforeInstall')
                );
              }}
            />
          </div>
        ) : null}
      </section>
    </div>
  );
}

type GitHubConnectionStatus =
  | 'connected'
  | 'notConnected'
  | 'notConfigured'
  | 'checking'
  | 'disabled';

function ConnectionMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="px-5 py-4">
      <div className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold tracking-tight text-text-main">{value}</div>
    </div>
  );
}

function ConnectionToggleMetric({
  label,
  checked,
  disabled,
  onCheckedChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 px-5 py-4">
      <div>
        <div className="text-xs font-medium uppercase tracking-[0.12em] text-text-muted">
          {label}
        </div>
        <div className="mt-2 flex items-center gap-2 text-sm font-medium text-text-main">
          <ShieldCheck className="h-4 w-4 text-success" />
          GitHub
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function ConnectionEmptyRow({ text }: { text: string }) {
  return <div className="px-5 py-5 text-sm leading-6 text-text-muted">{text}</div>;
}

function githubConnectionStatusClassName(status: GitHubConnectionStatus) {
  switch (status) {
    case 'connected':
      return 'rounded-full border border-success/30 bg-success-subtle px-2 py-0.5 text-xs font-medium text-success';
    case 'checking':
      return 'rounded-full border border-primary/30 bg-primary-subtle px-2 py-0.5 text-xs font-medium text-primary';
    case 'disabled':
      return 'rounded-full border border-border-subtle bg-bg-subtle px-2 py-0.5 text-xs font-medium text-text-muted';
    case 'notConfigured':
      return 'rounded-full border border-warning/30 bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning';
    default:
      return 'rounded-full border border-warning/30 bg-warning-subtle px-2 py-0.5 text-xs font-medium text-warning';
  }
}

function GitHubRecoveryTargetPanel({
  label,
  repositoryId,
  mode,
  returnTo,
}: {
  label: string;
  repositoryId?: string;
  mode: 'github' | 'repositories';
  returnTo?: string;
}) {
  return (
    <div className="rounded-lg border border-primary/20 bg-primary-subtle p-3">
      <div className="text-sm font-medium text-text-main">正在修复目标仓库</div>
      <p className="mt-1 text-sm leading-6 text-text-muted">
        {label}
        {repositoryId ? ` · ${repositoryId}` : ''}。{mode === 'github'
          ? '先安装或同步 GitHub App，确认这个仓库出现在可访问仓库列表。'
          : '把已同步的仓库保存并绑定到项目后，再回到交付页重新检查。'}
      </p>
      {returnTo ? (
        <div className="mt-2">
          <Button asChild variant="outline" size="sm">
            <Link href={returnTo}>返回继续检查</Link>
          </Button>
        </div>
      ) : null}
    </div>
  );
}

function GitHubSetupChecklistPanel({
  summary,
  installURL,
  enabled,
  isSaving,
  repositorySettingsHref,
  targetOwner,
  targetRepo,
  targetRepositoryURL,
  targetRepositoryId,
  returnTo,
  onBeforeInstall,
  onMissingInstall,
}: {
  summary: ReturnType<typeof githubSetupChecklist>;
  installURL: string;
  enabled: boolean;
  isSaving: boolean;
  repositorySettingsHref: string;
  targetOwner: string;
  targetRepo: string;
  targetRepositoryURL: string;
  targetRepositoryId: string;
  returnTo: string;
  onBeforeInstall: () => void;
  onMissingInstall: () => void;
}) {
  const manifestOwner = targetOwner.trim() || 'user';
  const manifestRepositoryURL =
    targetRepositoryURL.trim() ||
    (targetOwner.trim() && targetRepo.trim()
      ? `https://github.com/${targetOwner.trim()}/${targetRepo.trim()}`
      : '');
  const manifestCommand = [
    'node scripts/github-app-config.mjs manifest',
    '--owner',
    shellArg(manifestOwner),
    '--name',
    shellArg('CodingCTO Local'),
    manifestRepositoryURL ? `--repository-url ${shellArg(manifestRepositoryURL)}` : '',
    targetRepositoryId.trim() ? `--repository-id ${shellArg(targetRepositoryId.trim())}` : '',
    returnTo.trim() ? `--return-to ${shellArg(returnTo.trim())}` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <section className="rounded-lg border border-border-subtle bg-bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-text-main">GitHub App 恢复清单</div>
          <p className="mt-1 text-sm leading-6 text-text-muted">
            {summary.headline} {summary.nextAction}
          </p>
        </div>
        <span
          className={
            summary.canRecoverReadiness
              ? 'rounded-full border border-success/30 px-2 py-1 text-xs text-success'
              : 'rounded-full border border-warning/30 px-2 py-1 text-xs text-warning'
          }
        >
          {summary.readyCount}/{summary.totalCount} 就绪
        </span>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {summary.items.map(item => (
          <GitHubSetupChecklistRow key={item.id} item={item} />
        ))}
      </div>
      {!installURL ? (
        <div className="mt-3 rounded-md border border-warning/30 bg-warning-subtle p-3">
          <div className="text-sm font-medium text-text-main">本地开发配置</div>
          <p className="mt-1 text-xs leading-5 text-text-muted">
            当前缺少 GitHub App 安装入口。先在仓库根目录完成下面任一配置，然后重启 Web/API，
            回到本页安装或重新同步 App。
          </p>
          <div className="mt-3 grid gap-2">
            <LocalConfigCommand
              label="创建新的本地 GitHub App"
              command={manifestCommand}
            />
            <LocalConfigCommand
              label="接入已有 GitHub App"
              command="node scripts/github-app-config.mjs existing --app-id <id> --private-key-path <path> --slug <app-slug>"
            />
          </div>
        </div>
      ) : null}
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        {installURL ? (
          <Button asChild variant="outline" size="sm" disabled={!enabled || isSaving}>
            <a href={installURL} target="_blank" rel="noreferrer" onClick={onBeforeInstall}>
              安装或重新同步 GitHub App
            </a>
          </Button>
        ) : (
          <Button type="button" variant="outline" size="sm" onClick={onMissingInstall}>
            安装或重新同步 GitHub App
          </Button>
        )}
        <Button asChild size="sm">
          <Link href={repositorySettingsHref}>
            绑定已同步仓库
          </Link>
        </Button>
      </div>
    </section>
  );
}

function LocalConfigCommand({ label, command }: { label: string; command: string }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-surface p-2">
      <div className="text-xs font-medium text-text-main">{label}</div>
      <pre className="mt-1 overflow-x-auto rounded bg-bg-subtle px-2 py-1 text-xs leading-5 text-text-main">
        <code>{command}</code>
      </pre>
    </div>
  );
}

function GitHubSetupChecklistRow({ item }: { item: GitHubSetupChecklistItem }) {
  return (
    <div className="rounded-md border border-border-subtle bg-bg-subtle px-3 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="text-sm font-medium text-text-main">{item.label}</div>
        <span className={githubSetupChecklistStateClassName(item.state)}>
          {githubSetupChecklistStateLabel(item.state)}
        </span>
      </div>
      <div className="mt-1 text-xs leading-5 text-text-muted">{item.detail}</div>
    </div>
  );
}

function githubSetupChecklistStateLabel(state: GitHubSetupChecklistItem['state']) {
  switch (state) {
    case 'ready':
      return '就绪';
    case 'waiting':
      return '等待';
    default:
      return '阻塞';
  }
}

function githubSetupChecklistStateClassName(state: GitHubSetupChecklistItem['state']) {
  switch (state) {
    case 'ready':
      return 'text-xs font-medium text-success';
    case 'waiting':
      return 'text-xs font-medium text-primary';
    default:
      return 'text-xs font-medium text-warning';
  }
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
