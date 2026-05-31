import type { WorkspaceDTO } from '@/features/project/services/project-service';

export interface ResolveSelectedWorkspaceInput {
  storedWorkspaceId: string;
  workspaces: WorkspaceDTO[];
  unavailable?: boolean;
}

export function resolveSelectedWorkspaceId({
  storedWorkspaceId,
  workspaces,
  unavailable = false,
}: ResolveSelectedWorkspaceInput): string {
  if (unavailable) {
    return '';
  }

  const normalizedStoredId = storedWorkspaceId.trim();
  if (
    normalizedStoredId &&
    workspaces.some(workspace => workspace.workspace_id === normalizedStoredId)
  ) {
    return normalizedStoredId;
  }

  return workspaces[0]?.workspace_id ?? normalizedStoredId;
}
