import { ROUTES, buildRoute } from '@/constants/routes';

export function slugFromProjectName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

export function projectSpecForgeHref(projectId: number): string {
  return buildRoute(ROUTES.CONSOLE.PROJECT_SPECFORGE, { projectId });
}

export function projectOverviewHref(projectId: number): string {
  return buildRoute(ROUTES.CONSOLE.PROJECT, { projectId });
}

export function projectContextHref(projectId: number): string {
  return buildRoute(ROUTES.CONSOLE.PROJECT_CONTEXT, { projectId });
}

export function repositoryRoleLabel(role: string): string {
  switch (role) {
    case 'primary':
      return 'Primary';
    case 'dependency':
      return 'Dependency';
    case 'docs':
      return 'Docs';
    case 'infra':
      return 'Infra';
    default:
      return role;
  }
}
