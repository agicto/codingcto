'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { deepWikiService } from '@/features/deepwiki/services/deepwiki-service';
import type {
  CreateDeepWikiSourcePayload,
  DeepWikiSourceRefDTO,
  IndexDeepWikiSourcePayload,
} from '@/features/deepwiki/types';

const silentQueryConfig = { skipErrorHandler: true };
const silentQueryMeta = { silentError: true };

export const deepWikiKeys = {
  all: ['deepwiki'] as const,
  sources: () => [...deepWikiKeys.all, 'sources'] as const,
  source: (sourceId: number) => [...deepWikiKeys.all, 'source', sourceId] as const,
  latestIndex: (sourceId: number) => [...deepWikiKeys.all, 'latest-index', sourceId] as const,
  pages: (indexId: number) => [...deepWikiKeys.all, 'pages', indexId] as const,
  page: (indexId: number, slug: string) =>
    [...deepWikiKeys.all, 'page', indexId, slug] as const,
  search: (indexId: number, query: string) =>
    [...deepWikiKeys.all, 'search', indexId, query] as const,
  localDirectories: (path: string) =>
    [...deepWikiKeys.all, 'local-directories', path] as const,
  sourceSnippet: (indexId: number, ref?: DeepWikiSourceRefDTO) =>
    [
      ...deepWikiKeys.all,
      'source-snippet',
      indexId,
      ref?.path ?? '',
      ref?.start_line ?? 0,
      ref?.end_line ?? 0,
    ] as const,
};

export function useDeepWikiSources() {
  return useQuery({
    queryKey: deepWikiKeys.sources(),
    queryFn: () => deepWikiService.listSources(silentQueryConfig),
    meta: silentQueryMeta,
  });
}

export function useCreateDeepWikiSource() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: CreateDeepWikiSourcePayload) =>
      deepWikiService.createSource(payload, silentQueryConfig),
    meta: silentQueryMeta,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: deepWikiKeys.sources() });
    },
  });
}

export function useDeepWikiSource(sourceId?: number) {
  return useQuery({
    queryKey: deepWikiKeys.source(sourceId ?? 0),
    queryFn: () => deepWikiService.getSource(sourceId ?? 0, silentQueryConfig),
    enabled: Boolean(sourceId),
    meta: silentQueryMeta,
  });
}

export function useIndexDeepWikiSource(sourceId?: number) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input?: {
      sourceId?: number;
      payload?: IndexDeepWikiSourcePayload;
    }) => {
      const targetSourceId = input?.sourceId ?? sourceId ?? 0;
      return deepWikiService.indexSource(
        targetSourceId,
        input?.payload ?? {},
        silentQueryConfig
      );
    },
    meta: silentQueryMeta,
    onSuccess: index => {
      const targetSourceId = index.source_id || sourceId || 0;
      queryClient.invalidateQueries({ queryKey: deepWikiKeys.sources() });
      queryClient.invalidateQueries({ queryKey: deepWikiKeys.source(targetSourceId) });
      queryClient.invalidateQueries({ queryKey: deepWikiKeys.latestIndex(targetSourceId) });
      queryClient.invalidateQueries({ queryKey: deepWikiKeys.pages(index.id) });
    },
  });
}

export function useDeepWikiLatestIndex(sourceId?: number) {
  return useQuery({
    queryKey: deepWikiKeys.latestIndex(sourceId ?? 0),
    queryFn: () => deepWikiService.getLatestIndex(sourceId ?? 0, silentQueryConfig),
    enabled: Boolean(sourceId),
    refetchInterval: query => {
      const status = query.state.data?.status;
      return status && status !== 'ready' && status !== 'failed' ? 2000 : false;
    },
    meta: silentQueryMeta,
  });
}

export function useDeepWikiPages(indexId?: number) {
  return useQuery({
    queryKey: deepWikiKeys.pages(indexId ?? 0),
    queryFn: () => deepWikiService.listPages(indexId ?? 0, silentQueryConfig),
    enabled: Boolean(indexId),
    meta: silentQueryMeta,
  });
}

export function useDeepWikiPage(indexId?: number, slug?: string) {
  return useQuery({
    queryKey: deepWikiKeys.page(indexId ?? 0, slug ?? ''),
    queryFn: () => deepWikiService.getPageBySlug(indexId ?? 0, slug ?? '', silentQueryConfig),
    enabled: Boolean(indexId && slug),
    meta: silentQueryMeta,
  });
}

export function useDeepWikiSearch(indexId?: number, query = '') {
  return useQuery({
    queryKey: deepWikiKeys.search(indexId ?? 0, query),
    queryFn: () => deepWikiService.search(indexId ?? 0, query, silentQueryConfig),
    enabled: Boolean(indexId && query.trim().length >= 2),
    meta: silentQueryMeta,
  });
}

export function useDeepWikiSourceSnippet(indexId?: number, ref?: DeepWikiSourceRefDTO) {
  return useQuery({
    queryKey: deepWikiKeys.sourceSnippet(indexId ?? 0, ref),
    queryFn: () =>
      deepWikiService.getSourceSnippet(
        indexId ?? 0,
        ref?.path ?? '',
        ref?.start_line,
        ref?.end_line,
        silentQueryConfig
      ),
    enabled: Boolean(indexId && ref?.path),
    meta: silentQueryMeta,
  });
}

export function useDeepWikiLocalDirectories(path = '', enabled = true) {
  return useQuery({
    queryKey: deepWikiKeys.localDirectories(path),
    queryFn: () => deepWikiService.listLocalDirectories(path, silentQueryConfig),
    enabled,
    meta: silentQueryMeta,
  });
}
