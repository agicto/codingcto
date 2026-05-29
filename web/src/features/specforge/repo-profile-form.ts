import type {
  SpecForgeRepoProfileDTO,
  RepoProfilePayload,
} from '@/features/specforge/services/specforge-service';
import type { RepoProfile } from '@/features/specforge/types';

export function parseProfileList(value: string) {
  return value
    .split(/[\n,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function profileListValue(items: string[]) {
  return items.join(', ');
}

export function repoProfilePayloadFromForm(input: {
  defaultBranch: string;
  stack: string;
  testCommands: string;
  ciProvider: string;
  codingConventions: string;
  riskAreas: string;
  summary: string;
}): RepoProfilePayload {
  return {
    default_branch: input.defaultBranch.trim() || 'main',
    stack: parseProfileList(input.stack),
    test_commands: parseProfileList(input.testCommands),
    ci_provider: input.ciProvider.trim(),
    coding_conventions: parseProfileList(input.codingConventions),
    risk_areas: parseProfileList(input.riskAreas),
    summary: input.summary.trim(),
  };
}

export function repoProfileFromDTO(dto: SpecForgeRepoProfileDTO): RepoProfile {
  return {
    repositoryId: dto.repository_id,
    defaultBranch: dto.default_branch,
    stack: dto.stack ?? [],
    testCommands: dto.test_commands ?? [],
    ciProvider: dto.ci_provider,
    codingConventions: dto.coding_conventions ?? [],
    riskAreas: dto.risk_areas ?? [],
    summary: dto.summary,
    source: dto.source ?? 'unknown',
    warnings: dto.warnings ?? [],
    lastIndexedAt: dto.last_indexed_at,
  };
}
