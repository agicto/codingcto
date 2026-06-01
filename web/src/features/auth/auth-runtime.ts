import type { AuthRuntimeConfig } from '@/features/auth/types';

export interface AuthRuntimeView {
  label: string;
  description: string;
  credentialHint: string;
  tone: 'success' | 'warning';
}

export function authRuntimeView(config?: AuthRuntimeConfig): AuthRuntimeView {
  if (config?.projectApiReady) {
    return {
      label: 'Backend session',
      description:
        'This login exchanges credentials with the CodingCTO API and enables workspace, project, repository, and execution flows.',
      credentialHint: 'Use a seeded backend user, for example admin@example.com / admin123.',
      tone: 'success',
    };
  }

  return {
    label: 'Console-only mock session',
    description:
      'This login opens the console shell only. Project, repository, and execution APIs need backend-backed login.',
    credentialHint:
      'Set LUAS_AUTH_BACKEND_ENABLED=true for local product testing, then sign in again.',
    tone: 'warning',
  };
}
