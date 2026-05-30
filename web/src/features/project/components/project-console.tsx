"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import {
  ArrowRight,
  Boxes,
  GitBranch,
  GitPullRequest,
  Plus,
  RefreshCw,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/utils";
import {
  projectSpecForgeHref,
  repositoryRoleLabel,
  slugFromProjectName,
} from "@/features/project/project-utils";
import { useCreateProject, useProjects } from "@/features/project/hooks/use-projects";
import type { ProjectDTO } from "@/features/project/services/project-service";

const defaultWorkspaceId = "workspace_123";

const demoProject: ProjectDTO = {
  id: 1,
  workspace_id: defaultWorkspaceId,
  name: "SpecForge",
  slug: "specforge",
  description: "PRD-to-PR automation workspace for product and engineering runs.",
  status: "active",
  created_by: 1,
  created_at: new Date(0).toISOString(),
  updated_at: new Date(0).toISOString(),
};

export function ProjectConsole() {
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [description, setDescription] = useState("");
  const [localProjects, setLocalProjects] = useState<ProjectDTO[]>([]);
  const [formError, setFormError] = useState("");
  const projectsQuery = useProjects(defaultWorkspaceId);
  const createProject = useCreateProject(defaultWorkspaceId);

  const projects = useMemo(() => {
    if (projectsQuery.data?.projects?.length) {
      return projectsQuery.data.projects;
    }
    return localProjects.length > 0 ? localProjects : [demoProject];
  }, [localProjects, projectsQuery.data?.projects]);

  const isUsingFallback = projectsQuery.isError || !projectsQuery.data?.projects?.length;

  function handleNameChange(value: string) {
    setName(value);
    setSlug((current) => (current ? current : slugFromProjectName(value)));
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    const trimmedName = name.trim();
    const trimmedSlug = slugFromProjectName(slug || name);
    if (!trimmedName || !trimmedSlug) {
      setFormError("Project name and slug are required.");
      return;
    }

    const payload = {
      workspace_id: defaultWorkspaceId,
      name: trimmedName,
      slug: trimmedSlug,
      description: description.trim(),
    };

    try {
      const response = await createProject.mutateAsync(payload);
      setLocalProjects((items) => [response.project, ...items]);
      setName("");
      setSlug("");
      setDescription("");
    } catch {
      const fallbackProject: ProjectDTO = {
        id: Date.now(),
        workspace_id: payload.workspace_id,
        name: payload.name,
        slug: payload.slug,
        description: payload.description,
        status: "active",
        created_by: 0,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      setLocalProjects((items) => [fallbackProject, ...items]);
      setName("");
      setSlug("");
      setDescription("");
      setFormError("Backend is unavailable; showing this project locally for UI review.");
    }
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-8 md:py-8">
      <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Badge variant="outline" className="border-primary/30 text-primary">
              Project context
            </Badge>
            {isUsingFallback && (
              <Badge variant="outline" className="border-warning/30 text-warning">
                Demo fallback
              </Badge>
            )}
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-normal">Projects</h1>
          <p className="mt-1 max-w-2xl text-sm leading-6 text-text-muted">
            Group repos and product work before SpecForge generates plans, prompts, and PRs.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          onClick={() => projectsQuery.refetch()}
          disabled={projectsQuery.isFetching}
        >
          {projectsQuery.isFetching ? "Refreshing" : "Refresh"}
          <RefreshCw className="ml-1.5 h-4 w-4" />
        </Button>
      </header>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className="space-y-3">
          {projects.map((project) => (
            <ProjectRow key={`${project.id}-${project.slug}`} project={project} />
          ))}
        </section>

        <Card className="self-start">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Plus className="h-4 w-4 text-primary" />
              New project
            </CardTitle>
            <CardDescription>
              Start with a product boundary, then bind repositories in the next step.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={handleSubmit}>
              <div className="space-y-2">
                <Label htmlFor="project-name">Name</Label>
                <Input
                  id="project-name"
                  value={name}
                  onChange={(event) => handleNameChange(event.target.value)}
                  placeholder="SpecForge"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-slug">Slug</Label>
                <Input
                  id="project-slug"
                  value={slug}
                  onChange={(event) => setSlug(slugFromProjectName(event.target.value))}
                  placeholder="specforge"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project-description">Description</Label>
                <Textarea
                  id="project-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What product or system does this project represent?"
                  rows={4}
                />
              </div>
              {formError && (
                <div className="rounded-lg border border-warning/30 bg-warning-subtle p-3 text-sm leading-5 text-warning">
                  {formError}
                </div>
              )}
              <Button type="submit" className="w-full" disabled={createProject.isPending}>
                {createProject.isPending ? "Creating" : "Create project"}
                <ArrowRight className="ml-1.5 h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function ProjectRow({ project }: { project: ProjectDTO }) {
  return (
    <Card className="transition-colors hover:border-primary/40">
      <CardContent className="p-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Boxes className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <h2 className="truncate text-sm font-semibold">{project.name}</h2>
                <div className="text-xs text-text-muted">{project.slug}</div>
              </div>
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-text-muted">
              {project.description || "No description yet."}
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge variant="outline" className={cn(project.status === "active" && "text-success")}>
                {project.status}
              </Badge>
              <Badge variant="outline">
                <GitBranch className="mr-1 h-3.5 w-3.5" />
                {repositoryRoleLabel("primary")} repo required
              </Badge>
            </div>
          </div>
          <Button asChild variant="outline" className="shrink-0">
            <Link href={projectSpecForgeHref(project.id)}>
              Open SpecForge
              <GitPullRequest className="ml-1.5 h-4 w-4" />
            </Link>
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
