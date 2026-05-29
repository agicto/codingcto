import { describe, expect, it } from 'vitest';

import {
  parseProfileList,
  profileListValue,
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
});
