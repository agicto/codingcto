/**
 * Application route constants
 * Central place to manage all application routes
 */

export const ROUTES = {
  // Public site routes
  SITE: {
    HOME: '/',
  },

  // Auth routes
  AUTH: {
    LOGIN: '/login',
    REGISTER: '/register',
  },

  // Console (Admin) routes
  CONSOLE: {
    HOME: '/console',
    PROJECTS: '/console/projects',
    PROJECT: '/console/projects/:projectId',
    PROJECT_CONTEXT: '/console/projects/:projectId/context',
    PROJECT_REQUIREMENT_NEW: '/console/projects/:projectId/requirements/new',
    PROJECT_PLAN: '/console/projects/:projectId/plans/:planId',
    PROJECT_PR: '/console/projects/:projectId/prs/:prNodeId',
    PROJECT_SPECFORGE: '/console/projects/:projectId/codingcto',
    PROJECT_DEEPWIKI: '/console/projects/:projectId/deepwiki',
    PROJECT_DEEPWIKI_REPOSITORY: '/console/projects/:projectId/deepwiki/:repositoryId',
    PROJECT_DEEPWIKI_PAGE: '/console/projects/:projectId/deepwiki/:repositoryId/pages/:slug',
    SPECFORGE: '/console/codingcto',
    DEEPWIKI: '/console/deepwiki',
    EXPERTS: '/console/experts',
    AGENTS: '/console/agents',
    AGENT: '/console/agents/:agentId',
    SKILLS: '/console/skills',
    SETTINGS: '/console/settings',
  },

  // Internal devtools and demos
  DEVTOOLS: {
    STYLEGUIDE: '/styleguide',
    I18N_TEST: '/i18n-test',
  },
} as const;

// Type-safe route utility functions
type SiteRoutes = keyof typeof ROUTES.SITE;
type AuthRoutes = keyof typeof ROUTES.AUTH;
type ConsoleRoutes = keyof typeof ROUTES.CONSOLE;
type DevtoolsRoutes = keyof typeof ROUTES.DEVTOOLS;

// Type helpers for route segments
export type SiteRoute = (typeof ROUTES.SITE)[SiteRoutes];
export type AuthRoute = (typeof ROUTES.AUTH)[AuthRoutes];
export type ConsoleRoute = (typeof ROUTES.CONSOLE)[ConsoleRoutes];
export type DevtoolsRoute = (typeof ROUTES.DEVTOOLS)[DevtoolsRoutes];

// Dynamic route builder with type checking
export function buildRoute(basePath: string, params?: Record<string, string | number>): string {
  let route = basePath;

  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      route = route.replace(`:${key}`, String(value));
    });
  }

  return route;
}

// Strongly typed navigation helpers
export function getSiteRoute(route: SiteRoutes): string {
  return ROUTES.SITE[route];
}

export function getAuthRoute(route: AuthRoutes): string {
  return ROUTES.AUTH[route];
}

export function getConsoleRoute(route: ConsoleRoutes): string {
  return ROUTES.CONSOLE[route];
}

export function getDevtoolsRoute(route: DevtoolsRoutes): string {
  return ROUTES.DEVTOOLS[route];
}
