'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { FormEvent, useMemo, useState } from 'react';
import {
  ArrowRight,
  Folder,
  GitBranch,
  Github,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogClose,
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
  useBindAnyProjectRepository,
  useProjectReadiness,
  useProjects,
  useUpdateProject,
} from '@/features/project/hooks/use-projects';
import {
  projectReadinessBadgeClass,
  projectReadinessDecision,
} from '@/features/project/project-readiness';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import type { ProjectDTO } from '@/features/project/services/project-service';
import { useGitHubRepositories } from '@/features/specforge/hooks/use-specforge';
import type { GitHubRepositoryDTO } from '@/features/specforge/services/specforge-service';
import { cn } from '@/utils';

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
  const [manualProjectOpen, setManualProjectOpen] = useState(false);
  const [repositorySearchQuery, setRepositorySearchQuery] = useState('');
  const [importingRepositoryId, setImportingRepositoryId] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'archived'>('all');
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
  const repositoriesQuery = useGitHubRepositories(
    projectWorkspaceId ? { workspace_id: projectWorkspaceId } : undefined
  );
  const createWorkspace = useCreateWorkspace();
  const createProject = useCreateProject(projectWorkspaceId);
  const bindProjectRepository = useBindAnyProjectRepository();
  const updateProject = useUpdateProject(projectWorkspaceId);
  const deleteProject = useDeleteProject(projectWorkspaceId);
  const isCreating =
    createProject.isPending || createWorkspace.isPending || bindProjectRepository.isPending;
  const isUpdating = updateProject.isPending;
  const isDeleting = deleteProject.isPending;

  const projects = useMemo(() => projectsQuery.data?.projects ?? [], [projectsQuery.data?.projects]);
  const repositories = useMemo(
    () => repositoriesQuery.data?.repositories ?? [],
    [repositoriesQuery.data?.repositories]
  );
  const filteredRepositories = useMemo(() => {
    const normalizedQuery = repositorySearchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return repositories;
    }
    return repositories.filter(repository =>
      [
        repository.github_owner,
        repository.github_repo,
        `${repository.github_owner}/${repository.github_repo}`,
        repository.repository_id,
      ]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(normalizedQuery))
    );
  }, [repositories, repositorySearchQuery]);
  const filteredProjects = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    return projects.filter(project => {
      const statusMatches = statusFilter === 'all' || project.status === statusFilter;
      if (!statusMatches) {
        return false;
      }
      if (!normalizedQuery) {
        return true;
      }
      return [project.name, project.slug, project.description]
        .filter(Boolean)
        .some(value => value.toLowerCase().includes(normalizedQuery));
    });
  }, [projects, searchQuery, statusFilter]);

  function handleNameChange(value: string) {
    setName(value);
    setSlug(current => (current ? current : slugFromProjectName(value)));
  }

  function resetProjectDialogState() {
    setName('');
    setSlug('');
    setDescription('');
    setFormError('');
    setManualProjectOpen(false);
    setRepositorySearchQuery('');
    setImportingRepositoryId('');
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

  async function handleImportRepository(repository: GitHubRepositoryDTO) {
    setFormError('');
    setImportingRepositoryId(repository.repository_id);
    try {
      const workspaceId = await resolveProjectWorkspaceId();
      const projectName = repository.github_repo || `${repository.github_owner} repository`;
      const response = await createProject.mutateAsync({
        workspace_id: workspaceId,
        name: projectName,
        slug: uniqueProjectSlug(projectName, projects),
        description: `${repository.github_owner}/${repository.github_repo}`,
      });
      await bindProjectRepository.mutateAsync({
        projectId: response.project.id,
        payload: {
          repository_id: repository.repository_id,
          role: 'primary',
        },
      });
      resetProjectDialogState();
      setProjectDialogOpen(false);
      router.push(projectOverviewHref(response.project.id));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setFormError(t('messages.projectUnauthorized'));
        return;
      }
      setFormError(t('messages.projectCreateFailed'));
    } finally {
      setImportingRepositoryId('');
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
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-4 border-b border-border-subtle pb-5 md:flex-row md:items-end md:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold leading-tight tracking-tight text-text-main">
            {t('title')}
          </h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            {t('description')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              workspacesQuery.refetch();
              if (projectWorkspaceId) {
                projectsQuery.refetch();
              }
            }}
            disabled={workspacesQuery.isFetching || projectsQuery.isFetching}
          >
            <RefreshCw className="h-4 w-4" />
            {workspacesQuery.isFetching || projectsQuery.isFetching
              ? t('actions.refreshing')
              : t('actions.refresh')}
          </Button>
          <Dialog
            open={projectDialogOpen}
            onOpenChange={open => {
              setProjectDialogOpen(open);
              if (!open) {
                resetProjectDialogState();
              }
            }}
          >
            <DialogTrigger asChild>
              <Button type="button" size="sm" disabled={isCreating}>
                <Plus className="mr-1.5 h-4 w-4" />
                {t('actions.newProject')}
              </Button>
            </DialogTrigger>
            <ProjectDialogContent
              t={t}
              commonT={commonT}
              name={name}
              slug={slug}
              description={description}
              formError={formError}
              isPending={isCreating}
              manualProjectOpen={manualProjectOpen}
              repositories={filteredRepositories}
              totalRepositoryCount={repositories.length}
              repositoriesLoading={repositoriesQuery.isLoading || repositoriesQuery.isFetching}
              repositorySearchQuery={repositorySearchQuery}
              importingRepositoryId={importingRepositoryId}
              onSubmit={handleSubmit}
              onNameChange={handleNameChange}
              onDescriptionChange={setDescription}
              onRepositorySearchChange={setRepositorySearchQuery}
              onImportRepository={handleImportRepository}
              onRefreshRepositories={() => repositoriesQuery.refetch()}
              onToggleManualProject={() => setManualProjectOpen(open => !open)}
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

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={searchQuery}
              onChange={event => setSearchQuery(event.target.value)}
              placeholder={t('projects.searchPlaceholder')}
              className="h-9 rounded-[4px] pl-9"
              aria-label={t('projects.searchPlaceholder')}
            />
          </div>
          <div className="flex items-center gap-2">
            <Select
              value={statusFilter}
              onValueChange={value => setStatusFilter(value as 'all' | 'active' | 'archived')}
            >
              <SelectTrigger className="h-9 w-[150px] rounded-[4px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t('projects.filters.all')}</SelectItem>
                <SelectItem value="active">{t('projects.status.active')}</SelectItem>
                <SelectItem value="archived">{crudText.archived}</SelectItem>
              </SelectContent>
            </Select>
            <div className="hidden text-sm text-text-muted sm:block">
              {t('projects.count', { count: filteredProjects.length })}
            </div>
          </div>
        </div>

        <div>
        {workspacesQuery.isLoading || projectsQuery.isFetching ? (
          <div className="rounded-[4px] border border-border-subtle bg-bg-surface px-4 py-8 text-sm text-text-muted">
            {t('projects.loading')}
          </div>
        ) : projects.length > 0 && filteredProjects.length > 0 ? (
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjects.map(project => (
              <ProjectCard
                key={`${project.id}-${project.slug}`}
                project={project}
                t={t}
                commonT={commonT}
                labels={crudText}
                locale={locale}
                onEdit={openEditProject}
                onDelete={openDeleteProject}
              />
            ))}
          </div>
        ) : projects.length > 0 ? (
          <div className="flex min-h-[220px] flex-col items-center justify-center gap-3 rounded-[4px] border border-border-subtle bg-bg-surface px-6 py-12 text-center">
            <div className="text-sm font-medium text-text-main">
              {t('projects.emptySearchTitle')}
            </div>
            <p className="max-w-sm text-sm leading-6 text-text-muted">
              {t('projects.emptySearchDescription')}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
            >
              {t('projects.clearFilters')}
            </Button>
          </div>
        ) : (
          <div className="flex min-h-[260px] flex-col items-center justify-center gap-4 rounded-[4px] border border-border-subtle bg-bg-surface px-6 py-12 text-center">
            <div className="flex h-11 w-11 items-center justify-center rounded-[4px] border border-border-subtle bg-bg-subtle text-text-main">
              <Folder className="h-5 w-5" />
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
        </div>
      </section>
    </main>
  );
}

function ProjectDialogContent({
  t,
  commonT,
  name,
  slug,
  description,
  formError,
  isPending,
  manualProjectOpen,
  repositories,
  totalRepositoryCount,
  repositoriesLoading,
  repositorySearchQuery,
  importingRepositoryId,
  onSubmit,
  onNameChange,
  onDescriptionChange,
  onRepositorySearchChange,
  onImportRepository,
  onRefreshRepositories,
  onToggleManualProject,
}: {
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  commonT: (key: string, values?: Record<string, string | number | Date>) => string;
  name: string;
  slug: string;
  description: string;
  formError: string;
  isPending: boolean;
  manualProjectOpen: boolean;
  repositories: GitHubRepositoryDTO[];
  totalRepositoryCount: number;
  repositoriesLoading: boolean;
  repositorySearchQuery: string;
  importingRepositoryId: string;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  onNameChange: (value: string) => void;
  onDescriptionChange: (value: string) => void;
  onRepositorySearchChange: (value: string) => void;
  onImportRepository: (repository: GitHubRepositoryDTO) => void;
  onRefreshRepositories: () => void;
  onToggleManualProject: () => void;
}) {
  return (
    <DialogContent
      size="lg"
      className="max-w-[760px] gap-0 overflow-hidden rounded-[4px] border-border-subtle bg-bg-surface p-0 shadow-xl"
    >
      <DialogHeader className="border-b border-border-subtle px-5 py-4 text-left">
        <DialogTitle className="flex items-center gap-2 text-base font-medium text-text-main">
          <Github className="h-4 w-4 text-text-muted" />
          <span>{t('newProject.title')}</span>
        </DialogTitle>
        <DialogDescription className="text-xs leading-5">
          {t('newProject.description')}
        </DialogDescription>
      </DialogHeader>
      <DialogBody className="mx-0 px-5 py-4">
        <section className="grid gap-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="text-sm font-medium text-text-main">{t('newProject.importTitle')}</h3>
              <p className="mt-1 text-xs text-text-muted">
                {t('newProject.importDescription', { count: totalRepositoryCount })}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 rounded-[4px]"
              onClick={onRefreshRepositories}
              disabled={repositoriesLoading || isPending}
            >
              <RefreshCw className={cn('h-4 w-4', repositoriesLoading ? 'animate-spin' : '')} />
              {t('actions.refresh')}
            </Button>
          </div>

          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
            <Input
              value={repositorySearchQuery}
              onChange={event => onRepositorySearchChange(event.target.value)}
              placeholder={t('newProject.repositorySearchPlaceholder')}
              className="h-9 rounded-[4px] pl-9"
              aria-label={t('newProject.repositorySearchPlaceholder')}
              autoFocus
            />
          </div>

          <div className="max-h-[320px] overflow-y-auto rounded-[4px] border border-border-subtle bg-bg-surface">
            {repositoriesLoading ? (
              <div className="flex items-center gap-2 px-4 py-8 text-sm text-text-muted">
                <Loader2 className="h-4 w-4 animate-spin" />
                {t('newProject.repositoriesLoading')}
              </div>
            ) : repositories.length > 0 ? (
              repositories.map(repository => (
                <RepositoryImportRow
                  key={repository.repository_id}
                  repository={repository}
                  t={t}
                  disabled={isPending}
                  isImporting={importingRepositoryId === repository.repository_id}
                  onImport={() => onImportRepository(repository)}
                />
              ))
            ) : totalRepositoryCount > 0 ? (
              <div className="px-4 py-8 text-center">
                <div className="text-sm font-medium text-text-main">
                  {t('newProject.noRepositoryMatchesTitle')}
                </div>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  {t('newProject.noRepositoryMatchesDescription')}
                </p>
              </div>
            ) : (
              <div className="px-4 py-8 text-center">
                <div className="mx-auto flex h-9 w-9 items-center justify-center rounded-[4px] border border-border-subtle bg-bg-subtle text-text-main">
                  <Github className="h-4 w-4" />
                </div>
                <div className="mt-3 text-sm font-medium text-text-main">
                  {t('newProject.emptyRepositoriesTitle')}
                </div>
                <p className="mx-auto mt-1 max-w-sm text-xs leading-5 text-text-muted">
                  {t('newProject.emptyRepositoriesDescription')}
                </p>
                <Button type="button" size="sm" className="mt-4 rounded-[4px]" asChild>
                  <Link href="/console/settings?tab=github&return_to=%2Fconsole%2Fprojects">
                    {t('newProject.manageGitHub')}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
              </div>
            )}
          </div>
        </section>

        <section className="mt-4 border-t border-border-subtle pt-4">
          <button
            type="button"
            className="flex w-full items-center justify-between rounded-[4px] px-1 py-1 text-left text-sm font-medium text-text-main hover:text-brand"
            onClick={onToggleManualProject}
          >
            <span>{t('newProject.blankProjectToggle')}</span>
            <ArrowRight
              className={cn(
                'h-4 w-4 text-text-muted transition-transform',
                manualProjectOpen ? 'rotate-90' : ''
              )}
            />
          </button>
          {manualProjectOpen ? (
            <form id="create-blank-project-form" onSubmit={onSubmit} className="mt-3 grid gap-3">
              <label className="grid gap-2">
                <span className="text-xs font-medium text-text-main">{t('fields.name')}</span>
                <Input
                  aria-label={t('fields.name')}
                  value={name}
                  onChange={event => onNameChange(event.target.value)}
                  placeholder={t('newProject.titlePlaceholder')}
                  disabled={isPending}
                  className="h-9 rounded-[4px]"
                />
              </label>
              <label className="grid gap-2">
                <span className="text-xs font-medium text-text-main">{t('fields.description')}</span>
                <Textarea
                  aria-label={t('fields.description')}
                  value={description}
                  onChange={event => onDescriptionChange(event.target.value)}
                  placeholder={t('newProject.descriptionPlaceholder')}
                  rows={2}
                  disabled={isPending}
                  className="resize-none rounded-[4px]"
                />
              </label>
              <div className="rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-2 text-xs leading-5 text-text-muted">
                {slug ? t('newProject.slugPreview', { slug }) : t('newProject.slugPending')}
              </div>
            </form>
          ) : null}
        </section>

        {formError ? (
          <div className="mt-4 rounded-[4px] border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
            {formError}
          </div>
        ) : null}
      </DialogBody>
      <DialogFooter className="border-t border-border-subtle bg-bg-subtle px-5 py-3">
        <Button type="button" variant="outline" asChild>
          <Link href="/console/settings?tab=github&return_to=%2Fconsole%2Fprojects">
            {t('newProject.manageGitHub')}
          </Link>
        </Button>
        {manualProjectOpen ? (
          <Button
            type="submit"
            form="create-blank-project-form"
            disabled={isPending || !name.trim()}
          >
            {isPending ? t('actions.creating') : t('newProject.createBlankProject')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        ) : (
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              {commonT('cancel')}
            </Button>
          </DialogClose>
        )}
      </DialogFooter>
    </DialogContent>
  );
}

function RepositoryImportRow({
  repository,
  t,
  disabled,
  isImporting,
  onImport,
}: {
  repository: GitHubRepositoryDTO;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  disabled: boolean;
  isImporting: boolean;
  onImport: () => void;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-border-subtle px-4 py-3 last:border-b-0">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle bg-bg-subtle text-text-main">
        <Github className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="truncate text-sm font-medium text-text-main">
            {repository.github_owner}/{repository.github_repo}
          </span>
          <Badge variant="outline" className="h-5 rounded-[4px] px-1.5 text-[11px]">
            {repository.is_private ? t('newProject.privateRepo') : t('newProject.publicRepo')}
          </Badge>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs text-text-muted">
          <GitBranch className="h-3.5 w-3.5" />
          <span className="font-mono">{repository.default_branch}</span>
        </div>
      </div>
      <Button
        type="button"
        size="sm"
        className="h-8 rounded-[4px]"
        disabled={disabled}
        onClick={onImport}
      >
        {isImporting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        {isImporting ? t('newProject.importing') : t('newProject.import')}
      </Button>
    </div>
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
      size="default"
      className="max-w-[520px] gap-0 overflow-hidden rounded-[4px] border-border-subtle bg-bg-surface p-0 shadow-xl"
    >
      <DialogHeader className="border-b border-border-subtle px-5 py-4 text-left">
        <DialogTitle className="flex items-center gap-2 text-base font-medium text-text-main">
          <Pencil className="h-4 w-4 text-text-muted" />
          <span>{labels.editTitle}</span>
        </DialogTitle>
        <DialogDescription className="text-xs leading-5">{labels.editDescription}</DialogDescription>
      </DialogHeader>
      <form onSubmit={onSubmit}>
        <DialogBody className="mx-0 px-5 py-4">
          <div className="grid gap-3">
            <label className="grid gap-2">
              <span className="text-sm font-medium text-text-main">{t('fields.name')}</span>
              <Input
                value={name}
                onChange={event => onNameChange(event.target.value)}
                disabled={isPending}
                placeholder={t('newProject.titlePlaceholder')}
              />
            </label>
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_140px]">
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
            </div>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-text-main">{t('fields.description')}</span>
              <Textarea
                value={description}
                onChange={event => onDescriptionChange(event.target.value)}
                placeholder={t('newProject.descriptionPlaceholder')}
                rows={3}
                disabled={isPending}
                className="resize-none"
              />
            </label>
            {formError ? (
              <div className="rounded-md border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
                {formError}
              </div>
            ) : null}
          </div>
        </DialogBody>
        <DialogFooter className="border-t border-border-subtle bg-bg-subtle px-5 py-3">
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

function ProjectCard({
  project,
  t,
  commonT,
  labels,
  locale,
  onEdit,
  onDelete,
}: {
  project: ProjectDTO;
  t: (key: string, values?: Record<string, string | number | Date>) => string;
  commonT: (key: string, values?: Record<string, string | number | Date>) => string;
  labels: ProjectCrudLabels;
  locale: string;
  onEdit: (project: ProjectDTO) => void;
  onDelete: (project: ProjectDTO) => void;
}) {
  const readinessQuery = useProjectReadiness(project.id);
  const readiness = readinessQuery.data?.readiness;
  const decision = projectReadinessDecision(project.id, readiness);
  const isArchived = project.status === 'archived';
  const readinessLabel = isArchived
    ? labels.archived
    : readinessQuery.isLoading
      ? t('projects.readiness.checking')
      : localizedProjectReadiness(readiness?.readiness_status, t);
  const nextActionHref = isArchived
    ? projectOverviewHref(project.id)
    : resolveProjectListActionHref(project.id, decision.actionLabel, decision.actionHref);
  const nextActionLabel = isArchived ? t('actions.openProject') : localizeProjectAction(decision.actionLabel, t);
  const repositoryLabel = readiness?.primary_repository_id || t('projects.primaryRepoRequired');

  return (
    <article className="group flex min-h-[214px] flex-col rounded-[4px] border border-border-subtle bg-bg-surface p-4 transition-colors hover:bg-bg-subtle/40">
      <div className="flex items-start justify-between gap-3">
        <Link href={projectOverviewHref(project.id)} className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[4px] border border-border-subtle bg-bg-subtle text-text-main">
              <Folder className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-medium text-text-main">{project.name}</h2>
              <div className="mt-1 truncate font-mono text-xs text-text-muted">/{project.slug}</div>
            </div>
          </div>
        </Link>
        <Badge
          variant="outline"
          className={
            isArchived
              ? 'shrink-0 border-border-subtle text-text-muted'
              : `shrink-0 ${projectReadinessBadgeClass(readiness?.readiness_status)}`
          }
        >
          {readinessLabel}
        </Badge>
      </div>

      <div className="mt-4 grid gap-2 text-xs leading-5 text-text-muted">
        <div className="flex items-center justify-between gap-3">
          <span>{t('projects.columns.repository')}</span>
          <span className="min-w-0 truncate font-mono text-text-main">{repositoryLabel}</span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span>{t('projects.columns.updated')}</span>
          <span className="text-text-main">{new Date(project.updated_at).toLocaleDateString(locale)}</span>
        </div>
      </div>

      {project.description ? (
        <p className="mt-3 line-clamp-2 text-xs leading-5 text-text-muted">{project.description}</p>
      ) : (
        <p className="mt-3 text-xs leading-5 text-text-muted">{t('projects.noDescription')}</p>
      )}

      <div className="mt-auto flex items-center justify-between gap-2 pt-4">
        <Button type="button" variant="outline" size="sm" asChild>
          <Link href={nextActionHref}>
            {nextActionLabel}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={commonT('edit')}
            className="h-8 w-8 p-0"
            onClick={() => onEdit(project)}
          >
            <Pencil className="h-4 w-4" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={commonT('delete')}
            className="h-8 w-8 p-0 text-error hover:text-error"
            onClick={() => onDelete(project)}
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </article>
  );
}

function localizedProjectReadiness(
  status: string | undefined,
  t: (key: string, values?: Record<string, string | number | Date>) => string
) {
  switch (status) {
    case 'ready':
      return t('projects.readiness.ready');
    case 'blocked':
      return t('projects.readiness.blocked');
    case 'attention':
      return t('projects.readiness.attention');
    default:
      return t('projects.readiness.setup');
  }
}

function localizeProjectAction(
  actionLabel: string,
  t: (key: string, values?: Record<string, string | number | Date>) => string
) {
  switch (actionLabel) {
    case 'Create requirement':
      return t('projects.nextActions.createRequirement');
    case 'Select repository':
      return t('projects.nextActions.bindRepository');
    case 'Open GitHub connection':
      return t('projects.nextActions.bindRepository');
    case 'Review context':
      return t('projects.nextActions.reviewContext');
    case 'Bind runtime':
      return t('projects.nextActions.bindRuntime');
    case 'Open context':
      return t('projects.nextActions.openContext');
    default:
      return actionLabel;
  }
}

function resolveProjectListActionHref(projectId: number, actionLabel: string, actionHref: string) {
  if (actionLabel === 'Open GitHub connection') {
    return `${projectOverviewHref(projectId)}#repository-binding`;
  }
  if (actionHref.startsWith('#')) {
    return `${projectOverviewHref(projectId)}${actionHref}`;
  }
  return actionHref;
}

function uniqueProjectSlug(projectName: string, projects: ProjectDTO[]) {
  const baseSlug = slugFromProjectName(projectName) || 'project';
  const existingSlugs = new Set(projects.map(project => project.slug));
  if (!existingSlugs.has(baseSlug) && baseSlug.length >= minSlugLength) {
    return baseSlug;
  }
  let suffix = 2;
  while (existingSlugs.has(`${baseSlug}-${suffix}`)) {
    suffix += 1;
  }
  return `${baseSlug}-${suffix}`;
}
