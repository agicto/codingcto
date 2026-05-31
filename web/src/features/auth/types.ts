export type AuthRole = 'admin' | 'member';

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  role: AuthRole;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
}

export interface AuthResponse {
  user: AuthUser;
  session?: AuthSessionInfo;
}

export interface AuthSessionInfo {
  mode: 'backend' | 'mock';
  projectApiReady: boolean;
}

export interface AuthRuntimeConfig {
  backendAuthEnabled: boolean;
  projectApiReady: boolean;
}
