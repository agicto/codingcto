'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, ReactNode, useMemo, useState } from 'react';
import {
  ArrowRight,
  Circle,
  Folder,
  Github,
  Minus,
  Plus,
  RefreshCw,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/http/request';
import { useT } from '@/i18n';
import {
  projectOverviewHref,
  slugFromProjectName,
} from '@/features/project/project-utils';
import {
  useCreateProject,
  useCreateWorkspace,
  useProjects,
} from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import type { ProjectDTO } from '@/features/project/services/project-service';

const minSlugLength = 2;
const defaultProjectWorkspaceId = 'workspace_projects';

export function ProjectConsole() {
  const router = useRouter();
  const t = useT('dashboard.projectsConsole');
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);

  const {
    workspacesQuery,
    workspaces,
    selectedWorkspaceId,
    setSelectedWorkspaceId,
  } = useSelectedWorkspace();
  const projectWorkspaceId = useMemo(() => {
    const defaultWorkspace = workspaces.find(
      workspace =>
        workspace.workspace_id === defaultProjectWorkspaceId ||
        workspace.slug === 'projects'
    );
    return defaultWorkspace?.workspace_id ?? selectedWorkspaceId;
  }, [selectedWorkspaceId, workspaces]);
  const projectsQuery = useProjects(projectWorkspaceId);
  const createWorkspace = useCreateWorkspace();
  const createProject = useCreateProject(projectWorkspaceId);
  const isCreating = createProject.isPending || createWorkspace.isPending;

  const projects = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data?.projects]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(current => (current ? current : slugFromProjectName(value)));
  }

  async function resolveProjectWorkspaceId() {
    if (projectWorkspaceId) {
      if (projectWorkspaceId !== selectedWorkspaceId) {
        setSelectedWorkspaceId(projectWorkspaceId);
      }
      return projectWorkspaceId;
    }
    const existingWorkspace =
      workspaces.find(workspace => workspace.slug === 'projects')?.workspace_id ??
      workspaces[0]?.workspace_id;
    if (existingWorkspace) {
      setSelectedWorkspaceId(existingWorkspace);
      return existingWorkspace;
    }
    const response = await createWorkspace.mutateAsync({
      name: 'Projects',
      slug: 'projects',
      description: 'Default project container.',
    });
    setSelectedWorkspaceId(response.workspace.workspace_id);
    return response.workspace.workspace_id;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError('');
    const trimmedName = name.trim();
    const trimmedSlug = slugFromProjectName(slug || name);
    if (!trimmedName || !trimmedSlug) {
      setFormError(t('messages.projectRequired'));
      return;
    }
    if (trimmedSlug.length < minSlugLength) {
      setFormError(t('messages.slugInvalid'));
      return;
    }

    try {
      const workspaceId = await resolveProjectWorkspaceId();
      const response = await createProject.mutateAsync({
        workspace_id: workspaceId,
        name: trimmedName,
        slug: trimmedSlug,
        description: description.trim(),
      });
      setName('');
      setSlug('');
      setDescription('');
      setProjectDialogOpen(false);
      router.push(projectOverviewHref(response.project.id));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setFormError(t('messages.projectUnauthorized'));
        return;
      }
      setFormError(t('messages.projectCreateFailed'));
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-10">
      <header className="flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-4xl font-semibold leading-[1.07] tracking-[-0.01em] text-text-main md:text-[56px]">
            {t('title')}
          </h1>
          <p className="mt-3 max-w-2xl text-[17px] leading-[1.47] tracking-[-0.01em] text-text-subtle">
            {t('description')}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              workspacesQuery.refetch();
              if (projectWorkspaceId) {
                projectsQuery.refetch();
              }
            }}
            disabled={workspacesQuery.isFetching || projectsQuery.isFetching}
          >
            <RefreshCw className="mr-1.5 h-4 w-4" />
            {workspacesQuery.isFetching || projectsQuery.isFetching
              ? t('actions.refreshing')
              : t('actions.refresh')}
          </Button>
          <Dialog open={projectDialogOpen} onOpenChange={setProjectDialogOpen}>
            <DialogTrigger asChild>
              <Button type="button" disabled={isCreating}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('actions.newProject')}
              </Button>
            </DialogTrigger>
            <ProjectDialogContent
              t={t}
              name={name}
              slug={slug}
              description={description}
              formError={formError}
              isPending={isCreating}
              onSubmit={handleSubmit}
              onNameChange={handleNameChange}
              onSlugChange={setSlug}
              onDescriptionChange={setDescription}
            />
          </Dialog>
        </div>
      </header>

      <section className="overflow-hidden rounded-[var(--radius-card)] border border-border-subtle bg-bg-surface">
        {workspacesQuery.isLoading || projectsQuery.isFetching ? (
          <div className="p-8 text-sm text-text-muted">{t('projects.loading')}</div>
        ) : projects.length > 0 ? (
          <div className="divide-y divide-border-subtle">
            {projects.map(project => (
              <ProjectRow key={`${project.id}-${project.slug}`} project={project} t={t} />
            ))}
          </div>
        ) : (
          <div className="flex min-h-[300px] flex-col items-center justify-center gap-4 p-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-[var(--radius-card)] bg-bg-subtle text-text-main">
              <Folder className="h-6 w-6" />
            </div>
            <div>
              <div className="text-sm font-medium text-text-main">
                {t('projects.emptyForWorkspace')}
              </div>
              <p className="mt-1 max-w-md text-sm leading-6 text-text-muted">
                {t('projects.emptyDescription')}
              </p>
            </div>
            <Button
              type="button"
              disabled={isCreating}
              onClick={() => setProjectDialogOpen(true)}
            >
              <Plus className="mr-1.5 h-4 w-4" />
              {t('actions.newProject')}
            </Button>
          </div>
        )}
      </section>
    </main>
  );
}

function ProjectDialogContent({
  t,
  name,
  slug,
  description,
  formError,
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
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
}) {
  return (
    <DialogContent
      size="xl"
      className="min-h-[620px] gap-0 overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-bg-surface p-0 shadow-xl"
    >
      <DialogHeader className="border-b border-border-subtle px-6 py-5 text-left">
        <DialogTitle className="flex items-center gap-2 text-base font-medium text-text-main">
          <span>{t('newProject.title')}</span>
        </DialogTitle>
        <DialogDescription className="sr-only">{t('newProject.description')}</DialogDescription>
      </DialogHeader>
      <DialogBody className="mx-0 flex min-h-0 flex-1 flex-col overflow-hidden px-0">
        <form className="flex min-h-0 flex-1 flex-col" onSubmit={onSubmit}>
          <div className="flex-1 px-6 py-8">
            <div
              className="mb-6 flex h-12 w-12 items-center justify-center rounded-[16px] bg-bg-subtle text-text-main"
              aria-hidden="true"
            >
              <Folder className="h-7 w-7" />
            </div>
            <Input
              aria-label={t('fields.name')}
              value={name}
              onChange={event => onNameChange(event.target.value)}
              placeholder={t('newProject.titlePlaceholder')}
              disabled={isPending}
              className="h-auto border-0 bg-transparent px-0 text-4xl font-bold leading-tight text-text-main shadow-none outline-none placeholder:text-text-muted focus-visible:ring-0"
            />
            <Input
              aria-label={t('fields.slug')}
              value={slug}
              onChange={event => onSlugChange(slugFromProjectName(event.target.value))}
              placeholder="project-slug"
              disabled={isPending}
              minLength={minSlugLength}
              className="mt-1 h-auto border-0 bg-transparent px-0 font-mono text-xs text-text-muted shadow-none outline-none placeholder:text-text-muted/70 focus-visible:ring-0"
            />
            <Textarea
              aria-label={t('fields.description')}
              value={description}
              onChange={event => onDescriptionChange(event.target.value)}
              placeholder={t('newProject.descriptionPlaceholder')}
              rows={8}
              disabled={isPending}
              className="mt-5 min-h-[240px] resize-none border-0 bg-transparent px-0 text-lg leading-8 text-text-main shadow-none outline-none placeholder:text-text-muted focus-visible:ring-0"
            />
            {formError ? (
              <div className="mt-4 rounded-md border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
                {formError}
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-3 border-t border-border-subtle bg-bg-subtle px-6 py-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-wrap gap-2">
              <MetaChip icon={<Circle className="h-3.5 w-3.5 fill-current" />} label={t('newProject.statusPlanned')} />
              <MetaChip icon={<Minus className="h-3.5 w-3.5" />} label={t('newProject.noPriority')} />
              <MetaChip icon={<UserRound className="h-3.5 w-3.5" />} label={t('newProject.ownerLead')} />
              <MetaChip icon={<Github className="h-3.5 w-3.5" />} label={t('newProject.repositories')} />
            </div>
            <Button type="submit" disabled={isPending || !name.trim()}>
              {isPending ? t('actions.creating') : t('actions.createProject')}
            </Button>
          </div>
        </form>
      </DialogBody>
    </DialogContent>
  );
}

function MetaChip({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border-subtle bg-bg-surface px-3 text-sm font-medium text-text-main shadow-none">
      <span className="text-text-muted">{icon}</span>
      {label}
    </span>
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
    <Link
      href={projectOverviewHref(project.id)}
      className="group grid gap-3 p-5 transition-colors hover:bg-bg-subtle/70 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
    >
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[16px] bg-bg-subtle text-text-main">
          <Folder className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-text-main">{project.name}</h2>
            <Badge
              variant="outline"
              className={project.status === 'active' ? 'border-success/25 text-success' : ''}
            >
              {project.status === 'active'
                ? t('projects.status.active')
                : t('projects.status.inactive')}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-muted">
            {project.description || t('projects.noDescription')}
          </p>
          <div className="mt-2 font-mono text-xs text-text-muted">{project.slug}</div>
        </div>
      </div>
      <div className="flex items-center gap-2 text-sm text-text-muted md:opacity-0 md:transition-opacity md:group-hover:opacity-100">
        {t('actions.openProject')}
        <ArrowRight className="h-4 w-4" />
      </div>
    </Link>
  );
}
