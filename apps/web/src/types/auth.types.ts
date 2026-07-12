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
  scopes: Array<{ roleCode: string; scopeType: 'TENANT' | 'PORTFOLIO' | 'PROJECT'; scopeId: string | null }>;
  correlationId: string;
}

export interface ApiAuthContext {
  accessToken: string;
  tenantId: string;
}
