import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../common/guards/plan.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../common/decorators/requires-plan.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  companyName: string;

  @IsString()
  @IsNotEmpty()
  contactName: string;

  @IsEmail()
  @IsNotEmpty()
  contactEmail: string;

  @IsNumber()
  dealValue: number;
}

@Controller('crm')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.CRM)
export class CrmController {
  @Get('dashboard')
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN, SystemRoleType.MANAGER)
  getDashboard(@CurrentUser('organizationId') orgId: string) {
    return {
      module: 'CRM',
      status: 'active',
      organizationId: orgId,
      message: 'Welcome to the CRM module dashboard',
    };
  }

  @Post('leads')
  @HttpCode(HttpStatus.CREATED)
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN, SystemRoleType.MANAGER)
  @Permissions('leads:create')
  createLead(
    @Body() dto: CreateLeadDto,
    @CurrentUser('userId') userId: string,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return {
      message: 'CRM Lead created successfully',
      lead: {
        id: `lead-${Date.now()}`,
        ...dto,
        organizationId: orgId,
        assignedTo: userId,
        stage: 'NEW_OPPORTUNITY',
        createdAt: new Date(),
      },
    };
  }
}
