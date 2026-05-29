import type { InferRepoProfilePayload } from '@/features/specforge/services/specforge-service';

export function luasProfileInferencePayload(defaultBranch: string): InferRepoProfilePayload {
  return {
    default_branch: defaultBranch.trim() || 'main',
    file_paths: [
      'api/go.mod',
      'api/internal/modules/user/service.go',
      'api/internal/modules/githubintegration/service.go',
      'api/internal/modules/repocontext/service.go',
      'api/internal/bootstrap/migrate.go',
      'web/package.json',
      'web/tsconfig.json',
      'web/next.config.ts',
      'web/postcss.config.mjs',
      'web/src/features/specforge/components/specforge-workbench.tsx',
      'web/src/features/auth',
      '.github/workflows/ci.yml',
    ],
    package_scripts: {
      lint: 'eslint .',
      'type-check': 'tsc --noEmit',
      test: 'vitest',
    },
  };
}
