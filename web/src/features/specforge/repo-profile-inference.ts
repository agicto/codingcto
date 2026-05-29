import type { InferRepoProfilePayload } from '@/features/specforge/services/specforge-service';

export function githubTreeProfileInferencePayload(defaultBranch: string): InferRepoProfilePayload {
  return {
    default_branch: defaultBranch.trim() || 'main',
    file_paths: [],
    package_scripts: {},
  };
}
