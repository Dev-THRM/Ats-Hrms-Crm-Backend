import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AuthModule } from './auth.module.js';
import { AuthService } from './auth.service.js';
import { PrismaModule } from '../shared/prisma/prisma.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { AppPlan } from '@prisma/client';

describe('Auth Integration Flow', () => {
  let authService: AuthService;
  let prisma: PrismaService;
  const testSlug = `test-org-${Date.now()}`;
  const testEmail = `owner-${Date.now()}@example.com`;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        PrismaModule,
        AuthModule,
      ],
    }).compile();

    authService = moduleRef.get<AuthService>(AuthService);
    prisma = moduleRef.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    // Clean up created test data
    const org = await prisma.organization.findUnique({
      where: { slug: testSlug },
    });
    if (org) {
      await prisma.organization.delete({
        where: { id: org.id },
      });
    }
    await prisma.$disconnect();
  });

  it(
    'should complete the entire multi-tenant auth lifecycle',
    async () => {
    // 1. Register
    const registerRes = await authService.register({
      organizationName: 'Integration Test Org',
      organizationSlug: testSlug,
      firstName: 'Alice',
      lastName: 'Smith',
      email: testEmail,
      password: 'StrongPassword123!',
      phone: '+1234567890',
    });

    expect(registerRes.user.email).toBe(testEmail.toLowerCase());
    expect(registerRes.user.organization.slug).toBe(testSlug);
    expect(registerRes.user.organization.activePlans).toContain(AppPlan.ATS);
    expect(registerRes.tokens.accessToken).toBeDefined();
    expect(registerRes.tokens.refreshToken).toBeDefined();

    // 2. Login
    const loginRes = await authService.login({
      email: testEmail,
      password: 'StrongPassword123!',
      organizationSlug: testSlug,
    });

    expect(loginRes.user.id).toBe(registerRes.user.id);
    expect(loginRes.tokens.accessToken).toBeDefined();

    // 3. Get Current User Profile (Me)
    const meRes = await authService.getMe(registerRes.user.id);
    expect(meRes.id).toBe(registerRes.user.id);
    expect(meRes.role.name).toBe('Super Admin');
    expect(meRes.role.permissions).toContain('*');

    // 4. Refresh Tokens
    const refreshedTokens = await authService.refreshTokens({
      refreshToken: loginRes.tokens.refreshToken,
    });

    expect(refreshedTokens.accessToken).toBeDefined();
    expect(refreshedTokens.refreshToken).toBeDefined();

    // 5. Logout
    const logoutRes = await authService.logout(registerRes.user.id);
    expect(logoutRes.message).toBe('Logged out successfully');

    // 6. Old Refresh Token should fail after logout
    await expect(
      authService.refreshTokens({
        refreshToken: refreshedTokens.refreshToken,
      }),
    ).rejects.toThrow();
  }, 20000);
});
