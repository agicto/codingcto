import { describe, expect, it } from 'vitest';

import { luasProfileInferencePayload } from '@/features/specforge/repo-profile-inference';

describe('luasProfileInferencePayload', () => {
  it('builds the file and script hints expected by the backend infer endpoint', () => {
    const payload = luasProfileInferencePayload(' develop ');

    expect(payload.default_branch).toBe('develop');
    expect(payload.file_paths).toContain('api/go.mod');
    expect(payload.file_paths).toContain('web/src/features/specforge/components/specforge-workbench.tsx');
    expect(payload.package_scripts).toMatchObject({
      lint: 'eslint .',
      'type-check': 'tsc --noEmit',
      test: 'vitest',
    });
  });

  it('defaults the branch when empty', () => {
    expect(luasProfileInferencePayload('').default_branch).toBe('main');
  });
});
