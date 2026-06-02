'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  CircleAlert,
  FolderGit2,
  Github,
  GitPullRequest,
  Plus,
  Settings,
} from 'lucide-react';

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
import { Textarea } from '@/components/ui/textarea';
import {
  projectOnboardingSteps,
  resolveProjectOnboardingStep,
  type ProjectOnboardingStep,
} from '@/features/project/project-onboarding';
import {
  useBindProjectRepository,
  useCreateProject,
  useCreateWorkspace,
  useProjectContext,
} from '@/features/project/hooks/use-projects';
import {
  projectOverviewHref,
  projectRequirementNewHref,
  slugFromProjectName,
} from '@/features/project/project-utils';
import type { ProjectDTO, WorkspaceDTO } from '@/features/project/services/project-service';
import { useGitHubRepositories } from '@/features/specforge/hooks/use-specforge';
import type { GitHubRepositoryDTO } from '@/features/specforge/services/specforge-service';
import { useT } from '@/i18n';
import { cn } from '@/utils';

interface ProjectOnboardingWizardProps {
  workspaces: WorkspaceDTO[];
  projects: ProjectDTO[];
  selectedWorkspace?: WorkspaceDTO;
  selectedWorkspaceId: string;
  setSelectedWorkspaceId: (workspaceId: string) => void;
}

export function ProjectOnboardingWizard({
  workspaces,
  projects,
  selectedWorkspace,
  selectedWorkspaceId,
  setSelectedWorkspaceId,
}: ProjectOnboardingWizardProps) {
  const t = useT('dashboard.projectsConsole');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [projectDescription, setProjectDescription] = useState('');
  const [projectError, setProjectError] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<number>();
  const [repositoryId, setRepositoryId] = useState('');
  const [repositoryMessage, setRepositoryMessage] = useState('');
  const [repositoryMessageTone, setRepositoryMessageTone] = useState<'error' | 'neutral'>(
    'neutral'
  );
  const [workspaceFormExpanded, setWorkspaceFormExpanded] = useState(false);
  const [projectFormExpanded, setProjectFormExpanded] = useState(false);

  const createWorkspace = useCreateWorkspace();
  const createProject = useCreateProject(selectedWorkspaceId);
  const activeProject = useMemo(() => {
    if (projects.length === 0) {
      return undefined;
    }
    return projects.find(project => project.id === selectedProjectId) ?? projects[0];
  }, [projects, selectedProjectId]);
  const activeProjectId = activeProject?.id ?? 0;
  const projectContextQuery = useProjectContext(activeProjectId);
  const projectContext = projectContextQuery.data?.context;
  const bindRepository = useBindProjectRepository(activeProjectId);
  const repositoriesQuery = useGitHubRepositories(
    selectedWorkspaceId ? { workspace_id: selectedWorkspaceId } : undefined
  );
  const connectedRepositories = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories]
  );
  const boundRepositoryIds = useMemo(
    () =>
      new Set(
        (projectContext?.repository_contexts ?? []).map(context => context.repository.repository_id)
      ),
    [projectContext?.repository_contexts]
  );
  const availableRepositories = useMemo(
    () =>
      connectedRepositories.filter(repository => !boundRepositoryIds.has(repository.repository_id)),
    [boundRepositoryIds, connectedRepositories]
  );
  const primaryRepositoryId = projectContext?.primary_repository_id ?? '';
  const primaryRepository =
    connectedRepositories.find(repository => repository.repository_id === primaryRepositoryId) ??
    undefined;
  const selectedRepositoryId = availableRepositories.some(
    repository => repository.repository_id === repositoryId
  )
    ? repositoryId
    : (availableRepositories[0]?.repository_id ?? '');
  const workspaceFormVisible = workspaces.length === 0 || workspaceFormExpanded;
  const projectFormVisible = projects.length === 0 || projectFormExpanded;
  const hasWorkspace = Boolean(selectedWorkspaceId);
  const hasProject = Boolean(activeProject);
  const hasPrimaryRepository = Boolean(primaryRepositoryId);
  const activeStep = resolveProjectOnboardingStep({
    hasWorkspace,
    hasProject,
    hasPrimaryRepository,
  });
  const steps = projectOnboardingSteps({ hasWorkspace, hasProject, hasPrimaryRepository });

  function handleWorkspaceNameChange(value: string) {
    setWorkspaceName(value);
    setWorkspaceSlug(current => (current ? current : slugFromProjectName(value)));
  }

  function handleProjectNameChange(value: string) {
    setProjectName(value);
    setProjectSlug(current => (current ? current : slugFromProjectName(value)));
  }

  async function handleWorkspaceSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setWorkspaceError('');
    const trimmedName = workspaceName.trim();
    const trimmedSlug = slugFromProjectName(workspaceSlug || workspaceName);
    if (!trimmedName || !trimmedSlug) {
      setWorkspaceError(t('messages.workspaceRequired'));
      return;
    }

    try {
      const response = await createWorkspace.mutateAsync({
        name: trimmedName,
        slug: trimmedSlug,
        description: workspaceDescription.trim(),
      });
      setSelectedWorkspaceId(response.workspace.workspace_id);
      setWorkspaceName('');
      setWorkspaceSlug('');
      setWorkspaceDescription('');
      setWorkspaceFormExpanded(false);
    } catch {
      setWorkspaceError(t('messages.workspaceCreateFailed'));
    }
  }

  async function handleProjectSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setProjectError('');
    const trimmedName = projectName.trim();
    const trimmedSlug = slugFromProjectName(projectSlug || projectName);
    if (!selectedWorkspaceId) {
      setProjectError(t('messages.selectWorkspaceFirst'));
      return;
    }
    if (!trimmedName || !trimmedSlug) {
      setProjectError(t('messages.projectRequired'));
      return;
    }

    try {
      const response = await createProject.mutateAsync({
        workspace_id: selectedWorkspaceId,
        name: trimmedName,
        slug: trimmedSlug,
        description: projectDescription.trim(),
      });
      setSelectedProjectId(response.project.id);
      setProjectName('');
      setProjectSlug('');
      setProjectDescription('');
      setProjectFormExpanded(false);
    } catch {
      setProjectError(t('messages.projectCreateFailed'));
    }
  }

  async function handleRepositoryBind(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRepositoryMessage('');
    if (!activeProjectId) {
      setRepositoryMessageTone('error');
      setRepositoryMessage(t('messages.selectProjectFirst'));
      return;
    }
    const nextRepositoryId = selectedRepositoryId.trim();
    if (!nextRepositoryId) {
      setRepositoryMessageTone('error');
      setRepositoryMessage(t('messages.repositoryRequired'));
      return;
    }

    try {
      const response = await bindRepository.mutateAsync({
        repository_id: nextRepositoryId,
        role: 'primary',
      });
      setRepositoryMessageTone('neutral');
      setRepositoryMessage(
        t('messages.repositoryBound', { repoId: response.repository.repository_id })
      );
      await projectContextQuery.refetch();
    } catch {
      setRepositoryMessageTone('error');
      setRepositoryMessage(t('messages.repositoryBindFailed'));
    }
  }

  return (
    <Card className="gap-0 overflow-hidden border-border-subtle bg-background py-0 shadow-xs">
      <CardHeader className="border-b border-border-subtle p-5">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="min-w-0">
            <CardTitle className="text-base">{t('wizard.title')}</CardTitle>
            <CardDescription className="mt-1 max-w-2xl">{t('wizard.description')}</CardDescription>
          </div>
          <Badge variant="outline" className="border-primary/25 text-primary">
            {t(`wizard.status.${activeStep}`)}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="grid gap-0 p-0 lg:grid-cols-[310px_minmax(0,1fr)]">
        <div className="border-b border-border-subtle bg-bg-subtle/45 p-5 lg:border-b-0 lg:border-r">
          <div className="space-y-3">
            {steps.map((step, index) => (
              <OnboardingStepRail
                key={step.id}
                step={step}
                index={index + 1}
                title={t(`setup.steps.${setupStepCopyKey(step.id)}.title`)}
                description={t(`setup.steps.${setupStepCopyKey(step.id)}.description`)}
              />
            ))}
          </div>
        </div>
        <div className="min-w-0 p-5">
          {activeStep === 'workspace' ? (
            <WorkspaceStage
              t={t}
              workspaces={workspaces}
              selectedWorkspaceId={selectedWorkspaceId}
              selectedWorkspace={selectedWorkspace}
              workspaceName={workspaceName}
              workspaceSlug={workspaceSlug}
              workspaceDescription={workspaceDescription}
              workspaceError={workspaceError}
              workspaceFormVisible={workspaceFormVisible}
              isPending={createWorkspace.isPending}
              setSelectedWorkspaceId={setSelectedWorkspaceId}
              setWorkspaceFormVisible={setWorkspaceFormExpanded}
              onSubmit={handleWorkspaceSubmit}
              onNameChange={handleWorkspaceNameChange}
              onSlugChange={setWorkspaceSlug}
              onDescriptionChange={setWorkspaceDescription}
            />
          ) : null}

          {activeStep === 'project' ? (
            <ProjectStage
              t={t}
              projects={projects}
              selectedProject={activeProject}
              projectName={projectName}
              projectSlug={projectSlug}
              projectDescription={projectDescription}
              projectError={projectError}
              projectFormVisible={projectFormVisible}
              isPending={createProject.isPending}
              setProjectFormVisible={setProjectFormExpanded}
              setSelectedProjectId={setSelectedProjectId}
              onSubmit={handleProjectSubmit}
              onNameChange={handleProjectNameChange}
              onSlugChange={setProjectSlug}
              onDescriptionChange={setProjectDescription}
            />
          ) : null}

          {activeStep === 'repository' ? (
            <RepositoryStage
              t={t}
              activeProject={activeProject}
              repositories={connectedRepositories}
              availableRepositories={availableRepositories}
              isLoading={repositoriesQuery.isFetching || projectContextQuery.isFetching}
              repositoryId={selectedRepositoryId}
              message={repositoryMessage}
              messageTone={repositoryMessageTone}
              isPending={bindRepository.isPending}
              onRepositoryChange={setRepositoryId}
              onSubmit={handleRepositoryBind}
            />
          ) : null}

          {activeStep === 'complete' && activeProject ? (
            <CompleteStage
              t={t}
              project={activeProject}
              repository={primaryRepository}
              repositoryId={primaryRepositoryId}
            />
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

function setupStepCopyKey(stepId: ProjectOnboardingStep['id']) {
  return stepId === 'repository' ? 'github' : stepId;
}

function WorkspaceStage({
  t,
  workspaces,
  selectedWorkspaceId,
  selectedWorkspace,
  workspaceName,
  workspaceSlug,
  workspaceDescription,
  workspaceError,
  workspaceFormVisible,
  isPending,
  setSelectedWorkspaceId,
  setWorkspaceFormVisible,
  onSubmit,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  workspaces: WorkspaceDTO[];
  selectedWorkspaceId: string;
  selectedWorkspace?: WorkspaceDTO;
  workspaceName: string;
  workspaceSlug: string;
  workspaceDescription: string;
  workspaceError: string;
  workspaceFormVisible: boolean;
  isPending: boolean;
  setSelectedWorkspaceId: (workspaceId: string) => void;
  setWorkspaceFormVisible: (visible: boolean) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <section className="space-y-5">
      <StageHeading
        icon={<Building2 className="h-4 w-4" />}
        title={t('wizard.workspace.title')}
        description={t('wizard.workspace.description')}
      />
      {workspaces.length > 0 ? (
        <div className="grid gap-3 rounded-[4px] border border-border-subtle bg-bg-subtle/40 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="onboarding-workspace">{t('workspace.title')}</Label>
            <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
              <SelectTrigger id="onboarding-workspace" className="w-full bg-background">
                <SelectValue placeholder={t('workspace.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {workspaces.map(workspace => (
                  <SelectItem key={workspace.workspace_id} value={workspace.workspace_id}>
                    {workspace.name} ({workspace.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-text-muted">
              {selectedWorkspace
                ? t('workspace.selected', { name: selectedWorkspace.name })
                : t('workspace.empty')}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setWorkspaceFormVisible(true)}>
            {t('actions.newWorkspace')}
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {workspaceFormVisible ? (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="onboarding-workspace-name">{t('fields.name')}</Label>
              <Input
                id="onboarding-workspace-name"
                value={workspaceName}
                onChange={event => onNameChange(event.target.value)}
                placeholder="Acme Platform"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-workspace-slug">{t('fields.slug')}</Label>
              <Input
                id="onboarding-workspace-slug"
                value={workspaceSlug}
                onChange={event => onSlugChange(slugFromProjectName(event.target.value))}
                placeholder="acme-platform"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-workspace-description">{t('fields.description')}</Label>
            <Textarea
              id="onboarding-workspace-description"
              value={workspaceDescription}
              onChange={event => onDescriptionChange(event.target.value)}
              placeholder={t('newWorkspace.descriptionPlaceholder')}
              rows={3}
            />
          </div>
          <FormMessage message={workspaceError} tone="error" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={isPending} loading={isPending}>
              {t('actions.createWorkspace')}
              <ArrowRight className="h-4 w-4" />
            </Button>
            {workspaces.length > 0 ? (
              <Button
                type="button"
                variant="ghost"
                onClick={() => setWorkspaceFormVisible(false)}
              >
                {t('actions.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

function ProjectStage({
  t,
  projects,
  selectedProject,
  projectName,
  projectSlug,
  projectDescription,
  projectError,
  projectFormVisible,
  isPending,
  setProjectFormVisible,
  setSelectedProjectId,
  onSubmit,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  projects: ProjectDTO[];
  selectedProject?: ProjectDTO;
  projectName: string;
  projectSlug: string;
  projectDescription: string;
  projectError: string;
  projectFormVisible: boolean;
  isPending: boolean;
  setProjectFormVisible: (visible: boolean) => void;
  setSelectedProjectId: (projectId: number) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <section className="space-y-5">
      <StageHeading
        icon={<FolderGit2 className="h-4 w-4" />}
        title={t('wizard.project.title')}
        description={t('wizard.project.description')}
      />
      {projects.length > 0 ? (
        <div className="grid gap-3 rounded-[4px] border border-border-subtle bg-bg-subtle/40 p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
          <div className="space-y-2">
            <Label htmlFor="onboarding-project">{t('wizard.project.selectLabel')}</Label>
            <Select
              value={selectedProject ? String(selectedProject.id) : ''}
              onValueChange={value => setSelectedProjectId(Number(value))}
            >
              <SelectTrigger id="onboarding-project" className="w-full bg-background">
                <SelectValue placeholder={t('wizard.project.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {projects.map(project => (
                  <SelectItem key={project.id} value={String(project.id)}>
                    {project.name} ({project.slug})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-text-muted">
              {selectedProject
                ? t('wizard.project.selected', { name: selectedProject.name })
                : t('wizard.project.empty')}
            </p>
          </div>
          <Button type="button" variant="outline" onClick={() => setProjectFormVisible(true)}>
            {t('actions.newProject')}
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      ) : null}

      {projectFormVisible ? (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="onboarding-project-name">{t('fields.name')}</Label>
              <Input
                id="onboarding-project-name"
                value={projectName}
                onChange={event => onNameChange(event.target.value)}
                placeholder="CodingCTO"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="onboarding-project-slug">{t('fields.slug')}</Label>
              <Input
                id="onboarding-project-slug"
                value={projectSlug}
                onChange={event => onSlugChange(slugFromProjectName(event.target.value))}
                placeholder="codingcto"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="onboarding-project-description">{t('fields.description')}</Label>
            <Textarea
              id="onboarding-project-description"
              value={projectDescription}
              onChange={event => onDescriptionChange(event.target.value)}
              placeholder={t('newProject.descriptionPlaceholder')}
              rows={3}
            />
          </div>
          <FormMessage message={projectError} tone="error" />
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button type="submit" disabled={isPending} loading={isPending}>
              {t('actions.createProject')}
              <ArrowRight className="h-4 w-4" />
            </Button>
            {projects.length > 0 ? (
              <Button type="button" variant="ghost" onClick={() => setProjectFormVisible(false)}>
                {t('actions.cancel')}
              </Button>
            ) : null}
          </div>
        </form>
      ) : null}
    </section>
  );
}

function RepositoryStage({
  t,
  activeProject,
  repositories,
  availableRepositories,
  isLoading,
  repositoryId,
  message,
  messageTone,
  isPending,
  onRepositoryChange,
  onSubmit,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  activeProject?: ProjectDTO;
  repositories: GitHubRepositoryDTO[];
  availableRepositories: GitHubRepositoryDTO[];
  isLoading: boolean;
  repositoryId: string;
  message: string;
  messageTone: 'error' | 'neutral';
  isPending: boolean;
  onRepositoryChange: (repositoryId: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  const hasRepositories = repositories.length > 0;
  const hasAvailableRepositories = availableRepositories.length > 0;

  return (
    <section className="space-y-5">
      <StageHeading
        icon={<Github className="h-4 w-4" />}
        title={t('wizard.repository.title')}
        description={t('wizard.repository.description')}
      />
      <div className="rounded-[4px] border border-border-subtle bg-bg-subtle/40 p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-main">
              {activeProject
                ? t('wizard.repository.project', { name: activeProject.name })
                : t('wizard.project.empty')}
            </div>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {isLoading
                ? t('wizard.repository.loading')
                : t('wizard.repository.connectedCount', { count: repositories.length })}
            </p>
          </div>
          <Button asChild variant="outline">
            <Link href="/console/settings?tab=github">
              {t('actions.configureGitHub')}
              <Settings className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>

      {!isLoading && !hasRepositories ? (
        <div className="rounded-[4px] border border-warning/30 bg-warning-subtle p-4">
          <div className="flex items-start gap-3">
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <div className="text-sm font-medium text-text-main">
                {t('wizard.repository.emptyTitle')}
              </div>
              <p className="mt-1 text-sm leading-6 text-text-muted">
                {t('wizard.repository.emptyDescription')}
              </p>
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && hasRepositories && !hasAvailableRepositories ? (
        <div className="rounded-[4px] border border-warning/30 bg-warning-subtle p-4 text-sm leading-6 text-text-muted">
          {t('wizard.repository.allBound')}
        </div>
      ) : null}

      {hasAvailableRepositories ? (
        <form className="grid gap-4" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="onboarding-repository">{t('wizard.repository.selectLabel')}</Label>
            <Select value={repositoryId} onValueChange={onRepositoryChange}>
              <SelectTrigger id="onboarding-repository" className="w-full bg-background">
                <SelectValue placeholder={t('wizard.repository.selectPlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {availableRepositories.map(repository => (
                  <SelectItem key={repository.repository_id} value={repository.repository_id}>
                    {repository.github_owner}/{repository.github_repo} ·{' '}
                    {repository.default_branch}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <FormMessage message={message} tone={messageTone} />
          <Button type="submit" disabled={isPending || !repositoryId} loading={isPending}>
            {t('wizard.repository.bindPrimary')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </form>
      ) : null}
    </section>
  );
}

function CompleteStage({
  t,
  project,
  repository,
  repositoryId,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  project: ProjectDTO;
  repository?: GitHubRepositoryDTO;
  repositoryId: string;
}) {
  return (
    <section className="space-y-5">
      <StageHeading
        icon={<GitPullRequest className="h-4 w-4" />}
        title={t('wizard.complete.title')}
        description={t('wizard.complete.description')}
      />
      <div className="rounded-[4px] border border-success/25 bg-success/5 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" />
          <div className="min-w-0">
            <div className="text-sm font-medium text-text-main">
              {t('wizard.complete.ready', { name: project.name })}
            </div>
            <p className="mt-1 text-sm leading-6 text-text-muted">
              {repository
                ? `${repository.github_owner}/${repository.github_repo} · ${repository.default_branch}`
                : repositoryId}
            </p>
          </div>
        </div>
      </div>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Button asChild>
          <Link href={projectRequirementNewHref(project.id)}>
            {t('wizard.complete.startRequirement')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={projectOverviewHref(project.id)}>{t('actions.openProject')}</Link>
        </Button>
      </div>
    </section>
  );
}

function StageHeading({
  icon,
  title,
  description,
}: {
  icon: ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle bg-bg-subtle text-primary">
        {icon}
      </div>
      <div className="min-w-0">
        <h2 className="text-sm font-semibold text-text-main">{title}</h2>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">{description}</p>
      </div>
    </div>
  );
}

function OnboardingStepRail({
  step,
  index,
  title,
  description,
}: {
  step: ProjectOnboardingStep;
  index: number;
  title: string;
  description: string;
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-[4px] border border-border-subtle bg-background p-3',
        step.state === 'current' && 'border-primary/35 bg-primary-subtle/30',
        step.state === 'done' && 'border-success/25 bg-success/5',
        step.state === 'locked' && 'opacity-70'
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle font-mono text-[11px] text-text-muted',
          step.state === 'done' && 'border-success/25 bg-success/10 text-success',
          step.state === 'current' && 'border-primary/30 bg-background text-primary'
        )}
      >
        {step.state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
      </div>
      <div className="min-w-0">
        <div className="text-sm font-medium text-text-main">{title}</div>
        <p className="mt-1 text-xs leading-5 text-text-muted">{description}</p>
      </div>
    </div>
  );
}

function FormMessage({
  message,
  tone,
}: {
  message: string;
  tone: 'error' | 'neutral';
}) {
  if (!message) {
    return null;
  }

  return (
    <div
      className={cn(
        'rounded-[4px] border p-3 text-sm leading-5',
        tone === 'error'
          ? 'border-error/30 bg-error-subtle text-error'
          : 'border-border-subtle bg-bg-subtle text-text-muted'
      )}
    >
      {message}
    </div>
  );
}
