'use client';

import { useEffect, useMemo } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { ArrowRight, FolderPlus, GitPullRequest } from 'lucide-react';

import { Button } from '@/components/ui/button';
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
        正在进入项目交付板...
      </div>
    );
  }

  return (
    <main className="mx-auto flex h-full w-full max-w-5xl flex-col justify-center px-4 py-10 md:px-8">
      <section className="rounded-[var(--radius-card)] border border-border-subtle bg-bg-surface p-8 md:p-10">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-bg-subtle text-primary">
          <GitPullRequest className="h-5 w-5" />
        </div>
        <h1 className="mt-6 max-w-2xl text-4xl font-semibold leading-[1.08] tracking-[-0.01em] text-text-main md:text-5xl">
          先创建一个项目，再进入 PR 交付流程
        </h1>
        <p className="mt-4 max-w-2xl text-[17px] leading-[1.47] tracking-[-0.01em] text-text-subtle">
          这个页面不是普通任务列表。它用于把一个产品需求连接到 GitHub 仓库，生成可审批的技术计划，
          再派发 Codex 执行并交付可评审 PR。
        </p>
        <div className="mt-6 grid gap-3 text-sm text-text-subtle md:grid-cols-4">
          {['创建项目', '绑定仓库', '审批计划', '执行并交付 PR'].map((step, index) => (
            <div key={step} className="rounded-[var(--radius-card)] bg-bg-subtle p-4">
              <div className="text-xs text-text-muted">Step {index + 1}</div>
              <div className="mt-1 font-medium text-text-main">{step}</div>
            </div>
          ))}
        </div>
        <Button asChild className="mt-8">
          <Link href="/console/projects">
            <FolderPlus className="mr-1.5 h-4 w-4" />
            去创建项目
            <ArrowRight className="ml-1.5 h-4 w-4" />
          </Link>
        </Button>
      </section>
    </main>
  );
}
