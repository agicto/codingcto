export type ProjectPlanningStageID = 'project' | 'requirement' | 'plan' | 'dag' | 'prompt';

export type ProjectPlanningStageState = 'done' | 'current' | 'next' | 'blocked';

export interface ProjectPlanningFlowInput {
  hasPrimaryRepository: boolean;
  hasRequirementInput: boolean;
  hasPlan: boolean;
  prNodeCount: number;
  hasCompiledPrompt: boolean;
}

export interface ProjectPlanningStage {
  id: ProjectPlanningStageID;
  state: ProjectPlanningStageState;
}

export function projectPlanningStages({
  hasPrimaryRepository,
  hasRequirementInput,
  hasPlan,
  prNodeCount,
  hasCompiledPrompt,
}: ProjectPlanningFlowInput): ProjectPlanningStage[] {
  const hasPRDag = prNodeCount > 0;

  return [
    {
      id: 'project',
      state: hasPrimaryRepository ? 'done' : 'blocked',
    },
    {
      id: 'requirement',
      state: !hasPrimaryRepository
        ? 'next'
        : hasPlan
          ? 'done'
          : hasRequirementInput
            ? 'done'
            : 'current',
    },
    {
      id: 'plan',
      state: !hasPrimaryRepository
        ? 'next'
        : hasPlan
          ? 'done'
          : hasRequirementInput
            ? 'current'
            : 'next',
    },
    {
      id: 'dag',
      state: hasPRDag ? 'done' : hasPlan ? 'current' : 'next',
    },
    {
      id: 'prompt',
      state: hasCompiledPrompt ? 'done' : hasPRDag ? 'current' : 'next',
    },
  ];
}
