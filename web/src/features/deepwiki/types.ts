export type DeepWikiSourceType = 'github_url' | 'local_path' | 'github_repository';

export type DeepWikiStatus =
  | 'queued'
  | 'reading'
  | 'filtering'
  | 'analyzing'
  | 'indexing'
  | 'planning'
  | 'generating'
  | 'ready'
  | 'failed';

export interface DeepWikiSourceDTO {
  id: number;
  created_by: number;
  source_type: DeepWikiSourceType;
  workspace_id?: string;
  project_id?: number;
  repository_id?: string;
  github_owner?: string;
  github_repo?: string;
  repo_url?: string;
  local_path?: string;
  branch?: string;
  default_branch?: string;
  status: DeepWikiStatus | string;
  last_indexed_at?: string;
  last_failure?: string;
  last_error?: string;
  created_at: string;
  updated_at: string;
}

export interface DeepWikiIndexDTO {
  id: number;
  source_id: number;
  commit_sha?: string;
  file_count: number;
  chunk_count: number;
  language_summary: Record<string, number>;
  file_tree: string[];
  entrypoints: string[];
  routes: string[];
  services: string[];
  models: string[];
  configs: string[];
  frameworks: string[];
  package_manager?: string;
  generation_mode: 'llm' | 'legacy_template' | string;
  generator_provider?: string;
  generator_model?: string;
  prompt_version?: string;
  status: DeepWikiStatus | string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface DeepWikiSourceRefDTO {
  path: string;
  start_line: number;
  end_line: number;
}

export interface DeepWikiPageDTO {
  id: number;
  index_id: number;
  slug: string;
  title: string;
  page_type: string;
  markdown: string;
  html?: string;
  mermaid?: string;
  source_refs: DeepWikiSourceRefDTO[];
  order_index: number;
  status: DeepWikiStatus | string;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

export interface DeepWikiSearchResultDTO {
  kind: 'page' | 'chunk' | string;
  id: number;
  title: string;
  file_path?: string;
  slug?: string;
  language?: string;
  start_line?: number;
  end_line?: number;
  snippet: string;
  source_refs?: DeepWikiSourceRefDTO[];
}

export interface DeepWikiSearchResponseDTO {
  query: string;
  results: DeepWikiSearchResultDTO[];
}

export interface DeepWikiSourceSnippetDTO {
  index_id: number;
  path: string;
  start_line: number;
  end_line: number;
  content: string;
}

export interface DeepWikiLocalDirectoryEntryDTO {
  name: string;
  path: string;
}

export interface DeepWikiLocalDirectoryListDTO {
  path: string;
  parent_path?: string;
  entries: DeepWikiLocalDirectoryEntryDTO[];
}

export interface CreateDeepWikiSourcePayload {
  source_type: DeepWikiSourceType;
  workspace_id?: string;
  project_id?: number;
  repository_id?: string;
  github_owner?: string;
  github_repo?: string;
  repo_url?: string;
  local_path?: string;
  branch?: string;
  default_branch?: string;
  pat?: string;
}

export interface IndexDeepWikiSourcePayload {
  pat?: string;
}
