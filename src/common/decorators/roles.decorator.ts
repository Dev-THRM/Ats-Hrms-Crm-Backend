import { SetMetadata } from '@nestjs/common';
import { SystemRoleType } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const Roles = (...roles: (SystemRoleType | string)[]) =>
  SetMetadata(ROLES_KEY, roles);
