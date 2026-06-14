'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, BookMarked, Boxes, Github, Loader2, RefreshCw, Trash2 } from 'lucide-react';

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
} from '@/components/ui/dialog';
import { SourceReferencePanel } from '@/features/deepwiki/components/source-reference-panel';
import { WikiLayout } from '@/features/deepwiki/components/wiki-layout';
import { WikiPageViewer } from '@/features/deepwiki/components/wiki-page-viewer';
import { WikiSearch } from '@/features/deepwiki/components/wiki-search';
import { useDeepWikiPage } from '@/features/deepwiki/hooks/use-deepwiki';
import type {
  DeepWikiPageDTO,
  DeepWikiSourceRefDTO,
} from '@/features/deepwiki/types';
import {
  useDeleteProjectRepositoryDeepWiki,
  useProjectContext,
  useProjectDeepWiki,
  useProjects,
  useReindexProjectRepositoryDeepWiki,
} from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import {
  projectContextHref,
  projectDeepWikiHref,
  projectDeepWikiPageHref,
  projectDeepWikiRepositoryHref,
} from '@/features/project/project-utils';
import type {
  ProjectDTO,
  ProjectDeepWikiPageSummaryDTO,
  ProjectRepositoryDeepWikiDTO,
} from '@/features/project/services/project-service';
import { cn } from '@/utils';

export function DeepWikiProjectEntryPage() {
  const { selectedWorkspaceId, selectedWorkspace, workspacesQuery } = useSelectedWorkspace();
  const projectsQuery = useProjects(selectedWorkspaceId);
  const projects = projectsQuery.data?.projects ?? [];

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 md:px-8">
      <header className="border-b border-border-subtle pb-5">
        <div className="flex items-center gap-2 text-primary">
          <BookMarked className="h-5 w-5" />
          <span className="text-sm font-medium">DeepWiki</span>
        </div>
        <h1 className="mt-3 text-2xl font-semibold tracking-normal text-text-main">
          Project repository wiki
        </h1>
        <p className="mt-2 max-w-3xl text-sm leading-6 text-text-muted">
          DeepWiki is generated from repositories bound to a project. Choose a project to inspect
          the latest repository-scoped wiki.
        </p>
      </header>

      {workspacesQuery.isLoading || projectsQuery.isLoading ? (
        <div className="flex items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-surface p-4 text-sm text-text-muted">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading projects.
        </div>
      ) : selectedWorkspaceId ? (
        <section className="rounded-[4px] border border-border-subtle bg-bg-surface p-5">
          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-base font-medium text-text-main">
                {selectedWorkspace?.name || selectedWorkspaceId}
              </h2>
              <p className="mt-1 text-sm text-text-muted">
                {projects.length} projects in the selected workspace.
              </p>
            </div>
          </div>
          {projects.length > 0 ? (
            <div className="mt-4 divide-y divide-border-subtle rounded-[4px] border border-border-subtle">
              {projects.map(project => (
                <ProjectEntryRow key={project.id} project={project} />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-[4px] border border-dashed border-border-subtle bg-bg-subtle/40 p-4 text-sm text-text-muted">
              No projects are available in this workspace yet.
            </div>
          )}
        </section>
      ) : (
        <div className="rounded-[4px] border border-dashed border-border-subtle bg-bg-surface p-5 text-sm text-text-muted">
          Select or create a workspace before opening DeepWiki.
        </div>
      )}
    </main>
  );
}

export function ProjectDeepWikiConsole() {
  const router = useRouter();
  const params = useParams();
  const projectId = numberParam(params?.projectId);
  const routeRepositoryId = stringParam(params?.repositoryId);
  const routeSlug = stringParam(params?.slug);
  const [selectedRefState, setSelectedRefState] = useState<
    { repositoryId: string; ref: DeepWikiSourceRefDTO } | undefined
  >();
  const [searchState, setSearchState] = useState({ repositoryId: '', query: '' });
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteError, setDeleteError] = useState('');

  const contextQuery = useProjectContext(projectId ?? 0);
  const deepWikiQuery = useProjectDeepWiki(projectId ?? 0);
  const reindexMutation = useReindexProjectRepositoryDeepWiki(projectId ?? 0);
  const deleteMutation = useDeleteProjectRepositoryDeepWiki(projectId ?? 0);
  const context = contextQuery.data?.context;
  const repositories = useMemo(
    () => deepWikiQuery.data?.repositories ?? [],
    [deepWikiQuery.data?.repositories]
  );
  const primaryRepositoryId = context?.primary_repository_id;
  const selectedRepository =
    repositories.find(repository => repository.repository_id === routeRepositoryId) ??
    repositories.find(repository => repository.repository_id === primaryRepositoryId) ??
    repositories[0];
  const selectedIndex = selectedRepository?.index;
  const selectedRepositoryId = selectedRepository?.repository_id ?? '';
  const selectedRef =
    selectedRefState?.repositoryId === selectedRepositoryId ? selectedRefState.ref : undefined;
  const searchQuery = searchState.repositoryId === selectedRepositoryId ? searchState.query : '';
  const pages = useMemo(
    () => (selectedRepository?.pages ?? []).map(projectPageToDeepWikiPage),
    [selectedRepository?.pages]
  );
  const selectedSlug = routeSlug || pages[0]?.slug;
  const pageQuery = useDeepWikiPage(selectedIndex?.id, selectedSlug);
  const generationLabel = deepWikiGenerationLabel(selectedIndex);

  useEffect(() => {
    if (!projectId || routeRepositoryId || !selectedRepository?.repository_id) {
      return;
    }
    router.replace(projectDeepWikiRepositoryHref(projectId, selectedRepository.repository_id));
  }, [projectId, routeRepositoryId, router, selectedRepository?.repository_id]);

  if (!projectId) {
    return (
      <ProjectDeepWikiState
        title="Invalid project"
        description="Open DeepWiki from a valid project."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!context && (contextQuery.isFetching || deepWikiQuery.isFetching)) {
    return <ProjectDeepWikiState title="Loading DeepWiki" description="Reading project bindings." />;
  }

  if (contextQuery.isError || !context) {
    return (
      <ProjectDeepWikiState
        title="Project unavailable"
        description="The project could not be loaded. Confirm backend auth and try again."
        actionHref="/console/projects"
        actionLabel="Back to projects"
      />
    );
  }

  if (!deepWikiQuery.isLoading && repositories.length === 0) {
    return (
      <ProjectDeepWikiState
        title="No repositories bound"
        description="Bind a GitHub App repository to this project. DeepWiki will be generated automatically from the bound repository."
        actionHref={projectContextHref(projectId)}
        actionLabel="Bind repository"
      />
    );
  }

  function selectRepository(repositoryId: string) {
    if (!projectId) {
      return;
    }
    setSelectedRefState(undefined);
    setSearchState({ repositoryId, query: '' });
    setDeleteDialogOpen(false);
    setDeleteError('');
    router.push(projectDeepWikiRepositoryHref(projectId, repositoryId));
  }

  function selectPage(slug: string) {
    if (!projectId || !selectedRepository) {
      return;
    }
    setSelectedRefState(undefined);
    router.push(projectDeepWikiPageHref(projectId, selectedRepository.repository_id, slug));
  }

  function setRepositorySearchQuery(query: string) {
    setSearchState({ repositoryId: selectedRepositoryId, query });
  }

  function selectSourceRef(ref: DeepWikiSourceRefDTO) {
    if (!selectedRepositoryId) {
      return;
    }
    setSelectedRefState({ repositoryId: selectedRepositoryId, ref });
  }

  function reindexRepository() {
    if (!selectedRepository) {
      return;
    }
    setDeleteError('');
    reindexMutation.mutate(selectedRepository.repository_id);
  }

  async function deleteRepositoryWiki() {
    if (!selectedRepository) {
      return;
    }
    setDeleteError('');
    try {
      await deleteMutation.mutateAsync(selectedRepository.repository_id);
      setSelectedRefState(undefined);
      setSearchState({ repositoryId: selectedRepository.repository_id, query: '' });
      setDeleteDialogOpen(false);
    } catch {
      setDeleteError('DeepWiki could not be deleted. Check backend logs and try again.');
    }
  }

  const isIndexing =
    reindexMutation.isPending ||
    Boolean(selectedIndex?.status && selectedIndex.status !== 'ready' && selectedIndex.status !== 'failed') ||
    Boolean(
      selectedRepository?.source?.status &&
        selectedRepository.source.status !== 'ready' &&
        selectedRepository.source.status !== 'failed'
    );

  return (
    <div className="grid h-full min-h-0 bg-bg-canvas text-text-main lg:grid-cols-[320px_minmax(0,1fr)]">
      <aside className="min-h-0 overflow-auto border-r border-border-subtle bg-bg-surface p-4">
        <div className="mb-4 flex items-center gap-2">
          <BookMarked className="size-5 text-primary" />
          <div className="min-w-0">
            <h1 className="truncate text-base font-semibold tracking-normal">DeepWiki</h1>
            <p className="truncate text-xs text-text-muted">{context.project.name}</p>
          </div>
        </div>

        <Button asChild variant="outline" size="sm" className="mb-4 w-full rounded-[4px]">
          <Link href={projectContextHref(projectId)}>Manage repositories</Link>
        </Button>

        <div className="space-y-2">
          <div className="text-xs font-medium uppercase text-text-muted">Repositories</div>
          {deepWikiQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-[4px] border border-border-subtle bg-bg-subtle px-3 py-2 text-sm text-text-muted">
              <Loader2 className="size-4 animate-spin" />
              Loading wiki sources.
            </div>
          ) : (
            repositories.map(repository => (
              <RepositoryWikiItem
                key={repository.repository_id}
                repository={repository}
                active={repository.repository_id === selectedRepository?.repository_id}
                onSelect={() => selectRepository(repository.repository_id)}
              />
            ))
          )}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col">
        <div className="shrink-0 border-b border-border-subtle bg-bg-surface p-4">
          <div className="mb-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold text-text-main">
                {selectedRepository?.repository_id || 'Repository'}
              </div>
              <p className="mt-1 text-xs text-text-muted">
                Generated by LLM from the repository currently bound to this project.
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <Badge variant="outline" className="rounded-[4px] border-primary/30 text-primary">
                  {generationLabel}
                </Badge>
                {selectedIndex?.prompt_version ? <span>{selectedIndex.prompt_version}</span> : null}
                {selectedIndex?.error_message ? (
                  <span className="text-error">{selectedIndex.error_message}</span>
                ) : selectedRepository?.source?.last_error ? (
                  <span className="text-error">{selectedRepository.source.last_error}</span>
                ) : null}
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                loading={reindexMutation.isPending}
                disabled={!selectedRepository || deleteMutation.isPending}
                onClick={reindexRepository}
                icon={<RefreshCw className="h-4 w-4" />}
              >
                Regenerate with LLM
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={!selectedRepository?.source || reindexMutation.isPending || deleteMutation.isPending}
                onClick={() => {
                  setDeleteError('');
                  setDeleteDialogOpen(true);
                }}
                icon={<Trash2 className="h-4 w-4" />}
              >
                Delete DeepWiki
              </Button>
            </div>
          </div>
          <WikiSearch
            indexId={selectedIndex?.id}
            query={searchQuery}
            onQueryChange={setRepositorySearchQuery}
            onSelectPage={selectPage}
            onSelectRef={selectSourceRef}
          />
        </div>

        {selectedRepository ? (
          <WikiLayout
            source={selectedRepository.source}
            index={selectedIndex}
            pages={pages}
            selectedSlug={selectedSlug}
            isIndexing={isIndexing}
            reindexLabel="Regenerate with LLM"
            onSelectPage={selectPage}
            onReindex={reindexRepository}
          >
            {selectedRepository.error ? (
              <ProjectDeepWikiInlineState
                title="DeepWiki generation failed"
                description={selectedRepository.error}
              />
            ) : selectedIndex && pages.length > 0 ? (
              <WikiPageViewer
                page={pageQuery.data}
                isLoading={pageQuery.isLoading || deepWikiQuery.isFetching}
                onSelectRef={selectSourceRef}
              />
            ) : !selectedRepository.source && !selectedIndex ? (
              <ProjectDeepWikiInlineState
                title="No DeepWiki generated"
                description="This repository is still bound to the project. Run Regenerate with LLM to create DeepWiki again."
              />
            ) : (
              <ProjectDeepWikiInlineState
                title="Wiki is being generated"
                description="Repository scanning starts automatically after binding. This page will refresh while the index is running."
              />
            )}
          </WikiLayout>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-text-muted">
            Select a repository to inspect its generated wiki.
          </div>
        )}
      </main>

      <SourceReferencePanel
        indexId={selectedIndex?.id}
        selectedRef={selectedRef}
        open={Boolean(selectedRef)}
        onOpenChange={open => {
          if (!open) {
            setSelectedRefState(undefined);
          }
        }}
      />

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="gap-0 overflow-hidden rounded-[4px] border-border-subtle bg-bg-surface p-0">
          <DialogHeader className="border-b border-border-subtle px-6 py-5 text-left">
            <DialogTitle className="flex items-center gap-2 text-base font-medium text-text-main">
              <Trash2 className="h-4 w-4 text-error" />
              Delete DeepWiki
            </DialogTitle>
            <DialogDescription>
              Delete generated pages, code chunks, and indexes for this repository. The project
              repository binding will stay in place.
            </DialogDescription>
          </DialogHeader>
          <DialogBody className="mx-0 px-6 py-5">
            <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-3">
              <div className="break-all text-sm font-medium text-text-main">
                {selectedRepository?.repository_id}
              </div>
              <div className="mt-1 text-xs text-text-muted">
                {selectedRepository?.pages?.length ?? 0} pages · source #{selectedRepository?.source?.id}
              </div>
            </div>
            {deleteError ? (
              <div className="mt-4 rounded-[4px] border border-error/30 bg-error-subtle p-3 text-sm leading-5 text-error">
                {deleteError}
              </div>
            ) : null}
          </DialogBody>
          <DialogFooter className="border-t border-border-subtle bg-bg-subtle px-6 py-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={deleteMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={deleteRepositoryWiki}
              disabled={!selectedRepository?.source || deleteMutation.isPending}
            >
              {deleteMutation.isPending ? 'Deleting' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectEntryRow({ project }: { project: ProjectDTO }) {
  return (
    <Link
      href={projectDeepWikiHref(project.id)}
      className="flex flex-col gap-3 px-4 py-3 hover:bg-bg-subtle md:flex-row md:items-center md:justify-between"
    >
      <span className="flex min-w-0 items-center gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[4px] bg-primary-subtle text-primary">
          <Boxes className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-text-main">{project.name}</span>
          <span className="mt-0.5 block truncate text-xs text-text-muted">{project.slug}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 text-sm text-primary">
        Open DeepWiki
        <ArrowRight className="h-4 w-4" />
      </span>
    </Link>
  );
}

function RepositoryWikiItem({
  repository,
  active,
  onSelect,
}: {
  repository: ProjectRepositoryDeepWikiDTO;
  active: boolean;
  onSelect: () => void;
}) {
  const status = repository.index?.status || repository.source?.status || 'queued';
  const ready = status === 'ready';
  const generation = deepWikiGenerationLabel(repository.index);

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-start gap-2 rounded-[4px] border border-transparent px-3 py-2 text-left hover:bg-bg-subtle',
        active && 'border-primary/30 bg-primary-subtle'
      )}
      onClick={onSelect}
    >
      <Github className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-main">
          {repository.repository_id}
        </span>
        <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-text-muted">
          <Badge
            variant="outline"
            className={cn(
              'rounded-[4px] px-1.5 py-0 text-[10px]',
              ready ? 'border-success/30 text-success' : 'border-primary/30 text-primary'
            )}
          >
            {status}
          </Badge>
          <span>{repository.role}</span>
          <span>{repository.pages?.length ?? 0} pages</span>
          <span>{generation}</span>
        </span>
      </span>
    </button>
  );
}

function deepWikiGenerationLabel(index?: ProjectRepositoryDeepWikiDTO['index']) {
  if (!index) {
    return 'LLM pending';
  }
  if (index.generation_mode === 'llm') {
    const model = [index.generator_provider, index.generator_model].filter(Boolean).join('/');
    return model ? `LLM generated · ${model}` : 'LLM generated';
  }
  return 'Legacy template';
}

function ProjectDeepWikiState({
  title,
  description,
  actionHref,
  actionLabel,
}: {
  title: string;
  description: string;
  actionHref?: string;
  actionLabel?: string;
}) {
  return (
    <main className="flex min-h-full items-center justify-center bg-bg-canvas px-4 py-10">
      <div className="w-full max-w-xl rounded-[4px] border border-border-subtle bg-bg-surface p-6">
        <div className="flex items-center gap-2 text-primary">
          <BookMarked className="h-5 w-5" />
          <span className="text-sm font-medium">DeepWiki</span>
        </div>
        <h1 className="mt-4 text-xl font-semibold tracking-normal text-text-main">{title}</h1>
        <p className="mt-2 text-sm leading-6 text-text-muted">{description}</p>
        {actionHref && actionLabel ? (
          <Button asChild className="mt-5 rounded-[4px]">
            <Link href={actionHref}>{actionLabel}</Link>
          </Button>
        ) : null}
      </div>
    </main>
  );
}

function ProjectDeepWikiInlineState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="p-6">
      <div className="rounded-[4px] border border-border-subtle bg-bg-subtle p-4">
        <div className="text-sm font-medium text-text-main">{title}</div>
        <p className="mt-1 text-sm leading-6 text-text-muted">{description}</p>
      </div>
    </div>
  );
}

function projectPageToDeepWikiPage(page: ProjectDeepWikiPageSummaryDTO): DeepWikiPageDTO {
  return {
    id: page.id,
    index_id: page.index_id,
    slug: page.slug,
    title: page.title,
    page_type: page.page_type,
    markdown: '',
    source_refs: [],
    order_index: page.order_index,
    status: page.status,
    created_at: page.created_at,
    updated_at: page.updated_at,
  };
}

function numberParam(value: string | string[] | undefined): number | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function stringParam(value: string | string[] | undefined): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) {
    return undefined;
  }
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}
