export interface JwtPayload {
  sub: string; // User ID
  email: string;
  organizationId: string;
  roleId: string;
  roleType: string;
  permissions: string[];
  activePlans: string[];
}

export interface JwtRefreshPayload {
  sub: string;
  organizationId: string;
}
