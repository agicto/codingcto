import { describe, expect, it } from 'vitest';

import { demoPlan } from '@/features/specforge/mock-data';
import { buildPromptPreview } from '@/features/specforge/prompt-preview';

describe('buildPromptPreview', () => {
  it('includes the node scope, constraints, and test plan', () => {
    const prompt = buildPromptPreview(demoPlan, demoPlan.prNodes[0]);

    expect(prompt).toContain('You are implementing PR-001');
    expect(prompt).toContain('Goal:');
    expect(prompt).toContain('Grounded prompt contract:');
    expect(prompt).toContain('Evidence refs:');
    expect(prompt).toContain('Scope guardrails:');
    expect(prompt).toContain('PR DAG guardrails:');
    expect(prompt).toContain('Verification contract:');
    expect(prompt).toContain('Non-goals:');
    expect(prompt).toContain('Do not build UI.');
    expect(prompt).toContain('Test commands:');
    expect(prompt).toContain('go test ./...');
    expect(prompt).toContain('After implementation:');
  });

  it('renders empty lists explicitly', () => {
    const prompt = buildPromptPreview(demoPlan, {
      ...demoPlan.prNodes[0],
      dependsOn: [],
      expectedFiles: [],
      testCommands: [],
    });

    expect(prompt).toContain('Dependencies:\n- None');
    expect(prompt).toContain('Expected files:\n- None');
    expect(prompt).toContain('Test commands:\n- None');
  });
});
