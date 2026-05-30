"use client";

import { useParams } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { SpecForgeWorkbench } from "@/features/specforge";
import { useProjectContext } from "@/features/project/hooks/use-projects";
import { primaryRepositoryContext } from "@/features/project/project-context";

export function ProjectSpecForgeConsole() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const contextQuery = useProjectContext(Number.isFinite(projectId) ? projectId : 0);
  const context = contextQuery.data?.context;
  const selectedRepository = primaryRepositoryContext(context);
  const repositoryId = selectedRepository?.repository.repository_id;

  return (
    <div>
      <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center gap-2 px-4 pt-6 md:px-8">
        <Badge variant="outline" className="border-primary/30 text-primary">
          Project scoped
        </Badge>
        {repositoryId ? (
          <Badge variant="outline">{repositoryId}</Badge>
        ) : (
          <Badge variant="outline" className="border-warning/30 text-warning">
            Demo fallback
          </Badge>
        )}
      </div>
      <SpecForgeWorkbench
        key={repositoryId ?? "demo"}
        projectId={Number.isFinite(projectId) ? projectId : undefined}
        initialRepositoryId={repositoryId}
        projectLabel={context?.project.name}
        repositoryLocked={Boolean(repositoryId)}
      />
    </div>
  );
}
