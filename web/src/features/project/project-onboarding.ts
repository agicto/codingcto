export type ProjectOnboardingStepId = 'workspace' | 'project' | 'repository' | 'complete';

export type ProjectOnboardingStepState = 'done' | 'current' | 'locked';

export interface ProjectOnboardingInput {
  hasWorkspace: boolean;
  hasProject: boolean;
  hasPrimaryRepository: boolean;
}

export interface ProjectOnboardingStep {
  id: Exclude<ProjectOnboardingStepId, 'complete'>;
  state: ProjectOnboardingStepState;
}

export function resolveProjectOnboardingStep({
  hasWorkspace,
  hasProject,
  hasPrimaryRepository,
}: ProjectOnboardingInput): ProjectOnboardingStepId {
  if (!hasWorkspace) {
    return 'workspace';
  }
  if (!hasProject) {
    return 'project';
  }
  if (!hasPrimaryRepository) {
    return 'repository';
  }
  return 'complete';
}

export function projectOnboardingSteps(input: ProjectOnboardingInput): ProjectOnboardingStep[] {
  const activeStep = resolveProjectOnboardingStep(input);

  return [
    {
      id: 'workspace',
      state: input.hasWorkspace ? 'done' : activeStep === 'workspace' ? 'current' : 'locked',
    },
    {
      id: 'project',
      state: !input.hasWorkspace
        ? 'locked'
        : input.hasProject
          ? 'done'
          : activeStep === 'project'
            ? 'current'
            : 'locked',
    },
    {
      id: 'repository',
      state: !input.hasProject
        ? 'locked'
        : input.hasPrimaryRepository
          ? 'done'
          : activeStep === 'repository'
            ? 'current'
            : 'locked',
    },
  ];
}
