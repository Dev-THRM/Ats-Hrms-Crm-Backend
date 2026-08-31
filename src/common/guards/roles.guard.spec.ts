import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RolesGuard } from './roles.guard.js';
import { SystemRoleType } from '@prisma/client';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  const createMockContext = (user: any): ExecutionContext => {
    return {
      getHandler: () => vi.fn(),
      getClass: () => vi.fn(),
      switchToHttp: () => ({
        getRequest: () => ({ user }),
      }),
    } as unknown as ExecutionContext;
  };

  it('should allow access if no roles or permissions are required', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    const context = createMockContext({ roleType: SystemRoleType.EMPLOYEE });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow Super Admin full access regardless of required role/permission', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'roles') return [SystemRoleType.ADMIN];
      return undefined;
    });

    const context = createMockContext({
      roleType: SystemRoleType.SUPER_ADMIN,
      permissions: ['*'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should allow access if user has matching role', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'roles') return [SystemRoleType.RECRUITER, SystemRoleType.ADMIN];
      return undefined;
    });

    const context = createMockContext({
      roleType: SystemRoleType.RECRUITER,
      permissions: ['jobs:read'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should throw ForbiddenException if user lacks required role', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'roles') return [SystemRoleType.ADMIN];
      return undefined;
    });

    const context = createMockContext({
      roleType: SystemRoleType.EMPLOYEE,
      permissions: ['profile:read'],
    });

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should match granular permissions and domain wildcards', () => {
    vi.spyOn(reflector, 'getAllAndOverride').mockImplementation((key) => {
      if (key === 'permissions') return ['jobs:create'];
      return undefined;
    });

    // User has wildcard for the jobs domain
    const context = createMockContext({
      roleType: SystemRoleType.RECRUITER,
      permissions: ['jobs:*'],
    });

    expect(guard.canActivate(context)).toBe(true);
  });
});
