import { AppPlan } from '@prisma/client';

export interface UserSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl: string | null;
  role: {
    id: string;
    name: string;
    type: string;
    permissions: string[];
  };
  organization: {
    id: string;
    name: string;
    slug: string;
    activePlans: AppPlan[];
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // in seconds
}

export interface AuthResponse {
  user: UserSummary;
  tokens: AuthTokens;
}
