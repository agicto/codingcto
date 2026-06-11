export { ProjectConsole } from './components/project-console';
export { ProjectSpecForgeConsole } from './components/project-specforge-console';
export {
  useBindProjectRepository,
  useCreateProject,
  useCreateWorkspace,
  useDeleteProject,
  useProject,
  useProjectContext,
  useProjects,
  useUnbindProjectRepository,
  useUpdateProject,
  useWorkspaces,
} from './hooks/use-projects';
export { useSelectedWorkspace } from './hooks/use-selected-workspace';
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
  type UpdateProjectPayload,
} from './services/project-service';
export { primaryRepositoryContext } from './project-context';
