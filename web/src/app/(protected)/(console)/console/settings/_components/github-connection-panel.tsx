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
  RefreshCw,
  ShieldCheck,
  SlidersHorizontal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
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
  useDisconnectGitHubConnection,
  useGitHubConnection,
  useGitHubRepositories,
  useGitHubRepositoryAccesses,
  useGitHubSettings,
  useStartGitHubOAuth,
  useSyncGitHubInstallation,
  useSyncGitHubRepositories,
  useUpsertGitHubSettings,
} from '@/features/specforge/hooks/use-specforge';
import type { GitHubRepositoryAccessDTO } from '@/features/specforge/services/specforge-service';

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
const githubRecoveryStoragePrefix = 'codingcto.githubRecovery.';

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
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

function absoluteBrowserURL(path: string) {
  const origin = typeof window === 'undefined' ? env.NEXT_PUBLIC_APP_URL : window.location.origin;
  return new URL(path, origin).toString();
}

function shellArg(value: string) {
  return `'${value.replaceAll("'", "'\\''")}'`;
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
  const [message, setMessage] = useState('');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [installEntry] = useState(
    env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL || env.NEXT_PUBLIC_GITHUB_APP_SLUG || ''
  );
  const targetRepositoryLabel =
    targetOwner && targetRepo
      ? `${targetOwner}/${targetRepo}`
      : targetRepositoryId || targetRepositoryURL;
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
  const legacyRepositoriesQuery = useGitHubRepositories(
    workspaceId.trim() ? { workspace_id: workspaceId.trim() } : undefined
  );
  const connectionQuery = useGitHubConnection(workspaceId.trim());
  const repositoryAccessesQuery = useGitHubRepositoryAccesses(
    workspaceId.trim() ? { workspace_id: workspaceId.trim() } : undefined
  );
  const legacyRepositories = legacyRepositoriesQuery.data?.repositories ?? [];
  const repositoryAccesses = repositoryAccessesQuery.data?.repositories ?? [];
  const visibleRepositoryAccesses = repositoryAccesses.slice(0, mode === 'repositories' ? 50 : 6);
  const connection = connectionQuery.data?.connection ?? null;
  const authorizedRepositoryCount =
    repositoryAccessesQuery.data?.repository_count ?? repositoryAccesses.length;
  const upsertSettings = useUpsertGitHubSettings();
  const startOAuth = useStartGitHubOAuth();
  const disconnectOAuth = useDisconnectGitHubConnection();
  const syncOAuthRepositories = useSyncGitHubRepositories();
  const syncInstallation = useSyncGitHubInstallation();
  const isSaving =
    upsertSettings.isPending ||
    startOAuth.isPending ||
    disconnectOAuth.isPending ||
    syncOAuthRepositories.isPending ||
    syncInstallation.isPending ||
    connectionQuery.isFetching ||
    repositoryAccessesQuery.isFetching;
  const settings: GitHubSettings = {
    enabled: githubSettings.data?.enabled ?? defaultSettings.enabled,
    pullRequestSidebar:
      githubSettings.data?.pull_request_sidebar ?? defaultSettings.pullRequestSidebar,
    coAuthoredByTrailer:
      githubSettings.data?.co_authored_by_trailer ?? defaultSettings.coAuthoredByTrailer,
    issuePrAutoLink: githubSettings.data?.issue_pr_auto_link ?? defaultSettings.issuePrAutoLink,
  };
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
    connectedRepositoryCount: legacyRepositories.length,
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

  const startGitHubOAuth = useCallback(async () => {
    if (!workspaceId.trim()) {
      setMessage(t('messages.selectWorkspaceBeforeInstall'));
      return;
    }
    setMessage('');
    try {
      const redirectPath = `${ROUTES.CONSOLE.SETTINGS}?tab=github${targetQuery ? `&${targetQuery}` : ''}`;
      const redirectTo = absoluteBrowserURL(redirectPath);
      const result = await startOAuth.mutateAsync({
        workspace_id: workspaceId.trim(),
        redirect_to: redirectTo,
      });
      window.location.assign(result.authorization_url);
    } catch (error) {
      setMessage(`${errorMessage(error, t('messages.connectionFailed'))} ${t('messages.oauthConfigHint')}`);
    }
  }, [startOAuth, t, targetQuery, workspaceId]);

  const syncAuthorizedRepositories = useCallback(async () => {
    if (!workspaceId.trim()) {
      setMessage(t('messages.selectWorkspaceBeforeSync'));
      return;
    }
    setMessage('');
    try {
      const result = await syncOAuthRepositories.mutateAsync({
        workspace_id: workspaceId.trim(),
      });
      setMessage(
        result.repository_count > 0
          ? t('messages.oauthSyncedWithRepos', { count: result.repository_count })
          : t('messages.oauthSyncedNoRepos')
      );
    } catch (error) {
      setMessage(`${errorMessage(error, t('messages.connectionFailed'))} ${t('messages.backendAuthHint')}`);
    }
  }, [syncOAuthRepositories, t, workspaceId]);

  const disconnectGitHubOAuth = useCallback(async () => {
    if (!workspaceId.trim()) {
      setMessage(t('messages.selectWorkspaceBeforeSettings'));
      return;
    }
    setMessage('');
    try {
      await disconnectOAuth.mutateAsync(workspaceId.trim());
      setMessage(t('messages.oauthDisconnected'));
    } catch (error) {
      setMessage(`${errorMessage(error, t('messages.connectionFailed'))} ${t('messages.settingsNotSaved')}`);
    }
  }, [disconnectOAuth, t, workspaceId]);

  useEffect(() => {
    const githubResult = searchParams.get('github')?.trim();
    if (!githubResult) {
      return;
    }
    const params = new URLSearchParams(searchParams.toString());
    params.delete('github');
    const nextQuery = params.toString();
    router.replace(`${ROUTES.CONSOLE.SETTINGS}${nextQuery ? `?${nextQuery}` : ''}`, {
      scroll: false,
    });
    const timeoutId = window.setTimeout(() => {
      setMessage(
        githubResult === 'connected'
          ? t('messages.oauthConnected')
          : t('messages.connectionFailed')
      );
    }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [router, searchParams, t]);

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

  if (mode === 'repositories') {
    return (
      <div className="mx-auto w-full max-w-4xl space-y-4">
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
            <div className="flex flex-wrap gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={repositoryAccessesQuery.isFetching}
                onClick={() => repositoryAccessesQuery.refetch()}
              >
                <RefreshCw
                  className={
                    repositoryAccessesQuery.isFetching
                      ? 'h-4 w-4 animate-spin'
                      : 'h-4 w-4'
                  }
                />
                {t('connectionPage.actions.refresh')}
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={!settings.enabled || !connection || syncOAuthRepositories.isPending}
                onClick={syncAuthorizedRepositories}
              >
                {syncOAuthRepositories.isPending
                  ? t('actions.syncing')
                  : t('connectionPage.actions.sync')}
              </Button>
            </div>
          </div>
          <div className="divide-y divide-border-subtle">
            {repositoryAccessesQuery.isLoading ? (
              <ConnectionEmptyRow text={t('connectionPage.repositories.loading')} />
            ) : visibleRepositoryAccesses.length > 0 ? (
              visibleRepositoryAccesses.map(repository => (
                <RepositoryAccessRow key={repository.id} repository={repository} />
              ))
            ) : null}
            {!repositoryAccessesQuery.isLoading && visibleRepositoryAccesses.length === 0 ? (
              <ConnectionEmptyRow text={t('connectionPage.repositories.empty')} />
            ) : null}
          </div>
        </section>
      </div>
    );
  }

  const connectionStatus = !settings.enabled
    ? 'disabled'
    : connectionQuery.isFetching
      ? 'checking'
      : connection?.token_status === 'connected'
        ? 'connected'
        : 'notConnected';
  const connectionReady = connectionStatus === 'connected';

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
            <Button
              type="button"
              disabled={!settings.enabled || startOAuth.isPending || !workspaceId.trim()}
              onClick={startGitHubOAuth}
            >
              {startOAuth.isPending
                ? t('actions.connecting')
                : connectionReady
                  ? t('connectionPage.actions.manageConnection')
                  : t('connectionPage.actions.connect')}
            </Button>
            <Button
              type="button"
              variant="outline"
              disabled={connectionQuery.isFetching || repositoryAccessesQuery.isFetching}
              onClick={() => {
                connectionQuery.refetch();
                repositoryAccessesQuery.refetch();
              }}
            >
              <RefreshCw
                className={
                  connectionQuery.isFetching || repositoryAccessesQuery.isFetching
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
            value={connection ? '1' : '0'}
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
          {connectionQuery.isLoading ? (
            <ConnectionEmptyRow text={t('connectionPage.accounts.loading')} />
          ) : connection ? (
            <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 items-center gap-3">
                {connection.github_avatar_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={connection.github_avatar_url}
                    alt=""
                    className="h-9 w-9 shrink-0 rounded-[4px] border border-border-subtle"
                  />
                ) : (
                  <Github className="h-5 w-5 shrink-0 text-text-main" />
                )}
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium text-text-main">
                    {connection.github_name || connection.github_login}
                  </div>
                  <div className="mt-0.5 text-xs leading-5 text-text-muted">
                    @{connection.github_login} · {connection.token_status}
                    {connection.last_synced_at
                      ? ` · ${t('connectionPage.accounts.lastSynced')} ${formatDate(connection.last_synced_at)}`
                      : ''}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={syncOAuthRepositories.isPending || !settings.enabled}
                  onClick={syncAuthorizedRepositories}
                >
                  {syncOAuthRepositories.isPending
                    ? t('actions.syncing')
                    : t('connectionPage.actions.sync')}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={disconnectOAuth.isPending || !settings.enabled}
                  onClick={disconnectGitHubOAuth}
                >
                  {t('connectionPage.actions.disconnect')}
                </Button>
              </div>
            </div>
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
          {repositoryAccessesQuery.isLoading ? (
            <ConnectionEmptyRow text={t('connectionPage.repositories.loading')} />
          ) : visibleRepositoryAccesses.length > 0 ? (
            visibleRepositoryAccesses.map(repository => (
              <RepositoryAccessRow key={repository.id} repository={repository} />
            ))
          ) : (
            <ConnectionEmptyRow text={t('connectionPage.repositories.empty')} />
          )}
        </div>
        {authorizedRepositoryCount > visibleRepositoryAccesses.length ? (
          <div className="border-t border-border-subtle px-5 py-3 text-xs leading-5 text-text-muted">
            {t('connectionPage.repositories.showing', {
              visible: visibleRepositoryAccesses.length,
              count: authorizedRepositoryCount,
            })}
          </div>
        ) : null}
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

function RepositoryAccessRow({ repository }: { repository: GitHubRepositoryAccessDTO }) {
  return (
    <div className="flex flex-col gap-3 px-5 py-4 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <GitPullRequest className="h-5 w-5 shrink-0 text-text-main" />
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-text-main">
            {repository.full_name}
          </div>
          <div className="mt-0.5 text-xs leading-5 text-text-muted">
            {repository.default_branch} · {repositoryAccessSourceLabel(repository)}
          </div>
        </div>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <span className="rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-muted">
          {repository.visibility || (repository.is_private ? 'private' : 'public')}
        </span>
        <span
          className={
            repositoryAccessWritable(repository)
              ? 'rounded-full border border-success/30 px-2 py-0.5 text-xs text-success'
              : 'rounded-full border border-border-subtle px-2 py-0.5 text-xs text-text-muted'
          }
        >
          {repositoryAccessWritable(repository) ? 'write' : 'read'}
        </span>
      </div>
    </div>
  );
}

function repositoryAccessSourceLabel(repository: GitHubRepositoryAccessDTO) {
  if (repository.source_type === 'organization' && repository.organization_login) {
    return repository.organization_login;
  }
  return repository.owner_login || 'personal';
}

function repositoryAccessWritable(repository: GitHubRepositoryAccessDTO) {
  return Boolean(
    repository.permissions?.admin ||
      repository.permissions?.maintain ||
      repository.permissions?.push
  );
}

function formatDate(value?: string) {
  if (!value) {
    return '';
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  return date.toLocaleDateString();
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
          ? '先连接 GitHub 并同步授权仓库，确认这个仓库出现在可访问仓库列表。'
          : '同步授权仓库并绑定到项目后，再回到交付页重新检查。'}
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
          <div className="text-sm font-medium text-text-main">GitHub App 兼容恢复清单</div>
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
            查看授权仓库
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
