import { env } from '@/config/env';
import { createRequest, type RequestConfig } from '@/http';
import type {
  CreateDeepWikiSourcePayload,
  DeepWikiIndexDTO,
  DeepWikiLocalDirectoryListDTO,
  DeepWikiPageDTO,
  DeepWikiSearchResponseDTO,
  DeepWikiSourceDTO,
  DeepWikiSourceSnippetDTO,
  IndexDeepWikiSourcePayload,
} from '@/features/deepwiki/types';

const request = createRequest({
  baseURL: env.NEXT_PUBLIC_SPECFORGE_API_URL,
});

const DEEPWIKI_GENERATION_TIMEOUT_MS = 10 * 60 * 1000;

export const deepWikiService = {
  listSources: (config?: RequestConfig) =>
    request.get<DeepWikiSourceDTO[]>('/deepwiki/sources', config),

  createSource: (payload: CreateDeepWikiSourcePayload, config?: RequestConfig) =>
    request.post<DeepWikiSourceDTO, CreateDeepWikiSourcePayload>(
      '/deepwiki/sources',
      payload,
      config
    ),

  getSource: (sourceId: number, config?: RequestConfig) =>
    request.get<DeepWikiSourceDTO>(`/deepwiki/sources/${sourceId}`, config),

  indexSource: (
    sourceId: number,
    payload: IndexDeepWikiSourcePayload = {},
    config?: RequestConfig
  ) =>
    request.post<DeepWikiIndexDTO, IndexDeepWikiSourcePayload>(
      `/deepwiki/sources/${sourceId}/index`,
      payload,
      { timeout: DEEPWIKI_GENERATION_TIMEOUT_MS, ...config }
    ),

  getLatestIndex: (sourceId: number, config?: RequestConfig) =>
    request.get<DeepWikiIndexDTO | null>(`/deepwiki/sources/${sourceId}/index`, config),

  listPages: (indexId: number, config?: RequestConfig) =>
    request.get<DeepWikiPageDTO[]>(`/deepwiki/indexes/${indexId}/pages`, config),

  getPageBySlug: (indexId: number, slug: string, config?: RequestConfig) =>
    request.get<DeepWikiPageDTO>(
      `/deepwiki/indexes/${indexId}/pages/${encodeURIComponent(slug)}`,
      config
    ),

  search: (indexId: number, query: string, config?: RequestConfig) =>
    request.get<DeepWikiSearchResponseDTO>(
      `/deepwiki/indexes/${indexId}/search?q=${encodeURIComponent(query)}`,
      config
    ),

  getSourceSnippet: (
    indexId: number,
    path: string,
    startLine?: number,
    endLine?: number,
    config?: RequestConfig
  ) => {
    const params = new URLSearchParams({ path });
    if (startLine) {
      params.set('start', String(startLine));
    }
    if (endLine) {
      params.set('end', String(endLine));
    }
    return request.get<DeepWikiSourceSnippetDTO>(
      `/deepwiki/indexes/${indexId}/source?${params.toString()}`,
      config
    );
  },

  listLocalDirectories: (path?: string, config?: RequestConfig) => {
    const params = new URLSearchParams();
    const trimmedPath = path?.trim();
    if (trimmedPath) {
      params.set('path', trimmedPath);
    }
    const query = params.toString();
    return request.get<DeepWikiLocalDirectoryListDTO>(
      `/deepwiki/local-directories${query ? `?${query}` : ''}`,
      config
    );
  },
};
