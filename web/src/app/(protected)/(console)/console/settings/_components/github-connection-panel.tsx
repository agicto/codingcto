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
import { useBindProjectRepository, useProjects } from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import { projectSpecForgeHref, repositoryRoleLabel } from '@/features/project/project-utils';
import {
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

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  return 'Failed to connect the GitHub repository. Check backend auth and GitHub App configuration.';
}

export function GitHubConnectionPanel() {
  const searchParams = useSearchParams();
  const stateWorkspaceId = searchParams.get('state')?.trim() || '';
  const [installationId, setInstallationId] = useState(
    () => searchParams.get('installation_id')?.trim() || ''
  );
  const [accountLogin, setAccountLogin] = useState('agicto');
  const [owner, setOwner] = useState('agicto');
  const [repo, setRepo] = useState('codingcto');
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
    accountLogin.trim() &&
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
        setMessage('Create or select a workspace before syncing a GitHub installation.');
        return false;
      }
      const parsedInstallationId = Number(installationIdValue);
      if (!Number.isFinite(parsedInstallationId) || parsedInstallationId <= 0) {
        setMessage('Install the GitHub App first, or enter a valid installation ID.');
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
            ? 'GitHub App synced. Choose the repository to bind, then save it.'
            : 'GitHub App synced, but no accessible repositories were returned. Check the repositories selected during installation.'
        );
        return true;
      } catch (error) {
        setMessage(
          `${errorMessage(error)} Confirm the backend has GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY configured.`
        );
        return false;
      }
    },
    [applyRepositoryOption, syncInstallation]
  );

  async function updateSetting<Key extends keyof GitHubSettings>(
    key: Key,
    value: GitHubSettings[Key]
  ) {
    if (!workspaceId.trim()) {
      setMessage('Create or select a workspace before changing GitHub feature settings.');
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
      setMessage('GitHub feature settings saved.');
    } catch (error) {
      setMessage(`${errorMessage(error)} GitHub feature settings were not saved.`);
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
      setMessage(
        'Select a workspace, then enter the GitHub installation ID and repository details.'
      );
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
      setMessage('GitHub repository connected. You can use this repository ID in CodingCTO.');
    } catch (error) {
      setMessage(
        `${errorMessage(error)} If you are using demo auth, switch to backend auth and sign in with a backend user first.`
      );
    }
  }

  async function bindConnectedRepositoryToProject() {
    const projectId = Number(selectedProjectId);
    if (!savedRepoId || !Number.isFinite(projectId) || projectId <= 0) {
      setMessage('Connect a GitHub repository, then choose a project to bind it to.');
      return;
    }
    setMessage('');
    try {
      await bindRepository.mutateAsync({
        repository_id: savedRepoId,
        role: repositoryRole as 'primary' | 'dependency' | 'docs' | 'infra',
      });
      setBoundProjectId(projectId);
      setMessage(`Repository ${savedRepoId} bound to the selected project.`);
    } catch {
      setMessage(
        'Repository could not be bound to this project. It may already be bound, or the project may already have a primary repository.'
      );
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-8">
      <p className="text-sm leading-6 text-text-muted">
        Connect the GitHub App, control how pull requests appear in CodingCTO, and choose which
        agent attribution is added to commits.
      </p>

      <Card>
        <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
              <Github className="h-5 w-5" />
            </div>
            <div>
              <div className="font-medium">Enable GitHub features</div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                When disabled, GitHub entry points are hidden and no new GitHub side effects are
                created. Existing records are kept.
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
        <h3 className="text-base font-semibold">Connection</h3>
        <Card>
          <CardContent className="flex flex-col gap-4 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-bg-subtle">
                <Github className="h-5 w-5" />
              </div>
              <div>
                <div className="font-medium">GitHub App</div>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  Automatically link issues to pull requests. When a PR branch, title, or body
                  contains{' '}
                  <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">MUL-123</code> and
                  the PR is merged, the matching issue can be marked as completed.
                </p>
              </div>
            </div>
            {installURL && workspaceId.trim() ? (
              <Button asChild disabled={!settings.enabled}>
                <a href={installURL} target="_blank" rel="noreferrer">
                  Install GitHub App
                </a>
              </Button>
            ) : (
              <Button
                onClick={() => {
                  setMessage(
                    workspaceId.trim()
                      ? 'Enter a GitHub App slug or installation URL first. If you do not have a GitHub App yet, create one in GitHub.'
                      : 'Create or select a workspace first so the GitHub App installation can return to the correct workspace.'
                  );
                  if (workspaceId.trim()) {
                    focusInstallEntry();
                  }
                }}
                disabled={!settings.enabled}
              >
                Install GitHub App
              </Button>
            )}
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Features</h3>
        <Card>
          <CardContent className="divide-y divide-border-subtle p-0">
            <FeatureToggle
              icon={PanelRight}
              title="Pull request sidebar"
              description="Show linked pull requests in the issue detail sidebar."
              checked={settings.pullRequestSidebar}
              disabled={!settings.enabled || isSaving}
              onCheckedChange={checked => updateSetting('pullRequestSidebar', checked)}
            />
            <FeatureToggle
              icon={SlidersHorizontal}
              title="Co-authored-by trailer"
              description={
                <>
                  Append{' '}
                  <code className="rounded bg-bg-subtle px-1.5 py-0.5 text-xs">
                    Co-authored-by: codingcto-agent &lt;github@codingcto.local&gt;
                  </code>{' '}
                  to agent-generated commits.
                </>
              }
              checked={settings.coAuthoredByTrailer}
              disabled={!settings.enabled || isSaving}
              onCheckedChange={checked => updateSetting('coAuthoredByTrailer', checked)}
            />
            <FeatureToggle
              icon={Link2}
              title="Issue and PR auto-linking"
              description="Match issue IDs from PR titles, bodies, and branch names, then create links automatically."
              checked={settings.issuePrAutoLink}
              disabled={!settings.enabled || isSaving}
              onCheckedChange={checked => updateSetting('issuePrAutoLink', checked)}
            />
          </CardContent>
        </Card>
      </section>

      <section className="space-y-3">
        <h3 className="text-base font-semibold">Code Repository</h3>
        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="font-medium">Repository URLs still live under the repository tab</div>
              <p className="mt-1 text-sm text-text-muted">
                Connect the GitHub App here, then bind the concrete repository for CodingCTO runs.
              </p>
            </div>
            <Button variant="outline" onClick={focusConnectionForm} disabled={!settings.enabled}>
              Enter repository
              <ExternalLink className="ml-1.5 h-4 w-4" />
            </Button>
          </CardContent>
        </Card>
      </section>

      <Card id="github-repository-form">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bot className="h-5 w-5" />
            CodingCTO repository connection
          </CardTitle>
          <CardDescription>
            After installing the GitHub App, save the installation and repository mapping. The
            backend reads the default branch to verify that the App can access this repository.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="github-app-install-entry">GitHub App slug or installation URL</Label>
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
                    Open install page
                    <ExternalLink className="ml-1.5 h-4 w-4" />
                  </a>
                </Button>
              ) : (
                <Button
                  variant="outline"
                  onClick={() => {
                    setMessage(
                      workspaceId.trim()
                        ? 'Enter a GitHub App slug or installation URL first.'
                        : 'Create or select a workspace before opening the GitHub App install page.'
                    );
                    if (workspaceId.trim()) {
                      focusInstallEntry();
                    }
                  }}
                  disabled={!settings.enabled}
                >
                  Open install page
                  <ExternalLink className="ml-1.5 h-4 w-4" />
                </Button>
              )}
            </div>
            <p className="text-sm leading-6 text-text-muted">
              This is the platform GitHub App installation entry. Users install it and select the
              GitHub account, organization, and repositories CodingCTO may access.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <div className="space-y-2">
              <Label htmlFor="github-workspace">Workspace</Label>
              {workspaces.length > 0 ? (
                <Select value={workspaceId} onValueChange={setSelectedWorkspaceId}>
                  <SelectTrigger id="github-workspace">
                    <SelectValue placeholder="Select workspace" />
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
                  <Link href={ROUTES.CONSOLE.PROJECTS}>Create workspace first</Link>
                </Button>
              )}
              {selectedWorkspace && (
                <p className="text-xs leading-5 text-text-muted">
                  ID: {selectedWorkspace.workspace_id}
                </p>
              )}
              {workspacesQuery.isError && (
                <p className="text-xs leading-5 text-error">
                  Workspace API unavailable. Sign in with backend auth first.
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-installation">Installation ID</Label>
              <Input
                id="github-installation"
                inputMode="numeric"
                value={installationId}
                onChange={event => setInstallationId(event.target.value)}
                placeholder="GitHub App installation ID"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-account">Installed account</Label>
              <Input
                id="github-account"
                value={accountLogin}
                onChange={event => setAccountLogin(event.target.value)}
                placeholder="Organization or user, for example agicto"
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
              {syncInstallation.isPending ? 'Syncing' : 'Sync accessible repositories'}
            </Button>
          </div>

          {repositoryOptions.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="github-repository-option">Select repository</Label>
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
              <Label htmlFor="github-owner">Repository owner</Label>
              <Input
                id="github-owner"
                value={owner}
                onChange={event => setOwner(event.target.value)}
                placeholder="agicto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-repo">Repository name</Label>
              <Input
                id="github-repo"
                value={repo}
                onChange={event => setRepo(event.target.value)}
                placeholder="codingcto"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="github-default-branch">Default branch</Label>
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
              <Label className="text-base">Private repository</Label>
              <p className="mt-1 text-sm text-text-muted">
                This only affects the local repository record. Actual access is controlled by the
                GitHub App installation.
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
                Connected: {savedRepoId}
              </div>
              {savedInstallationDbId ? (
                <div className="mt-1 text-xs">
                  Local installation record ID: {savedInstallationDbId}
                </div>
              ) : null}
            </div>
          )}

          {savedRepoId && (
            <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3">
              <div className="text-sm font-medium text-text-main">Bind to project</div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                Attach this connected GitHub repository to a project so project-scoped SpecForge can
                plan, compile prompts, and execute against the primary repository.
              </p>
              <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_180px_auto]">
                <div className="space-y-2">
                  <Label htmlFor="github-project-bind">Project</Label>
                  {projects.length > 0 ? (
                    <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                      <SelectTrigger id="github-project-bind">
                        <SelectValue placeholder="Select project" />
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
                      <Link href={ROUTES.CONSOLE.PROJECTS}>Create project first</Link>
                    </Button>
                  )}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="github-project-role">Role</Label>
                  <Select value={repositoryRole} onValueChange={setRepositoryRole}>
                    <SelectTrigger id="github-project-role">
                      <SelectValue placeholder="Role" />
                    </SelectTrigger>
                    <SelectContent>
                      {['primary', 'dependency', 'docs', 'infra'].map(role => (
                        <SelectItem key={role} value={role}>
                          {repositoryRoleLabel(role)}
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
                    {bindRepository.isPending ? 'Binding' : 'Bind to project'}
                  </Button>
                </div>
              </div>
              {projectsQuery.isError && (
                <p className="mt-2 text-xs leading-5 text-error">
                  Could not load projects for this workspace.
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
            {isSaving ? 'Connecting' : 'Connect GitHub repository'}
          </Button>
          {savedRepoId ? (
            <Button asChild variant="outline">
              <Link href={specForgeHref}>
                Use in CodingCTO
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          ) : (
            <Button variant="outline" disabled>
              Use in CodingCTO
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
