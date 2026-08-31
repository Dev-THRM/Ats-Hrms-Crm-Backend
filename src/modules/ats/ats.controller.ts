import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../common/guards/plan.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../common/decorators/requires-plan.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsNotEmpty()
  department: string;

  @IsString()
  @IsNotEmpty()
  location: string;

  @IsString()
  @IsOptional()
  description?: string;
}

@Controller('ats')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.ATS)
export class AtsController {
  @Get('dashboard')
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN, SystemRoleType.RECRUITER, SystemRoleType.MANAGER)
  getDashboard(@CurrentUser('organizationId') orgId: string) {
    return {
      module: 'ATS',
      status: 'active',
      organizationId: orgId,
      message: 'Welcome to the ATS module dashboard',
    };
  }

  @Post('jobs')
  @HttpCode(HttpStatus.CREATED)
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN, SystemRoleType.RECRUITER)
  @Permissions('jobs:create')
  createJob(
    @Body() dto: CreateJobDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return {
      message: 'Job posting created successfully',
      job: {
        id: `job-${Date.now()}`,
        ...dto,
        organizationId: orgId,
        createdBy: userId,
        status: 'PUBLISHED',
        createdAt: new Date(),
      },
    };
  }
}
