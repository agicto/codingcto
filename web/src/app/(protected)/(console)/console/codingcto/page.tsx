'use client';

import { useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

import { SpecForgeWorkbench } from '@/features/specforge';
import { useProjects } from '@/features/project/hooks/use-projects';
import { useSelectedWorkspace } from '@/features/project/hooks/use-selected-workspace';
import { projectSpecForgeHref } from '@/features/project/project-utils';

export default function CodingCTOPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { selectedWorkspaceId } = useSelectedWorkspace();
  const projectsQuery = useProjects(selectedWorkspaceId);
  const projects = useMemo(
    () => projectsQuery.data?.projects ?? [],
    [projectsQuery.data?.projects]
  );

  useEffect(() => {
    const firstProject = projects[0];
    if (!firstProject) {
      return;
    }
    const query = searchParams.toString();
    const suffix = query ? `?${query}` : '';
    router.replace(`${projectSpecForgeHref(firstProject.id)}${suffix}`);
  }, [projects, router, searchParams]);

  if (projectsQuery.isLoading || projects.length > 0) {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 py-10 text-sm text-text-muted md:px-8">
        正在进入项目看板...
      </div>
    );
  }

  return <SpecForgeWorkbench />;
}
