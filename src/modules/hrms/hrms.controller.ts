import { Controller, Get, Post, Body, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';
import { AppPlan, SystemRoleType } from '@prisma/client';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../common/guards/plan.guard.js';
import { RolesGuard } from '../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../common/decorators/requires-plan.decorator.js';
import { Roles } from '../../common/decorators/roles.decorator.js';
import { Permissions } from '../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../common/decorators/current-user.decorator.js';

export class CreateEmployeeDto {
  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsNotEmpty()
  lastName: string;

  @IsEmail()
  @IsNotEmpty()
  workEmail: string;

  @IsString()
  @IsNotEmpty()
  department: string;

  @IsString()
  @IsNotEmpty()
  designation: string;
}

@Controller('hrms')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.HRMS)
export class HrmsController {
  @Get('dashboard')
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN, SystemRoleType.MANAGER)
  getDashboard(@CurrentUser('organizationId') orgId: string) {
    return {
      module: 'HRMS',
      status: 'active',
      organizationId: orgId,
      message: 'Welcome to the HRMS module dashboard',
    };
  }

  @Post('employees')
  @HttpCode(HttpStatus.CREATED)
  @Roles(SystemRoleType.SUPER_ADMIN, SystemRoleType.ADMIN)
  @Permissions('employees:create')
  createEmployee(
    @Body() dto: CreateEmployeeDto,
    @CurrentUser('organizationId') orgId: string,
  ) {
    return {
      message: 'Employee record created successfully',
      employee: {
        id: `emp-${Date.now()}`,
        ...dto,
        organizationId: orgId,
        employmentStatus: 'FULL_TIME',
        joiningDate: new Date(),
      },
    };
  }
}
