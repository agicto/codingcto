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
  Pencil,
  Plus,
  RefreshCw,
  Trash2,
  UserRound,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { ApiError } from '@/http/request';
import { useLocale } from '@/hooks/use-locale';
import { useT } from '@/i18n';
import {
  projectOverviewHref,
  slugFromProjectName,
} from '@/features/project/project-utils';
import {
  useCreateProject,
  useCreateWorkspace,
  useDeleteProject,
  useProjects,
  useUpdateProject,
} from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import type { ProjectDTO } from '@/features/project/services/project-service';

const minSlugLength = 2;
const defaultProjectWorkspaceId = 'workspace_projects';

const projectCrudText = {
  'zh-Hans': {
    editTitle: '编辑项目',
    editDescription: '更新会用于计划、仓库上下文和交付流程中的项目边界。',
    deleteTitle: '删除项目',
    deleteDescription: '删除 {name} 并移除它的仓库绑定。此操作不可撤销。',
    status: '状态',
    archived: '已归档',
    updating: '保存中',
    deleting: '删除中',
    updateFailed: '项目更新失败。请检查 API 连接和标识是否唯一。',
    deleteFailed: '项目删除失败。请检查 API 连接后重试。',
  },
  'en-US': {
    editTitle: 'Edit project',
    editDescription:
      'Update the project boundary shown across planning, repository context, and delivery flows.',
    deleteTitle: 'Delete project',
    deleteDescription: 'Delete {name} and remove its repository bindings. This cannot be undone.',
    status: 'Status',
    archived: 'Archived',
    updating: 'Updating',
    deleting: 'Deleting',
    updateFailed: 'Project could not be updated. Check the API connection and slug uniqueness.',
    deleteFailed: 'Project could not be deleted. Check the API connection and try again.',
  },
} as const;

type ProjectCrudLabels = (typeof projectCrudText)[keyof typeof projectCrudText];

export function ProjectConsole() {
  const router = useRouter();
  const t = useT('dashboard.projectsConsole');
  const commonT = useT('common');
  const { locale } = useLocale();
  const crudText = projectCrudText[locale] ?? projectCrudText['zh-Hans'];
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');
  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectDTO | null>(null);
  const [editName, setEditName] = useState('');
  const [editSlug, setEditSlug] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<'active' | 'archived'>('active');
  const [editError, setEditError] = useState('');
  const [deleteProjectTarget, setDeleteProjectTarget] = useState<ProjectDTO | null>(null);
  const [deleteError, setDeleteError] = useState('');

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
  const updateProject = useUpdateProject(projectWorkspaceId);
  const deleteProject = useDeleteProject(projectWorkspaceId);
  const isCreating = createProject.isPending || createWorkspace.isPending;
  const isUpdating = updateProject.isPending;
  const isDeleting = deleteProject.isPending;

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

  function openEditProject(project: ProjectDTO) {
    setEditingProject(project);
    setEditName(project.name);
    setEditSlug(project.slug);
    setEditDescription(project.description ?? '');
    setEditStatus(project.status === 'archived' ? 'archived' : 'active');
    setEditError('');
  }

  function closeEditProject() {
    if (isUpdating) {
      return;
    }
    setEditingProject(null);
    setEditError('');
  }

  async function handleEditSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingProject) {
      return;
    }
    setEditError('');
    const trimmedName = editName.trim();
    const trimmedSlug = slugFromProjectName(editSlug || editName);
    if (!trimmedName || !trimmedSlug) {
      setEditError(t('messages.projectRequired'));
      return;
    }
    if (trimmedSlug.length < minSlugLength) {
      setEditError(t('messages.slugInvalid'));
      return;
    }

    try {
      await updateProject.mutateAsync({
        projectId: editingProject.id,
        payload: {
          name: trimmedName,
          slug: trimmedSlug,
          description: editDescription.trim(),
          status: editStatus,
        },
      });
      setEditingProject(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setEditError(t('messages.projectUnauthorized'));
        return;
      }
      setEditError(crudText.updateFailed);
    }
  }

  function openDeleteProject(project: ProjectDTO) {
    setDeleteProjectTarget(project);
    setDeleteError('');
  }

  function closeDeleteProject() {
    if (isDeleting) {
      return;
    }
    setDeleteProjectTarget(null);
    setDeleteError('');
  }

  async function handleDeleteProject() {
    if (!deleteProjectTarget) {
      return;
    }
    setDeleteError('');
    try {
      await deleteProject.mutateAsync(deleteProjectTarget.id);
      setDeleteProjectTarget(null);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setDeleteError(t('messages.projectUnauthorized'));
        return;
      }
      setDeleteError(crudText.deleteFailed);
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
          <Dialog open={Boolean(editingProject)} onOpenChange={open => {
            if (!open) {
              closeEditProject();
            }
          }}>
            <EditProjectDialogContent
              t={t}
              commonT={commonT}
              labels={crudText}
              name={editName}
              slug={editSlug}
              description={editDescription}
              status={editStatus}
              formError={editError}
              isPending={isUpdating}
              onSubmit={handleEditSubmit}
              onCancel={closeEditProject}
              onNameChange={value => {
                setEditName(value);
                setEditSlug(current => (current ? current : slugFromProjectName(value)));
              }}
              onSlugChange={setEditSlug}
              onDescriptionChange={setEditDescription}
              onStatusChange={setEditStatus}
            />
          </Dialog>
          <Dialog open={Boolean(deleteProjectTarget)} onOpenChange={open => {
            if (!open) {
              closeDeleteProject();
            }
          }}>
            <DeleteProjectDialogContent
              commonT={commonT}
              labels={crudText}
              project={deleteProjectTarget}
              formError={deleteError}
              isPending={isDeleting}
              onCancel={closeDeleteProject}
              onConfirm={handleDeleteProject}
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
              <ProjectRow
                key={`${project.id}-${project.slug}`}
                project={project}
                t={t}
                commonT={commonT}
                labels={crudText}
                onEdit={openEditProject}
                onDelete={openDeleteProject}
              />
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

function EditProjectDialogContent({
  t,
  commonT,
  labels,
  name,
  slug,
  description,
  status,
  formError,
  isPending,
  onSubmit,
  onCancel,
  onNameChange,
  onSlugChange,
  onDescriptionChange,
  onStatusChange,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  commonT: (key: string, values?: Record<string, string | number | Date>) => string;
  labels: ProjectCrudLabels;
  name: string;
  slug: string;
  description: string;
  status: 'active' | 'archived';
  formError: string;
  isPending: boolean;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
  onNameChange: (value: string) => void;
  onSlugChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onStatusChange: (value: 'active' | 'archived') => void;
}) {
  return (
    <DialogContent
      size="lg"
      className="gap-0 overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-bg-surface p-0 shadow-xl"
    >
      <DialogHeader className="border-b border-border-subtle px-6 py-5 text-left">
        <DialogTitle className="flex items-center gap-2 text-base font-medium text-text-main">
          <Pencil className="h-4 w-4 text-text-muted" />
          <span>{labels.editTitle}</span>
        </DialogTitle>
        <DialogDescription>{labels.editDescription}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit}>
        <DialogBody className="mx-0 px-6 py-6">
          <div className="grid gap-4">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-text-main">{t('fields.name')}</span>
              <Input
                value={name}
                onChange={event => onNameChange(event.target.value)}
                disabled={isPending}
                placeholder={t('newProject.titlePlaceholder')}
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-text-main">{t('fields.slug')}</span>
              <Input
                value={slug}
                onChange={event => onSlugChange(slugFromProjectName(event.target.value))}
                disabled={isPending}
                minLength={minSlugLength}
                placeholder="project-slug"
                className="font-mono text-sm"
              />
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-text-main">{labels.status}</span>
              <Select
                value={status}
                onValueChange={value => onStatusChange(value as 'active' | 'archived')}
                disabled={isPending}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">{t('projects.status.active')}</SelectItem>
                  <SelectItem value="archived">{labels.archived}</SelectItem>
                </SelectContent>
              </Select>
            </label>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-text-main">{t('fields.description')}</span>
              <Textarea
                value={description}
                onChange={event => onDescriptionChange(event.target.value)}
                placeholder={t('newProject.descriptionPlaceholder')}
                rows={6}
                disabled={isPending}
              />
            </label>
            {formError ? (
              <div className="rounded-md border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
                {formError}
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter className="border-t border-border-subtle bg-bg-subtle px-6 py-4">
          <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
            {commonT('cancel')}
          </Button>
          <Button type="submit" disabled={isPending || !name.trim()}>
            {isPending ? labels.updating : commonT('save')}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function DeleteProjectDialogContent({
  commonT,
  labels,
  project,
  formError,
  isPending,
  onCancel,
  onConfirm,
}: {
  commonT: (key: string, values?: Record<string, string | number | Date>) => string;
  labels: ProjectCrudLabels;
  project: ProjectDTO | null;
  formError: string;
  isPending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <DialogContent
      size="default"
      className="gap-0 overflow-hidden rounded-[var(--radius-card)] border-border-subtle bg-bg-surface p-0 shadow-xl"
    >
      <DialogHeader className="border-b border-border-subtle px-6 py-5 text-left">
        <DialogTitle className="flex items-center gap-2 text-base font-medium text-text-main">
          <Trash2 className="h-4 w-4 text-error" />
          <span>{labels.deleteTitle}</span>
        </DialogTitle>
        <DialogDescription>
          {labels.deleteDescription.replace('{name}', project?.name ?? '')}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mx-0 px-6 py-5">
        <div className="rounded-md border border-border-subtle bg-bg-subtle p-3">
          <div className="text-sm font-medium text-text-main">{project?.name}</div>
          <div className="mt-1 font-mono text-xs text-text-muted">{project?.slug}</div>
        </div>
        {formError ? (
          <div className="mt-4 rounded-md border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
            {formError}
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter className="border-t border-border-subtle bg-bg-subtle px-6 py-4">
        <Button type="button" variant="outline" onClick={onCancel} disabled={isPending}>
          {commonT('cancel')}
        </Button>
        <Button type="button" variant="destructive" onClick={onConfirm} disabled={isPending}>
          {isPending ? labels.deleting : commonT('delete')}
        </Button>
      </DialogFooter>
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
  commonT,
  labels,
  onEdit,
  onDelete,
}: {
  project: ProjectDTO;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  commonT: (key: string, values?: Record<string, string | number | Date>) => string;
  labels: ProjectCrudLabels;
  onEdit: (project: ProjectDTO) => void;
  onDelete: (project: ProjectDTO) => void;
}) {
  return (
    <div className="group grid gap-3 p-5 transition-colors hover:bg-bg-subtle/70 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
      <Link href={projectOverviewHref(project.id)} className="flex min-w-0 items-start gap-3">
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
                : labels.archived}
            </Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-6 text-text-muted">
            {project.description || t('projects.noDescription')}
          </p>
          <div className="mt-2 font-mono text-xs text-text-muted">{project.slug}</div>
        </div>
      </Link>
      <div className="flex flex-wrap items-center gap-2 md:justify-end md:opacity-0 md:transition-opacity md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={projectOverviewHref(project.id)}>
            {t('actions.openProject')}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => onEdit(project)}>
          <Pencil className="h-4 w-4" />
          {commonT('edit')}
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-error hover:text-error"
          onClick={() => onDelete(project)}
        >
          <Trash2 className="h-4 w-4" />
          {commonT('delete')}
        </Button>
      </div>
    </div>
  );
}
