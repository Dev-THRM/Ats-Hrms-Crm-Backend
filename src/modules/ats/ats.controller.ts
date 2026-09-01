import { Controller, Get, UseGuards } from '@nestjs/common';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../common/guards/plan.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../common/decorators/requires-plan.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

@Controller('ats')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.ATS)
export class AtsController {
  @Get('dashboard')
  @Roles(
    SystemRoleType.SUPER_ADMIN,
    SystemRoleType.ADMIN,
    SystemRoleType.RECRUITER,
    SystemRoleType.MANAGER,
  )
  getDashboard(@CurrentUser('organizationId') orgId: string) {
    return {
      module: 'ATS',
      status: 'active',
      organizationId: orgId,
      message: 'Welcome to the ATS module dashboard',
    };
  }
}
