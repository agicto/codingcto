import { describe, expect, it } from 'vitest';

import {
  parseProfileList,
  profileListValue,
  repoProfileFromDTO,
  repoProfilePayloadFromForm,
} from '@/features/specforge/repo-profile-form';

describe('repo profile form helpers', () => {
  it('parses comma and newline separated profile lists', () => {
    expect(parseProfileList('Go, Next.js\nTypeScript,  Tailwind  ')).toEqual([
      'Go',
      'Next.js',
      'TypeScript',
      'Tailwind',
    ]);
  });

  it('serializes profile lists for compact editing', () => {
    expect(profileListValue(['pnpm lint', 'pnpm type-check'])).toBe('pnpm lint, pnpm type-check');
  });

  it('builds the API payload from form values', () => {
    expect(
      repoProfilePayloadFromForm({
        defaultBranch: '',
        stack: 'Go, Next.js',
        testCommands: 'go test ./...\npnpm lint',
        ciProvider: 'GitHub Actions',
        codingConventions: 'Use service layer',
        riskAreas: 'auth, migrations',
        summary: ' Split app. ',
      })
    ).toEqual({
      default_branch: 'main',
      stack: ['Go', 'Next.js'],
      test_commands: ['go test ./...', 'pnpm lint'],
      ci_provider: 'GitHub Actions',
      coding_conventions: ['Use service layer'],
      risk_areas: ['auth', 'migrations'],
      summary: 'Split app.',
    });
  });

  it('maps source metadata from API DTOs', () => {
    expect(
      repoProfileFromDTO({
        id: 1,
        repository_id: 'repo_123',
        default_branch: 'main',
        stack: ['Go'],
        test_commands: ['go test ./...'],
        ci_provider: 'github_actions',
        app_structure: ['api/internal/modules'],
        coding_conventions: [],
        risk_areas: [],
        summary: 'Indexed from GitHub.',
        source: 'github_tree',
        warnings: ['GitHub tree response was truncated; inferred profile may miss files.'],
        created_by: 1,
        last_indexed_at: '2026-05-29T12:00:00Z',
        created_at: '2026-05-29T12:00:00Z',
        updated_at: '2026-05-29T12:00:00Z',
      })
    ).toMatchObject({
      source: 'github_tree',
      warnings: ['GitHub tree response was truncated; inferred profile may miss files.'],
      lastIndexedAt: '2026-05-29T12:00:00Z',
    });
  });
});
