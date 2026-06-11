import type { ProjectReadinessDTO } from './services/project-service';
import {
  projectContextHref,
  projectRequirementNewHref,
  projectSpecForgeHref,
} from './project-utils';

export interface ProjectReadinessDecision {
  title: string;
  description: string;
  actionLabel: string;
  actionHref: string;
  tone: 'warning' | 'info' | 'success';
}

export function projectReadinessDecision(
  projectId: number,
  readiness?: ProjectReadinessDTO
): ProjectReadinessDecision {
  switch (readiness?.next_step) {
    case 'bind_repository':
      return {
        title: 'Bind a primary repository',
        description: readiness.summary,
        actionLabel: 'Bind repository',
        actionHref: '#repository-binding',
        tone: 'warning',
      };
    case 'configure_github':
      return {
        title: 'Finish GitHub setup',
        description: readiness.summary,
        actionLabel: 'Review GitHub setup',
        actionHref: projectContextHref(projectId),
        tone: 'warning',
      };
    case 'review_context':
      return {
        title: 'Review project context',
        description: readiness.summary,
        actionLabel: 'Review context',
        actionHref: projectContextHref(projectId),
        tone: 'info',
      };
    case 'connect_runtime':
      return {
        title: 'Connect a local runtime',
        description: readiness.summary,
        actionLabel: 'Open CodingCTO',
        actionHref: projectSpecForgeHref(projectId),
        tone: 'info',
      };
    case 'add_skills':
      return {
        title: 'Attach project guidance',
        description: readiness.summary,
        actionLabel: 'Open context',
        actionHref: projectContextHref(projectId),
        tone: 'info',
      };
    case 'configure_expert_policy':
      return {
        title: 'Persist expert policy',
        description: readiness.summary,
        actionLabel: 'Open context',
        actionHref: `${projectContextHref(projectId)}#expert-policy`,
        tone: 'info',
      };
    case 'create_requirement':
      return {
        title: 'Create a requirement',
        description: readiness.summary,
        actionLabel: 'Create requirement',
        actionHref: projectRequirementNewHref(projectId),
        tone: 'success',
      };
    default:
      return {
        title: 'Review project setup',
        description:
          readiness?.summary || 'Check project readiness before generating or dispatching work.',
        actionLabel: 'Open context',
        actionHref: projectContextHref(projectId),
        tone: 'info',
      };
  }
}

export function projectReadinessBadgeClass(status?: string) {
  switch (status) {
    case 'ready':
      return 'border-success/30 text-success';
    case 'blocked':
      return 'border-warning/30 text-warning';
    default:
      return 'border-primary/30 text-primary';
  }
}
