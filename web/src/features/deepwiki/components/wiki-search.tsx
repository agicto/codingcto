'use client';

import { Search } from 'lucide-react';

import { Input } from '@/components/ui/input';
import { useDeepWikiSearch } from '@/features/deepwiki/hooks/use-deepwiki';
import type { DeepWikiSearchResultDTO, DeepWikiSourceRefDTO } from '@/features/deepwiki/types';
import { useT } from '@/i18n';

export interface WikiSearchProps {
  indexId?: number;
  query: string;
  onQueryChange: (query: string) => void;
  onSelectPage: (slug: string) => void;
  onSelectRef: (ref: DeepWikiSourceRefDTO) => void;
}

/**
 * @component WikiSearch
 * @category Feature
 * @status Beta
 * @description Searches generated wiki pages and indexed code chunks.
 * @usage Use inside DeepWikiConsole near the page navigation.
 * @example
 * <WikiSearch query={query} onQueryChange={setQuery} />
 */
export function WikiSearch({
  indexId,
  query,
  onQueryChange,
  onSelectPage,
  onSelectRef,
}: WikiSearchProps) {
  const t = useT('dashboard.deepwiki.search');
  const searchQuery = useDeepWikiSearch(indexId, query);
  const results = searchQuery.data?.results ?? [];

  function selectResult(result: DeepWikiSearchResultDTO) {
    if (result.kind === 'page' && result.slug) {
      onSelectPage(result.slug);
      return;
    }
    if (result.file_path && result.start_line && result.end_line) {
      onSelectRef({
        path: result.file_path,
        start_line: result.start_line,
        end_line: result.end_line,
      });
    }
  }

  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-text-muted" />
        <Input
          value={query}
          onChange={event => onQueryChange(event.target.value)}
          placeholder={t('placeholder')}
          className="pl-9"
        />
      </div>
      {query.trim().length >= 2 ? (
        <div className="max-h-60 overflow-auto rounded-md border border-border-subtle bg-bg-surface">
          {searchQuery.isLoading ? (
            <div className="px-3 py-2 text-sm text-text-muted">{t('loading')}</div>
          ) : results.length > 0 ? (
            <div className="divide-y divide-border-subtle">
              {results.map(result => (
                <button
                  key={`${result.kind}-${result.id}`}
                  type="button"
                  className="block w-full px-3 py-2 text-left hover:bg-bg-subtle"
                  onClick={() => selectResult(result)}
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-text-muted">
                    <span>{result.kind === 'page' ? t('page') : t('chunk')}</span>
                    {result.file_path ? <span className="truncate">{result.file_path}</span> : null}
                  </div>
                  <div className="mt-1 truncate text-sm font-medium text-text-main">{result.title}</div>
                  <div className="mt-1 line-clamp-2 text-xs leading-5 text-text-muted">
                    {result.snippet}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="px-3 py-2 text-sm text-text-muted">{t('empty')}</div>
          )}
        </div>
      ) : null}
    </div>
  );
}
