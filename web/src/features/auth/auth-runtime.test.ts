import { describe, expect, it } from 'vitest';

import { authRuntimeView } from '@/features/auth/auth-runtime';

describe('authRuntimeView', () => {
  it('describes backend-backed login as project ready', () => {
    const view = authRuntimeView({
      backendAuthEnabled: true,
      projectApiReady: true,
    });

    expect(view.label).toBe('Backend session');
    expect(view.tone).toBe('success');
    expect(view.description).toContain('workspace');
  });

  it('warns when login only opens the console shell', () => {
    const view = authRuntimeView({
      backendAuthEnabled: false,
      projectApiReady: false,
    });

    expect(view.label).toBe('Console-only mock session');
    expect(view.tone).toBe('warning');
    expect(view.credentialHint).toContain('LUAS_AUTH_BACKEND_ENABLED=true');
  });
});
