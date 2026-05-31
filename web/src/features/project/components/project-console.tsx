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
import {
  projectSpecForgeHref,
  repositoryRoleLabel,
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
      setWorkspaceError('Workspace name and slug are required.');
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
      setWorkspaceError(
        'Workspace could not be created. Check the API connection and slug uniqueness.'
      );
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    const trimmedSlug = slugFromProjectName(slug || name);
    if (!selectedWorkspaceId) {
      setFormError('Create or select a workspace before creating a project.');
      return;
    }
    if (!trimmedName || !trimmedSlug) {
      setFormError('Project name and slug are required.');
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
      setFormError('Project could not be created. Check the API connection and slug uniqueness.');
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="outline" className="border-primary/30 text-primary">
              Enterprise workspace
            </Badge>
            <Badge
              variant="outline"
              className={cn(
                workspacesQuery.isError
                  ? 'border-error/30 text-error'
                  : 'border-success/30 text-success'
              )}
            >
              {workspacesQuery.isError ? 'API unavailable' : 'Live API'}
            </Badge>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal">Projects</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            Create a workspace, group repositories into projects, then run CodingCTO plans, prompts,
            and PR execution from real backend records.
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
          {workspacesQuery.isFetching || projectsQuery.isFetching ? 'Refreshing' : 'Refresh'}
          <RefreshCw className="ml-1.5 h-4 w-4" />
        </Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Building2 className="h-4 w-4 text-primary" />
                Workspace
              </CardTitle>
              <CardDescription>
                Select the enterprise boundary that owns these projects.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {workspaces.length > 0 ? (
                <Select value={selectedWorkspaceId} onValueChange={setSelectedWorkspaceId}>
                  <SelectTrigger className="w-full">
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
                <div className="rounded-lg border border-border-subtle bg-muted/30 p-4 text-sm text-text-muted">
                  No workspace yet. Create one to unlock project and CodingCTO flows.
                </div>
              )}
              {selectedWorkspace && (
                <div className="rounded-lg border border-border-subtle bg-bg-subtle p-3 text-sm leading-6 text-text-muted">
                  <div className="font-medium text-text">{selectedWorkspace.name}</div>
                  <div>{selectedWorkspace.description || 'No workspace description yet.'}</div>
                  <div className="mt-1 text-xs">ID: {selectedWorkspace.workspace_id}</div>
                </div>
              )}
            </CardContent>
          </Card>

          {projectsQuery.isFetching ? (
            <div className="rounded-lg border border-border-subtle bg-muted/30 p-4 text-sm text-text-muted">
              Loading projects from the selected workspace...
            </div>
          ) : projects.length > 0 ? (
            projects.map(project => (
              <ProjectRow key={`${project.id}-${project.slug}`} project={project} />
            ))
          ) : (
            <div className="rounded-lg border border-border-subtle bg-muted/30 p-4 text-sm text-text-muted">
              {selectedWorkspaceId
                ? 'No projects in this workspace yet. Create one to start repository binding.'
                : 'Select or create a workspace to list projects.'}
            </div>
          )}
        </section>

        <aside className="space-y-5">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                New workspace
              </CardTitle>
              <CardDescription>
                Create the real container before project and Git binding.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleWorkspaceSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="workspace-name">Name</Label>
                  <Input
                    id="workspace-name"
                    value={workspaceName}
                    onChange={event => handleWorkspaceNameChange(event.target.value)}
                    placeholder="Acme Platform"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-slug">Slug</Label>
                  <Input
                    id="workspace-slug"
                    value={workspaceSlug}
                    onChange={event => setWorkspaceSlug(slugFromProjectName(event.target.value))}
                    placeholder="acme-platform"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="workspace-description">Description</Label>
                  <Textarea
                    id="workspace-description"
                    value={workspaceDescription}
                    onChange={event => setWorkspaceDescription(event.target.value)}
                    placeholder="Who owns this product portfolio?"
                    rows={3}
                  />
                </div>
                {workspaceError && (
                  <div className="rounded-lg border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
                    {workspaceError}
                  </div>
                )}
                <Button type="submit" className="w-full" disabled={createWorkspace.isPending}>
                  {createWorkspace.isPending ? 'Creating' : 'Create workspace'}
                  <ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Plus className="h-4 w-4 text-primary" />
                New project
              </CardTitle>
              <CardDescription>
                Start with a product boundary, then bind repositories in the next step.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form className="space-y-4" onSubmit={handleSubmit}>
                <div className="space-y-2">
                  <Label htmlFor="project-name">Name</Label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={event => handleNameChange(event.target.value)}
                    placeholder="CodingCTO"
                    disabled={!selectedWorkspaceId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-slug">Slug</Label>
                  <Input
                    id="project-slug"
                    value={slug}
                    onChange={event => setSlug(slugFromProjectName(event.target.value))}
                    placeholder="codingcto"
                    disabled={!selectedWorkspaceId}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="project-description">Description</Label>
                  <Textarea
                    id="project-description"
                    value={description}
                    onChange={event => setDescription(event.target.value)}
                    placeholder="What product or system does this project represent?"
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
                  {createProject.isPending ? 'Creating' : 'Create project'}
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

function ProjectRow({ project }: { project: ProjectDTO }) {
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
              {project.description || 'No description yet.'}
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
                {repositoryRoleLabel('primary')} repo required
              </Badge>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href={projectSpecForgeHref(project.id)}>
              Open CodingCTO
              <GitPullRequest className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
