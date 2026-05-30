import type { ProjectContextDTO, ProjectRepositoryContextDTO } from "./services/project-service";

export function primaryRepositoryContext(
  context?: ProjectContextDTO
): ProjectRepositoryContextDTO | undefined {
  if (!context?.repository_contexts?.length) {
    return undefined;
  }
  return (
    context.repository_contexts.find(
      (item) => item.repository.active && item.repository.role === "primary"
    ) ?? context.repository_contexts.find((item) => item.repository.active)
  );
}
