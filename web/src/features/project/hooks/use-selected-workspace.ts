'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { useWorkspaces } from '@/features/project/hooks/use-projects';

const selectedWorkspaceStorageKey = 'codingcto.selectedWorkspaceId';
const selectedWorkspaceEvent = 'codingcto:selected-workspace';

function readStoredWorkspaceId() {
  if (typeof window === 'undefined') {
    return '';
  }
  return window.localStorage.getItem(selectedWorkspaceStorageKey) ?? '';
}

export function useSelectedWorkspace(initialWorkspaceId = '') {
  const workspacesQuery = useWorkspaces();
  const workspaces = useMemo(
    () => workspacesQuery.data?.workspaces ?? [],
    [workspacesQuery.data?.workspaces]
  );
  const [storedWorkspaceId, setStoredWorkspaceId] = useState(
    () => initialWorkspaceId.trim() || readStoredWorkspaceId()
  );

  const selectedWorkspaceId = useMemo(() => {
    if (
      storedWorkspaceId &&
      workspaces.some(workspace => workspace.workspace_id === storedWorkspaceId)
    ) {
      return storedWorkspaceId;
    }
    return workspaces[0]?.workspace_id ?? storedWorkspaceId;
  }, [storedWorkspaceId, workspaces]);

  const selectedWorkspace = useMemo(
    () => workspaces.find(workspace => workspace.workspace_id === selectedWorkspaceId),
    [selectedWorkspaceId, workspaces]
  );

  const setSelectedWorkspaceId = useCallback((workspaceId: string) => {
    const nextWorkspaceId = workspaceId.trim();
    setStoredWorkspaceId(nextWorkspaceId);
    if (typeof window === 'undefined') {
      return;
    }
    if (nextWorkspaceId) {
      window.localStorage.setItem(selectedWorkspaceStorageKey, nextWorkspaceId);
    } else {
      window.localStorage.removeItem(selectedWorkspaceStorageKey);
    }
    window.dispatchEvent(
      new CustomEvent(selectedWorkspaceEvent, { detail: { workspaceId: nextWorkspaceId } })
    );
  }, []);

  useEffect(() => {
    function handleSelectedWorkspace(event: Event) {
      const customEvent = event as CustomEvent<{ workspaceId?: string }>;
      setStoredWorkspaceId(customEvent.detail?.workspaceId ?? readStoredWorkspaceId());
    }

    function handleStorage(event: StorageEvent) {
      if (event.key === selectedWorkspaceStorageKey) {
        setStoredWorkspaceId(event.newValue ?? '');
      }
    }

    window.addEventListener(selectedWorkspaceEvent, handleSelectedWorkspace);
    window.addEventListener('storage', handleStorage);
    return () => {
      window.removeEventListener(selectedWorkspaceEvent, handleSelectedWorkspace);
      window.removeEventListener('storage', handleStorage);
    };
  }, []);

  return {
    workspacesQuery,
    workspaces,
    selectedWorkspaceId,
    selectedWorkspace,
    setSelectedWorkspaceId,
  };
}
