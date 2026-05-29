import { describe, expect, it } from 'vitest';

import { githubTreeProfileInferencePayload } from '@/features/specforge/repo-profile-inference';

describe('githubTreeProfileInferencePayload', () => {
  it('requests backend inference from the connected GitHub repository tree', () => {
    const payload = githubTreeProfileInferencePayload(' develop ');

    expect(payload.default_branch).toBe('develop');
    expect(payload.file_paths).toEqual([]);
    expect(payload.package_scripts).toEqual({});
  });

  it('defaults the branch when empty', () => {
    expect(githubTreeProfileInferencePayload('').default_branch).toBe('main');
  });
});
