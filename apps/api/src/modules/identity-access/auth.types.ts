export interface ClientMetadata { ip: string; userAgent: string; correlationId: string }
export interface AuthContext { userId: string; tenantId: string; sessionId: string }

export interface VerifiedTokenClaims {
  sub: string;
  tid: string;
  sid: string;
  jti: string;
  typ: 'access' | 'refresh';
}

export interface AuthProfile {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshToken: string;
  user: { id: string; email: string; displayName: string };
  tenant: { id: string; code: string; name: string };
  correlationId: string;
}

export class InvalidAuthenticationError extends Error {}
export class AuthenticationRateLimitedError extends Error {}
