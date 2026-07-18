export interface AuthUser {
  id: string;
  email: string;
  displayName: string;
}

export interface AuthTenant {
  id: string;
  code: string;
  name: string;
}

export interface LoginInput {
  tenantCode: string;
  email: string;
  password: string;
}

export interface AuthSession {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: AuthUser;
  tenant: AuthTenant;
  correlationId: string;
}

export interface AuthIdentity {
  user: AuthUser;
  tenant: AuthTenant;
  roles: string[];
  permissions: string[];
  scopes: AuthScope[];
  correlationId: string;
}

export type AuthScopeType = 'TENANT' | 'PORTFOLIO' | 'PROJECT' | 'PACKAGE';

export interface AuthScope {
  roleCode: string;
  permissions: string[];
  scopeType: AuthScopeType;
  scopeId: string | null;
}

export interface ApiAuthContext {
  accessToken: string;
  tenantId: string;
}
