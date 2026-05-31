import { describe, expect, it } from 'vitest';

import { resolveSelectedWorkspaceId } from '@/features/project/workspace-selection';
import type { WorkspaceDTO } from '@/features/project/services/project-service';

const workspaces: WorkspaceDTO[] = [
  {
    id: 1,
    workspace_id: 'workspace_alpha',
    name: 'Alpha',
    slug: 'alpha',
    description: '',
    status: 'active',
    created_by: 1,
    created_at: '2026-05-31T00:00:00Z',
    updated_at: '2026-05-31T00:00:00Z',
  },
  {
    id: 2,
    workspace_id: 'workspace_beta',
    name: 'Beta',
    slug: 'beta',
    description: '',
    status: 'active',
    created_by: 1,
    created_at: '2026-05-31T00:00:00Z',
    updated_at: '2026-05-31T00:00:00Z',
  },
];

describe('resolveSelectedWorkspaceId', () => {
  it('keeps a stored workspace when the API confirms it exists', () => {
    expect(
      resolveSelectedWorkspaceId({
        storedWorkspaceId: 'workspace_beta',
        workspaces,
      })
    ).toBe('workspace_beta');
  });

  it('falls back to the first workspace when the stored value is stale', () => {
    expect(
      resolveSelectedWorkspaceId({
        storedWorkspaceId: 'workspace_missing',
        workspaces,
      })
    ).toBe('workspace_alpha');
  });

  it('clears selection when the backend workspace API is unavailable', () => {
    expect(
      resolveSelectedWorkspaceId({
        storedWorkspaceId: 'workspace_beta',
        workspaces,
        unavailable: true,
      })
    ).toBe('');
  });
});
