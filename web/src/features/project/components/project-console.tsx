'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowRight,
  Boxes,
  Building2,
  CheckCircle2,
  FolderGit2,
  GitBranch,
  GitPullRequest,
  LogIn,
  Plus,
  RefreshCw,
  Sparkles,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import { cn } from '@/utils';
import { useT } from '@/i18n';
import { projectOverviewHref, slugFromProjectName } from '@/features/project/project-utils';
import {
  useCreateProject,
  useCreateWorkspace,
  useProjects,
} from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import type { ProjectDTO } from '@/features/project/services/project-service';

export function ProjectConsole() {
  const t = useT('dashboard.projectsConsole');
  const [workspaceName, setWorkspaceName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [workspaceDescription, setWorkspaceDescription] = useState('');
  const [workspaceError, setWorkspaceError] = useState('');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [workspaceDialogOpen, setWorkspaceDialogOpen] = useState(false);
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  const {
    workspacesQuery,
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
  } = useSelectedWorkspace();
  const projectsQuery = useProjects(selectedWorkspaceId);
  const createWorkspace = useCreateWorkspace();
  const createProject = useCreateProject(selectedWorkspaceId);
  const backendUnavailable = workspacesQuery.isError;

  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects]
  );
  const hasWorkspace = Boolean(selectedWorkspaceId);
  const hasProject = projects.length > 0;

  function handleWorkspaceNameChange(value: string) {
    setWorkspaceName(value);
    setWorkspaceSlug(current => (current ? current : slugFromProjectName(value)));
  }

  function handleNameChange(value: string) {
    setName(value);
    setSlug(current => (current ? current : slugFromProjectName(value)));
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
      setWorkspaceDialogOpen(false);
    } catch {
      setWorkspaceError(t('messages.workspaceCreateFailed'));
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    const trimmedSlug = slugFromProjectName(slug || name);
    if (!selectedWorkspaceId) {
      setFormError(t('messages.selectWorkspaceFirst'));
      return;
    }
    if (!trimmedName || !trimmedSlug) {
      setFormError(t('messages.projectRequired'));
      return;
    }

    try {
      await createProject.mutateAsync({
        workspace_id: selectedWorkspaceId,
        name: trimmedName,
        slug: trimmedSlug,
        description: description.trim(),
      });
      setName('');
      setSlug('');
      setDescription('');
      setProjectDialogOpen(false);
    } catch {
      setFormError(t('messages.projectCreateFailed'));
    }
  }

  const primaryAction = !hasWorkspace ? (
    <Button
      type="button"
      className="w-full sm:w-auto"
      onClick={() => setWorkspaceDialogOpen(true)}
    >
      {t('actions.newWorkspace')}
      <Plus className="ml-1.5 h-4 w-4" />
    </Button>
  ) : !hasProject ? (
    <Button
      type="button"
      className="w-full sm:w-auto"
      onClick={() => setProjectDialogOpen(true)}
    >
      {t('actions.newProject')}
      <Plus className="ml-1.5 h-4 w-4" />
    </Button>
  ) : (
    <Button asChild className="w-full sm:w-auto">
      <Link href={projectOverviewHref(projects[0].id)}>
        {t('actions.openProject')}
        <GitPullRequest className="ml-1.5 h-4 w-4" />
      </Link>
    </Button>
  );

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
        <div className="flex flex-col gap-2 sm:flex-row">
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
            <RefreshCw className="ml-1.5 h-4 w-4" />
          </Button>
        </div>
      </header>

      {backendUnavailable ? <BackendSessionGate t={t} /> : null}

      {!backendUnavailable ? (
        <>
          <Card className="gap-0 overflow-hidden border-border-subtle bg-background/95 py-0 shadow-xs">
            <CardContent className="p-0">
              <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border border-border-subtle bg-bg-subtle text-primary">
                      <GitPullRequest className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-text-main">{t('setup.title')}</div>
                      <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
                        {t('setup.description')}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5 grid gap-3">
                    <SetupStep
                      index="01"
                      title={t('setup.steps.workspace.title')}
                      description={t('setup.steps.workspace.description')}
                      state={hasWorkspace ? 'done' : 'current'}
                    />
                    <SetupStep
                      index="02"
                      title={t('setup.steps.project.title')}
                      description={t('setup.steps.project.description')}
                      state={!hasWorkspace ? 'locked' : hasProject ? 'done' : 'current'}
                    />
                    <SetupStep
                      index="03"
                      title={t('setup.steps.github.title')}
                      description={t('setup.steps.github.description')}
                      state={hasProject ? 'current' : 'locked'}
                    />
                  </div>
                </div>
                <div className="border-t border-border-subtle bg-bg-subtle/50 p-5 lg:border-l lg:border-t-0">
                  <div className="text-xs font-medium uppercase tracking-wide text-text-muted">
                    {t('setup.nextAction')}
                  </div>
                  <div className="mt-2 text-sm font-semibold text-text-main">
                    {!hasWorkspace
                      ? t('setup.actions.workspace')
                      : !hasProject
                        ? t('setup.actions.project')
                        : t('setup.actions.github')}
                  </div>
                  <p className="mt-2 text-sm leading-6 text-text-muted">
                    {selectedWorkspace
                      ? t('workspace.selected', { name: selectedWorkspace.name })
                      : t('workspace.empty')}
                  </p>
                  {workspaces.length > 0 ? (
                    <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                      <SelectTrigger className="mt-4 w-full bg-background">
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
                  ) : null}
                  <div className="mt-4">{primaryAction}</div>
                </div>
              </div>
            </CardContent>
          </Card>

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
                  <div className="flex h-11 w-11 items-center justify-center rounded-full border border-dashed border-border-subtle bg-bg-subtle text-primary">
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

      <Dialog open={workspaceDialogOpen} onOpenChange={setWorkspaceDialogOpen}>
        <WorkspaceDialogContent
          t={t}
          workspaceName={workspaceName}
          workspaceSlug={workspaceSlug}
          workspaceDescription={workspaceDescription}
          workspaceError={workspaceError}
          isPending={createWorkspace.isPending}
          onSubmit={handleWorkspaceSubmit}
          onNameChange={handleWorkspaceNameChange}
          onSlugChange={setWorkspaceSlug}
          onDescriptionChange={setWorkspaceDescription}
        />
      </Dialog>

      <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
        <ProjectDialogContent
          t={t}
          name={name}
          slug={slug}
          description={description}
          formError={formError}
          selectedWorkspaceId={selectedWorkspaceId}
          isPending={createProject.isPending}
          onSubmit={handleSubmit}
          onNameChange={handleNameChange}
          onSlugChange={setSlug}
          onDescriptionChange={setDescription}
        />
      </Dialog>
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
            <LogIn className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}

function WorkspaceDialogContent({
  t,
  workspaceName,
  workspaceSlug,
  workspaceDescription,
  workspaceError,
  isPending,
  onSubmit,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  workspaceName: string;
  workspaceSlug: string;
  workspaceDescription: string;
  workspaceError: string;
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('newWorkspace.title')}</DialogTitle>
        <DialogDescription>{t('newWorkspace.description')}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form className="space-y-4 pb-1" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="workspace-name">{t('fields.name')}</Label>
            <Input
              id="workspace-name"
              value={workspaceName}
              onChange={event => onNameChange(event.target.value)}
              placeholder="Acme Platform"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-slug">{t('fields.slug')}</Label>
            <Input
              id="workspace-slug"
              value={workspaceSlug}
              onChange={event => onSlugChange(slugFromProjectName(event.target.value))}
              placeholder="acme-platform"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-description">{t('fields.description')}</Label>
            <Textarea
              id="workspace-description"
              value={workspaceDescription}
              onChange={event => onDescriptionChange(event.target.value)}
              placeholder={t('newWorkspace.descriptionPlaceholder')}
              rows={3}
            />
          </div>
          {workspaceError && (
            <div className="rounded-lg border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
              {workspaceError}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={isPending}>
            {isPending ? t('actions.creating') : t('actions.createWorkspace')}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </form>
      </DialogBody>
    </DialogContent>
  );
}

function ProjectDialogContent({
  t,
  name,
  slug,
  description,
  formError,
  selectedWorkspaceId,
  isPending,
  onSubmit,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  name: string;
  slug: string;
  description: string;
  formError: string;
  selectedWorkspaceId: string;
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{t('newProject.title')}</DialogTitle>
        <DialogDescription>{t('newProject.description')}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <form className="space-y-4 pb-1" onSubmit={onSubmit}>
          <div className="space-y-2">
            <Label htmlFor="project-name">{t('fields.name')}</Label>
            <Input
              id="project-name"
              value={name}
              onChange={event => onNameChange(event.target.value)}
              placeholder="CodingCTO"
              disabled={!selectedWorkspaceId}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-slug">{t('fields.slug')}</Label>
            <Input
              id="project-slug"
              value={slug}
              onChange={event => onSlugChange(slugFromProjectName(event.target.value))}
              placeholder="codingcto"
              disabled={!selectedWorkspaceId}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="project-description">{t('fields.description')}</Label>
            <Textarea
              id="project-description"
              value={description}
              onChange={event => onDescriptionChange(event.target.value)}
              placeholder={t('newProject.descriptionPlaceholder')}
              rows={4}
              disabled={!selectedWorkspaceId}
            />
          </div>
          {formError && (
            <div className="rounded-lg border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
              {formError}
            </div>
          )}
          <Button type="submit" className="w-full" disabled={!selectedWorkspaceId || isPending}>
            {isPending ? t('actions.creating') : t('actions.createProject')}
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Button>
        </form>
      </DialogBody>
    </DialogContent>
  );
}

function SetupStep({
  index,
  title,
  description,
  state,
}: {
  index: string;
  title: string;
  description: string;
  state: 'done' | 'current' | 'locked' | 'blocked';
}) {
  return (
    <div
      className={cn(
        'flex gap-3 rounded-lg border border-border-subtle bg-background p-3',
        state === 'current' && 'border-primary/35 bg-primary-subtle/30',
        state === 'done' && 'border-success/25 bg-success/5',
        state === 'blocked' && 'border-warning/30 bg-warning-subtle'
      )}
    >
      <div
        className={cn(
          'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-border-subtle font-mono text-[11px] text-text-muted',
          state === 'done' && 'border-success/25 bg-success/10 text-success',
          state === 'current' && 'border-primary/30 bg-background text-primary',
          state === 'blocked' && 'border-warning/30 bg-background text-warning'
        )}
      >
        {state === 'done' ? <CheckCircle2 className="h-3.5 w-3.5" /> : index}
      </div>
      <div>
        <div className="text-sm font-medium text-text-main">{title}</div>
        <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p>
      </div>
    </div>
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
          <div className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-border-subtle bg-background text-primary">
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
                <GitBranch className="mr-1 h-3.5 w-3.5" />
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
          <GitPullRequest className="ml-1.5 h-4 w-4" />
        </Link>
      </Button>
    </div>
  );
}
