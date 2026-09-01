import { SetMetadata } from '@nestjs/common';
import { AppPlan } from '@prisma/client';

export const REQUIRES_PLAN_KEY = 'requiresPlan';
export const RequiresPlan = (...plans: (AppPlan | string)[]) =>
  SetMetadata(REQUIRES_PLAN_KEY, plans);
