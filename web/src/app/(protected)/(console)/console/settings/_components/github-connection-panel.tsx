'use client';

import Link from 'next/link';
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'next/navigation';
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ExternalLink,
  Github,
  GitPullRequest,
  Link2,
  PanelRight,
  SlidersHorizontal,
} from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { env } from '@/config/env';
import { ROUTES } from '@/constants/routes';
import { useT } from '@/i18n';
import { useBindProjectRepository, useProjects } from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import { projectSpecForgeHref } from '@/features/project/project-utils';
import {
  useGitHubRepositories,
  useGitHubSettings,
  useSyncGitHubInstallation,
  useUpsertGitHubSettings,
  useUpsertGitHubRepository,
} from '@/features/specforge/hooks/use-specforge';
import type { GitHubRepositoryOptionDTO } from '@/features/specforge/services/specforge-service';

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

const repositoryRoles = ['primary', 'dependency', 'docs', 'infra'] as const;

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

export function GitHubConnectionPanel() {
  const t = useT('settings.github.panel');
  const searchParams = useSearchParams();
  const stateWorkspaceId = searchParams.get('state')?.trim() || '';
  const [installationId, setInstallationId] = useState(
    () => searchParams.get('installation_id')?.trim() || ''
  );
  const [accountLogin, setAccountLogin] = useState('');
  const [owner, setOwner] = useState('');
  const [repo, setRepo] = useState('');
  const [defaultBranch, setDefaultBranch] = useState('main');
  const [isPrivate, setIsPrivate] = useState(true);
  const [repositoryOptions, setRepositoryOptions] = useState<GitHubRepositoryOptionDTO[]>([]);
  const [selectedRepository, setSelectedRepository] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [repositoryRole, setRepositoryRole] = useState('primary');
  const [savedRepoId, setSavedRepoId] = useState('');
  const [boundProjectId, setBoundProjectId] = useState<number>();
  const [savedInstallationDbId, setSavedInstallationDbId] = useState<number>();
  const [message, setMessage] = useState('');
  const [installEntry, setInstallEntry] = useState(
    env.NEXT_PUBLIC_GITHUB_APP_INSTALL_URL || env.NEXT_PUBLIC_GITHUB_APP_SLUG || ''
  );

  const {
    workspacesQuery,
    workspaces,
    selectedWorkspaceId: workspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
  } = useSelectedWorkspace(stateWorkspaceId);
  const githubSettings = useGitHubSettings(workspaceId.trim());
  const connectedRepositoriesQuery = useGitHubRepositories({ workspace_id: workspaceId.trim() });
  const connectedRepositories = connectedRepositoriesQuery.data?.repositories ?? [];
  const projectsQuery = useProjects(workspaceId.trim());
  const projects = projectsQuery.data?.projects ?? [];
  const upsertSettings = useUpsertGitHubSettings();
  const syncInstallation = useSyncGitHubInstallation();
  const upsertRepository = useUpsertGitHubRepository();
  const bindRepository = useBindProjectRepository(Number(selectedProjectId) || 0);
  const isSaving =
    upsertSettings.isPending ||
    syncInstallation.isPending ||
    upsertRepository.isPending ||
    bindRepository.isPending;
  const settings: GitHubSettings = {
    enabled: githubSettings.data?.enabled ?? defaultSettings.enabled,
    pullRequestSidebar:
      githubSettings.data?.pull_request_sidebar ?? defaultSettings.pullRequestSidebar,
    coAuthoredByTrailer:
      githubSettings.data?.co_authored_by_trailer ?? defaultSettings.coAuthoredByTrailer,
    issuePrAutoLink: githubSettings.data?.issue_pr_auto_link ?? defaultSettings.issuePrAutoLink,
  };
  const normalizedInstallationId = Number(installationId);
  const canSubmit =
    workspaceId.trim() &&
    owner.trim() &&
    repo.trim() &&
    Number.isFinite(normalizedInstallationId) &&
    normalizedInstallationId > 0;
  const specForgeHref = useMemo(() => {
    if (!savedRepoId) {
      return ROUTES.CONSOLE.SPECFORGE;
    }
    if (boundProjectId) {
      return projectSpecForgeHref(boundProjectId);
    }
    return `${ROUTES.CONSOLE.SPECFORGE}?repo_id=${encodeURIComponent(savedRepoId)}`;
  }, [boundProjectId, savedRepoId]);
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
  const repositoryRoleOptions = repositoryRoles.map(role => ({
    value: role,
    label: t(`roles.${role}`),
  }));

  const applyRepositoryOption = useCallback((option: GitHubRepositoryOptionDTO) => {
    setSelectedRepository(option.full_name);
    setOwner(option.owner);
    setRepo(option.repo);
    setDefaultBranch(option.default_branch || 'main');
    setIsPrivate(option.is_private);
  }, []);

  const syncGitHubInstallation = useCallback(
    async (installationIdValue: string, workspaceIdValue: string) => {
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
        setSavedInstallationDbId(result.installation.id);
        setAccountLogin(result.installation.account_login);
        setRepositoryOptions(result.repositories);
        if (result.repositories[0]) {
          applyRepositoryOption(result.repositories[0]);
        }
        setMessage(
          result.repositories.length > 0
            ? t('messages.syncedWithRepos')
            : t('messages.syncedNoRepos')
        );
        return true;
      } catch (error) {
        setMessage(
          `${errorMessage(error, t('messages.connectionFailed'))} ${t('messages.githubAppConfigHint')}`
        );
        return false;
      }
    },
    [applyRepositoryOption, syncInstallation, t]
  );

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

  function focusConnectionForm() {
    document.getElementById('github-repository-form')?.scrollIntoView({
      behavior: 'smooth',
      block: 'start',
    });
  }

  function focusInstallEntry() {
    document.getElementById('github-app-install-entry')?.scrollIntoView({
      behavior: 'smooth',
      block: 'center',
    });
    window.setTimeout(() => document.getElementById('github-app-install-entry')?.focus(), 250);
  }

  async function connectRepository() {
    if (!canSubmit) {
      setMessage(t('messages.connectRequirements'));
      return;
    }

    setMessage('');
    setSavedRepoId('');
    try {
      let installationDbId = savedInstallationDbId;
      if (!installationDbId) {
        const result = await syncInstallation.mutateAsync({
          workspace_id: workspaceId.trim(),
          installation_id: normalizedInstallationId,
        });
        installationDbId = result.installation.id;
        setSavedInstallationDbId(installationDbId);
        setAccountLogin(result.installation.account_login);
        setRepositoryOptions(result.repositories);
      }

      const repository = await upsertRepository.mutateAsync({
        workspace_id: workspaceId.trim(),
        github_installation_id: installationDbId,
        github_owner: owner.trim(),
        github_repo: repo.trim(),
        default_branch: defaultBranch.trim() || 'main',
        is_private: isPrivate,
      });

      setSavedRepoId(repository.repository_id);
      setBoundProjectId(undefined);
      setMessage(t('messages.repositoryConnected'));
    } catch (error) {
      setMessage(
        `${errorMessage(error, t('messages.connectionFailed'))} ${t('messages.backendAuthHint')}`
      );
    }
  }

  async function bindConnectedRepositoryToProject() {
    const projectId = Number(selectedProjectId);
    if (!savedRepoId || !Number.isFinite(projectId) || projectId <= 0) {
      setMessage(t('messages.bindRequirements'));
      return;
    }
    setMessage('');
    try {
      await bindRepository.mutateAsync({
        repository_id: savedRepoId,
        role: repositoryRole as 'primary' | 'dependency' | 'docs' | 'infra',
      });
      setBoundProjectId(projectId);
      setMessage(t('messages.boundToProject', { repoId: savedRepoId }));
    } catch {
      setMessage(t('messages.bindFailed'));
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <p className="text-sm leading-6 text-text-muted">
        {t('intro')}
      </p>

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
                  if (workspaceId.trim()) {
                    focusInstallEntry();
                  }
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

      <section className="space-y-3">
        <h3 className="text-base font-semibold">{t('sections.repository')}</h3>
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-medium">{t('repositoryCta.title')}</div>
              <p className="mt-1 text-sm text-text-muted">
                {t('repositoryCta.description')}
              </p>
            </div>
            <Button variant="outline" onClick={focusConnectionForm} disabled={!settings.enabled}>
              {t('actions.enterRepository')}
              <ExternalLink className="ml-1.5 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card id="github-repository-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            {t('form.title')}
          </CardTitle>
          <CardDescription>
            {t('form.description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github-app-install-entry">{t('form.installEntry')}</Label>
            <div className="flex flex-col gap-2 md:flex-row">
              <Input
                id="github-app-install-entry"
                value={installEntry}
                onChange={event => setInstallEntry(event.target.value)}
                placeholder="codingcto or https://github.com/apps/codingcto/installations/new"
              />
              {installURL && workspaceId.trim() ? (
                <Button asChild variant="outline" disabled={!settings.enabled}>
                  <a href={installURL} target="_blank" rel="noreferrer">
                    {t('actions.openInstallPage')}
                    <ExternalLink className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setMessage(
                      workspaceId.trim()
                        ? t('messages.installEntryShort')
                        : t('messages.selectWorkspaceBeforeInstallShort')
                    );
                    if (workspaceId.trim()) {
                      focusInstallEntry();
                    }
                  }}
                  disabled={!settings.enabled}
                >
                  {t('actions.openInstallPage')}
                  <ExternalLink className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-sm leading-6 text-text-muted">
              {t('form.installHelp')}
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="github-workspace">{t('form.workspace')}</Label>
              {workspaces.length > 0 ? (
                <Select value={workspaceId} onValueChange={setSelectedWorkspaceId}>
                  <SelectTrigger id="github-workspace">
                    <SelectValue placeholder={t('form.selectWorkspace')} />
                  </SelectTrigger>
                  <SelectContent>
                    {workspaces.map(workspace => (
                      <SelectItem key={workspace.workspace_id} value={workspace.workspace_id}>
                        {workspace.name} ({workspace.slug})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Button asChild variant="outline" className="w-full justify-start">
                  <Link href={ROUTES.CONSOLE.PROJECTS}>{t('actions.createWorkspaceFirst')}</Link>
                </Button>
              )}
              {selectedWorkspace && (
                <p className="text-xs leading-5 text-text-muted">
                  {t('form.workspaceId', { id: selectedWorkspace.workspace_id })}
                </p>
              )}
              {workspacesQuery.isError && (
                <p className="text-xs leading-5 text-error">
                  {t('messages.workspaceApiUnavailable')}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-installation">{t('form.installationId')}</Label>
              <Input
                id="github-installation"
                inputMode="numeric"
                value={installationId}
                onChange={event => setInstallationId(event.target.value)}
                placeholder={t('form.installationIdPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-account">{t('form.installedAccount')}</Label>
              <Input
                id="github-account"
                value={accountLogin}
                onChange={event => setAccountLogin(event.target.value)}
                placeholder={t('form.installedAccountPlaceholder')}
              />
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => syncGitHubInstallation(installationId, workspaceId)}
              disabled={!settings.enabled || !installationId.trim() || isSaving}
            >
              {syncInstallation.isPending ? t('actions.syncing') : t('actions.syncRepos')}
            </Button>
          </div>

          {repositoryOptions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="github-repository-option">{t('form.selectRepository')}</Label>
              <select
                id="github-repository-option"
                className="h-10 w-full rounded-md border border-border bg-bg-canvas px-3 text-sm"
                value={selectedRepository}
                onChange={event => {
                  const option = repositoryOptions.find(
                    candidate => candidate.full_name === event.target.value
                  );
                  if (option) {
                    applyRepositoryOption(option);
                  }
                }}
              >
                {repositoryOptions.map(option => (
                  <option key={option.full_name} value={option.full_name}>
                    {option.full_name}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="github-owner">{t('form.owner')}</Label>
              <Input
                id="github-owner"
                value={owner}
                onChange={event => setOwner(event.target.value)}
                placeholder={t('form.ownerPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-repo">{t('form.repo')}</Label>
              <Input
                id="github-repo"
                value={repo}
                onChange={event => setRepo(event.target.value)}
                placeholder={t('form.repoPlaceholder')}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-default-branch">{t('form.defaultBranch')}</Label>
              <Input
                id="github-default-branch"
                value={defaultBranch}
                onChange={event => setDefaultBranch(event.target.value)}
                placeholder="main"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border-subtle bg-bg-subtle px-3 py-2">
            <div>
              <Label className="text-base">{t('form.privateRepo')}</Label>
              <p className="mt-1 text-sm text-text-muted">
                {t('form.privateRepoHelp')}
              </p>
            </div>
            <Switch checked={isPrivate} onCheckedChange={setIsPrivate} />
          </div>

          {message && (
            <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
              {message}
            </div>
          )}

          {savedRepoId && (
            <div className="rounded-lg border border-success/30 bg-success-subtle p-3 text-sm leading-6 text-success">
              <div className="flex items-center gap-2 font-medium">
                <CheckCircle2 className="h-4 w-4" />
                {t('status.connected', { repoId: savedRepoId })}
              </div>
              {savedInstallationDbId ? (
                <div className="mt-1 text-xs">
                  {t('status.localInstallationId', { id: savedInstallationDbId })}
                </div>
              ) : null}
            </div>
          )}

          {workspaceId.trim() && (
            <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
              <div className="text-sm font-medium text-text-main">
                {t('connectedRepositories.title')}
              </div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {t('connectedRepositories.description')}
              </p>
              {connectedRepositoriesQuery.isFetching ? (
                <div className="mt-3 rounded-lg border border-border-subtle bg-bg-surface p-3 text-sm text-text-muted">
                  {t('connectedRepositories.loading')}
                </div>
              ) : connectedRepositories.length > 0 ? (
                <div className="mt-3 divide-y divide-border-subtle rounded-lg border border-border-subtle bg-bg-surface">
                  {connectedRepositories.map(repository => (
                    <div
                      key={repository.repository_id}
                      className="flex flex-col gap-3 p-3 md:flex-row md:items-center md:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-text-main">
                          {repository.github_owner}/{repository.github_repo}
                        </div>
                        <div className="mt-1 truncate font-mono text-xs text-text-muted">
                          {repository.repository_id} · {repository.default_branch}
                        </div>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSavedRepoId(repository.repository_id);
                          setSavedInstallationDbId(repository.github_installation_id);
                          setOwner(repository.github_owner);
                          setRepo(repository.github_repo);
                          setDefaultBranch(repository.default_branch || 'main');
                          setIsPrivate(repository.is_private);
                          setMessage(t('messages.repositorySelected'));
                        }}
                      >
                        {t('actions.selectRepository')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="mt-3 rounded-lg border border-dashed border-border-subtle bg-bg-surface p-3 text-sm leading-6 text-text-muted">
                  {t('connectedRepositories.empty')}
                </div>
              )}
            </div>
          )}

          {connectedRepositoriesQuery.isError && (
            <p className="text-xs leading-5 text-error">
              {t('messages.repositoriesUnavailable')}
            </p>
          )}

          {savedRepoId && (
            <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
              <div className="text-sm font-medium text-text-main">{t('bind.title')}</div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {t('bind.description')}
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                <div className="space-y-2">
                  <Label htmlFor="github-project-bind">{t('bind.project')}</Label>
                  {projects.length > 0 ? (
                    <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                      <SelectTrigger id="github-project-bind">
                        <SelectValue placeholder={t('bind.selectProject')} />
                      </SelectTrigger>
                      <SelectContent>
                        {projects.map(project => (
                          <SelectItem key={project.id} value={String(project.id)}>
                            {project.name} ({project.slug})
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  ) : (
                    <Button asChild variant="outline" className="w-full justify-start">
                      <Link href={ROUTES.CONSOLE.PROJECTS}>{t('actions.createProjectFirst')}</Link>
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="github-project-role">{t('bind.role')}</Label>
                  <Select value={repositoryRole} onValueChange={setRepositoryRole}>
                    <SelectTrigger id="github-project-role">
                      <SelectValue placeholder={t('bind.role')} />
                    </SelectTrigger>
                    <SelectContent>
                      {repositoryRoleOptions.map(role => (
                        <SelectItem key={role.value} value={role.value}>
                          {role.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-end">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={bindConnectedRepositoryToProject}
                    disabled={!selectedProjectId || bindRepository.isPending}
                  >
                    {bindRepository.isPending ? t('actions.binding') : t('actions.bindToProject')}
                  </Button>
                </div>
              </div>
              {projectsQuery.isError && (
                <p className="mt-2 text-xs leading-5 text-error">
                  {t('messages.projectsUnavailable')}
                </p>
              )}
            </div>
          )}
        </CardContent>
        <CardFooter className="flex flex-wrap gap-2">
          <Button
            onClick={connectRepository}
            disabled={!settings.enabled || !canSubmit || isSaving}
          >
            {isSaving ? t('actions.connecting') : t('actions.connectRepository')}
          </Button>
          {savedRepoId ? (
            <Button asChild variant="outline">
              <Link href={specForgeHref}>
                {t('actions.useInCodingCTO')}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              {t('actions.useInCodingCTO')}
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          )}
        </CardFooter>
      </Card>
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
