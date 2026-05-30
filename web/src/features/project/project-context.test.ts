import { describe, expect, it } from "vitest";

import { primaryRepositoryContext } from "./project-context";
import type { ProjectContextDTO } from "./services/project-service";

function projectContext(roles: Array<["primary" | "dependency", boolean, string]>): ProjectContextDTO {
  return {
    project: {
      id: 1,
      workspace_id: "workspace_1",
      name: "SpecForge",
      slug: "specforge",
      description: "",
      status: "active",
      created_by: 1,
      created_at: "",
      updated_at: "",
    },
    repositories: [],
    repository_contexts: roles.map(([role, active, repositoryId], index) => ({
      repository: {
        id: index + 1,
        workspace_id: "workspace_1",
        project_id: 1,
        repository_id: repositoryId,
        role,
        active,
        created_by: 1,
        created_at: "",
        updated_at: "",
      },
      skills: [],
    })),
  };
}

describe("project context", () => {
  it("selects the active primary repository context", () => {
    const selected = primaryRepositoryContext(
      projectContext([
        ["dependency", true, "repo_dependency"],
        ["primary", true, "repo_primary"],
      ])
    );

    expect(selected?.repository.repository_id).toBe("repo_primary");
  });

  it("falls back to the first active repository when no primary exists", () => {
    const selected = primaryRepositoryContext(
      projectContext([
        ["dependency", false, "repo_inactive"],
        ["dependency", true, "repo_active"],
      ])
    );

    expect(selected?.repository.repository_id).toBe("repo_active");
  });
});
