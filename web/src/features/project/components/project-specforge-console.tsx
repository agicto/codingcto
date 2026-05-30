'use client';

import { useParams } from 'next/navigation';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SpecForgeWorkbench } from '@/features/specforge';
import { useProjectContext } from '@/features/project/hooks/use-projects';
import { primaryRepositoryContext } from '@/features/project/project-context';

export function ProjectSpecForgeConsole() {
  const params = useParams<{ projectId: string }>();
  const projectId = Number(params.projectId);
  const contextQuery = useProjectContext(Number.isFinite(projectId) ? projectId : 0);
  const context = contextQuery.data?.context;
  const selectedRepository = primaryRepositoryContext(context);
  const repositoryId = selectedRepository?.repository.repository_id;
  const hasProjectContext = Boolean(context);

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
            Primary repo required
          </Badge>
        )}
        {context?.read_only_repository_ids?.map(readOnlyRepositoryId => (
          <Badge key={readOnlyRepositoryId} variant="outline" className="text-text-muted">
            read-only {readOnlyRepositoryId}
          </Badge>
        ))}
      </div>
      {hasProjectContext && !repositoryId ? (
        <div className="mx-auto w-full max-w-7xl px-4 py-6 md:px-8">
          <Alert>
            <AlertTitle>Bind a primary repository to start planning</AlertTitle>
            <AlertDescription>
              CodingCTO can read dependency, docs, and infra repositories as context, but MVP
              execution only writes to the active primary repository.
            </AlertDescription>
          </Alert>
        </div>
      ) : (
        <SpecForgeWorkbench
          key={repositoryId ?? 'demo'}
          projectId={Number.isFinite(projectId) ? projectId : undefined}
          initialRepositoryId={repositoryId}
          projectLabel={context?.project.name}
          repositoryLocked={Boolean(repositoryId)}
        />
      )}
    </div>
  );
}
