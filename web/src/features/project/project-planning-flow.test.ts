import { describe, expect, it } from 'vitest';

import { projectPlanningStages } from './project-planning-flow';

describe('projectPlanningStages', () => {
  it('blocks the flow until a primary repository exists', () => {
    expect(
      projectPlanningStages({
        hasPrimaryRepository: false,
        hasRequirementInput: false,
        hasPlan: false,
        prNodeCount: 0,
        hasCompiledPrompt: false,
      })
    ).toEqual([
      { id: 'project', state: 'blocked' },
      { id: 'requirement', state: 'next' },
      { id: 'plan', state: 'next' },
      { id: 'dag', state: 'next' },
      { id: 'prompt', state: 'next' },
    ]);
  });

  it('starts at requirement intake when the project context is ready', () => {
    expect(
      projectPlanningStages({
        hasPrimaryRepository: true,
        hasRequirementInput: false,
        hasPlan: false,
        prNodeCount: 0,
        hasCompiledPrompt: false,
      })
    ).toEqual([
      { id: 'project', state: 'done' },
      { id: 'requirement', state: 'current' },
      { id: 'plan', state: 'next' },
      { id: 'dag', state: 'next' },
      { id: 'prompt', state: 'next' },
    ]);
  });

  it('moves generation into focus after the user writes the requirement', () => {
    expect(
      projectPlanningStages({
        hasPrimaryRepository: true,
        hasRequirementInput: true,
        hasPlan: false,
        prNodeCount: 0,
        hasCompiledPrompt: false,
      })
    ).toEqual([
      { id: 'project', state: 'done' },
      { id: 'requirement', state: 'done' },
      { id: 'plan', state: 'current' },
      { id: 'dag', state: 'next' },
      { id: 'prompt', state: 'next' },
    ]);
  });

  it('focuses prompt preview after a plan with PR nodes exists', () => {
    expect(
      projectPlanningStages({
        hasPrimaryRepository: true,
        hasRequirementInput: true,
        hasPlan: true,
        prNodeCount: 3,
        hasCompiledPrompt: false,
      })
    ).toEqual([
      { id: 'project', state: 'done' },
      { id: 'requirement', state: 'done' },
      { id: 'plan', state: 'done' },
      { id: 'dag', state: 'done' },
      { id: 'prompt', state: 'current' },
    ]);
  });

  it('marks the full planning core complete after a prompt is compiled', () => {
    expect(
      projectPlanningStages({
        hasPrimaryRepository: true,
        hasRequirementInput: true,
        hasPlan: true,
        prNodeCount: 2,
        hasCompiledPrompt: true,
      })
    ).toEqual([
      { id: 'project', state: 'done' },
      { id: 'requirement', state: 'done' },
      { id: 'plan', state: 'done' },
      { id: 'dag', state: 'done' },
      { id: 'prompt', state: 'done' },
    ]);
  });
});
