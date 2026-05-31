'use client';

import Link from 'next/link';
import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowRight,
  Boxes,
  Building2,
  GitBranch,
  GitPullRequest,
  Plus,
  RefreshCw,
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
import { cn } from '@/utils';
import { useT } from '@/i18n';
import {
  projectSpecForgeHref,
  slugFromProjectName,
} from '@/features/project/project-utils';
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

  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects]
  );

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
    } catch {
      setFormError(t('messages.projectCreateFailed'));
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/30 text-primary">
              {t('badges.enterprise')}
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                workspacesQuery.isError
                  ? 'border-error/30 text-error'
                  : 'border-success/30 text-success'
              )}
            >
              {workspacesQuery.isError ? t('badges.apiUnavailable') : t('badges.liveApi')}
            </Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal">{t('title')}</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            {t('description')}
          </p>
        </div>
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
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                {t('workspace.title')}
              </CardTitle>
              <CardDescription>
                {t('workspace.description')}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspaces.length > 0 ? (
                <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                  <SelectTrigger className="w-full">
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
              ) : (
                <div className="rounded-lg border border-border-subtle bg-muted/30 p-4 text-sm text-text-muted">
                  {t('workspace.empty')}
                </div>
              )}
              {selectedWorkspace && (
                <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
                  <div className="font-medium text-text">{selectedWorkspace.name}</div>
                  <div>{selectedWorkspace.description || t('workspace.noDescription')}</div>
                  <div className="mt-1 text-xs">
                    {t('workspace.id', { id: selectedWorkspace.workspace_id })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {projectsQuery.isFetching ? (
            <div className="rounded-lg border border-border-subtle bg-muted/30 p-4 text-sm text-text-muted">
              {t('projects.loading')}
            </div>
          ) : projects.length > 0 ? (
            projects.map(project => (
              <ProjectRow key={`${project.id}-${project.slug}`} project={project} t={t} />
            ))
          ) : (
            <div className="rounded-lg border border-border-subtle bg-muted/30 p-4 text-sm text-text-muted">
              {selectedWorkspaceId
                ? t('projects.emptyForWorkspace')
                : t('projects.selectWorkspace')}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                {t('newWorkspace.title')}
              </CardTitle>
              <CardDescription>
                {t('newWorkspace.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleWorkspaceSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">{t('fields.name')}</Label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={event => handleWorkspaceNameChange(event.target.value)}
                    placeholder="Acme Platform"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-slug">{t('fields.slug')}</Label>
                  <Input
                    id="workspace-slug"
                    value={workspaceSlug}
                    onChange={event => setWorkspaceSlug(slugFromProjectName(event.target.value))}
                    placeholder="acme-platform"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-description">{t('fields.description')}</Label>
                  <Textarea
                    id="workspace-description"
                    value={workspaceDescription}
                    onChange={event => setWorkspaceDescription(event.target.value)}
                    placeholder={t('newWorkspace.descriptionPlaceholder')}
                    rows={3}
                  />
                </div>
                {workspaceError && (
                  <div className="rounded-lg border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
                    {workspaceError}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={createWorkspace.isPending}>
                  {createWorkspace.isPending ? t('actions.creating') : t('actions.createWorkspace')}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                {t('newProject.title')}
              </CardTitle>
              <CardDescription>
                {t('newProject.description')}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="project-name">{t('fields.name')}</Label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={event => handleNameChange(event.target.value)}
                    placeholder="CodingCTO"
                    disabled={!selectedWorkspaceId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-slug">{t('fields.slug')}</Label>
                  <Input
                    id="project-slug"
                    value={slug}
                    onChange={event => setSlug(slugFromProjectName(event.target.value))}
                    placeholder="codingcto"
                    disabled={!selectedWorkspaceId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-description">{t('fields.description')}</Label>
                  <Textarea
                    id="project-description"
                    value={description}
                    onChange={event => setDescription(event.target.value)}
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
                <Button
                  type="submit"
                  className="w-full"
                  disabled={!selectedWorkspaceId || createProject.isPending}
                >
                  {createProject.isPending ? t('actions.creating') : t('actions.createProject')}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>
        </aside>
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
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Boxes className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{project.name}</h2>
                <div className="text-xs text-text-muted">{project.slug}</div>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-text-muted">
              {project.description || t('projects.noDescription')}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge
                variant="outline"
                className={cn(project.status === 'active' && 'text-success')}
              >
                {project.status}
              </Badge>
              <Badge variant="outline">
                <GitBranch className="mr-1 h-3.5 w-3.5" />
                {t('projects.primaryRepoRequired')}
              </Badge>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href={projectSpecForgeHref(project.id)}>
              {t('actions.openCodingCTO')}
              <GitPullRequest className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
