'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { BookMarked, Github, HardDrive, Loader2 } from 'lucide-react';

import { SourceForm } from '@/features/deepwiki/components/source-form';
import { SourceReferencePanel } from '@/features/deepwiki/components/source-reference-panel';
import { WikiLayout } from '@/features/deepwiki/components/wiki-layout';
import { WikiPageViewer } from '@/features/deepwiki/components/wiki-page-viewer';
import { WikiSearch } from '@/features/deepwiki/components/wiki-search';
import {
  useCreateDeepWikiSource,
  useDeepWikiLatestIndex,
  useDeepWikiPage,
  useDeepWikiPages,
  useDeepWikiSource,
  useDeepWikiSources,
  useIndexDeepWikiSource,
} from '@/features/deepwiki/hooks/use-deepwiki';
import type {
  CreateDeepWikiSourcePayload,
  DeepWikiSourceDTO,
  DeepWikiSourceRefDTO,
} from '@/features/deepwiki/types';
import { cn } from '@/utils';
import { useT } from '@/i18n';

/**
 * @component DeepWikiConsole
 * @category Feature
 * @status Beta
 * @description Main DeepWiki console for indexing repositories and reading generated wiki pages.
 * @usage Render from /console/deepwiki routes.
 * @example
 * <DeepWikiConsole />
 */
export function DeepWikiConsole() {
  const router = useRouter();
  const params = useParams();
  const t = useT('dashboard.deepwiki.console');
  const statusT = useT('dashboard.deepwiki.status');
  const routeSourceId = numberParam(params?.sourceId);
  const routeSlug = stringParam(params?.slug);

  const [manualSourceId, setManualSourceId] = useState<number | undefined>();
  const [manualSlug, setManualSlug] = useState<string | undefined>();
  const [selectedRef, setSelectedRef] = useState<DeepWikiSourceRefDTO | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  const sourcesQuery = useDeepWikiSources();
  const sources = useMemo(() => sourcesQuery.data ?? [], [sourcesQuery.data]);
  const selectedSourceId = manualSourceId ?? routeSourceId ?? sources[0]?.id;
  const sourceQuery = useDeepWikiSource(selectedSourceId);
  const selectedSource =
    sourceQuery.data ?? sources.find(source => source.id === selectedSourceId);
  const indexQuery = useDeepWikiLatestIndex(selectedSourceId);
  const latestIndex = indexQuery.data;
  const pagesQuery = useDeepWikiPages(latestIndex?.id);
  const pages = useMemo(() => pagesQuery.data ?? [], [pagesQuery.data]);
  const selectedSlug = manualSlug ?? routeSlug;
  const pageSlug = selectedSlug || pages[0]?.slug;
  const pageQuery = useDeepWikiPage(latestIndex?.id, pageSlug);
  const createSource = useCreateDeepWikiSource();
  const indexSource = useIndexDeepWikiSource(selectedSourceId);

  async function createAndIndex(payload: CreateDeepWikiSourcePayload, autoIndex: boolean) {
    const created = await createSource.mutateAsync(payload);
    setManualSourceId(created.id);
    setManualSlug(undefined);
    setSelectedRef(undefined);
    router.push(`/console/deepwiki/${created.id}`);
    if (autoIndex) {
      await indexSource.mutateAsync({
        sourceId: created.id,
        payload: payload.pat ? { pat: payload.pat } : {},
      });
    }
  }

  function selectSource(sourceId: number) {
    setManualSourceId(sourceId);
    setManualSlug(undefined);
    setSelectedRef(undefined);
    setSearchQuery('');
    router.push(`/console/deepwiki/${sourceId}`);
  }

  function selectPage(slug: string) {
    setManualSlug(slug);
    setSelectedRef(undefined);
    if (selectedSourceId) {
      router.push(`/console/deepwiki/${selectedSourceId}/pages/${slug}`);
    }
  }

  function reindex() {
    if (!selectedSourceId) {
      return;
    }
    indexSource.mutate({ sourceId: selectedSourceId, payload: {} });
  }

  return (
    <div className="grid h-full min-h-0 bg-bg-canvas text-text-main lg:grid-cols-[320px_minmax(0,1fr)_360px]">
      <aside className="min-h-0 overflow-auto border-r border-border-subtle bg-bg-surface p-4">
        <div className="mb-4 flex items-center gap-2">
          <BookMarked className="size-5 text-primary" />
          <div>
            <h1 className="text-base font-semibold tracking-normal">{t('title')}</h1>
            <p className="text-xs text-text-muted">{t('subtitle')}</p>
          </div>
        </div>

        <SourceForm
          isPending={createSource.isPending || indexSource.isPending}
          onSubmit={createAndIndex}
        />

        <div className="mt-6 space-y-2">
          <div className="text-xs font-medium uppercase text-text-muted">{t('sources')}</div>
          {sourcesQuery.isLoading ? (
            <div className="flex items-center gap-2 rounded-md border border-border-subtle bg-bg-subtle px-3 py-2 text-sm text-text-muted">
              <Loader2 className="size-4 animate-spin" />
              {t('loadingSources')}
            </div>
          ) : sources.length > 0 ? (
            <div className="space-y-1">
              {sources.map(source => (
                <SourceListItem
                  key={source.id}
                  source={source}
                  active={source.id === selectedSourceId}
                  statusLabel={statusT(source.status)}
                  onSelect={() => selectSource(source.id)}
                />
              ))}
            </div>
          ) : (
            <div className="rounded-md border border-border-subtle bg-bg-subtle p-3 text-sm text-text-muted">
              {t('emptySources')}
            </div>
          )}
        </div>
      </aside>

      <main className="flex min-h-0 flex-col">
        <div className="shrink-0 border-b border-border-subtle bg-bg-surface p-4">
          <WikiSearch
            indexId={latestIndex?.id}
            query={searchQuery}
            onQueryChange={setSearchQuery}
            onSelectPage={selectPage}
            onSelectRef={setSelectedRef}
          />
        </div>

        {selectedSource ? (
          <WikiLayout
            source={selectedSource}
            index={latestIndex}
            pages={pages}
            selectedSlug={pageSlug}
            isIndexing={indexSource.isPending}
            onSelectPage={selectPage}
            onReindex={reindex}
          >
            {latestIndex && pages.length > 0 ? (
              <WikiPageViewer
                page={pageQuery.data}
                isLoading={pageQuery.isLoading || pagesQuery.isLoading}
                onSelectRef={setSelectedRef}
              />
            ) : (
              <div className="p-6 text-sm text-text-muted">{t('noIndex')}</div>
            )}
          </WikiLayout>
        ) : (
          <div className="flex min-h-0 flex-1 items-center justify-center p-6 text-sm text-text-muted">
            {t('selectSource')}
          </div>
        )}
      </main>

      <SourceReferencePanel indexId={latestIndex?.id} selectedRef={selectedRef} />
    </div>
  );
}

function SourceListItem({
  source,
  active,
  statusLabel,
  onSelect,
}: {
  source: DeepWikiSourceDTO;
  active: boolean;
  statusLabel: string;
  onSelect: () => void;
}) {
  const label = source.repo_url || source.local_path || String(source.id);
  const Icon = source.source_type === 'github_url' ? Github : HardDrive;

  return (
    <button
      type="button"
      className={cn(
        'flex w-full items-start gap-2 rounded-md border border-transparent px-3 py-2 text-left hover:bg-bg-subtle',
        active && 'border-primary/30 bg-primary-subtle'
      )}
      onClick={onSelect}
    >
      <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-text-main">{label}</span>
        <span className="mt-1 flex items-center gap-2 text-xs text-text-muted">
          <span>{statusLabel}</span>
          {source.branch ? <span className="truncate">{source.branch}</span> : null}
        </span>
      </span>
    </button>
  );
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
  return raw || undefined;
}
