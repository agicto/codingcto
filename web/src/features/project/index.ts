export { ProjectConsole } from "./components/project-console";
export { ProjectSpecForgeConsole } from "./components/project-specforge-console";
export {
  useBindProjectRepository,
  useCreateProject,
  useProjectContext,
  useProjects,
} from "./hooks/use-projects";
export {
  projectService,
  type BindRepositoryPayload,
  type CreateProjectPayload,
  type ProjectContextDTO,
  type ProjectDTO,
  type ProjectRepoProfileDTO,
  type ProjectRepositoryContextDTO,
  type ProjectRepositoryDTO,
  type ProjectSkillDTO,
} from "./services/project-service";
export { primaryRepositoryContext } from "./project-context";
