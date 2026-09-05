import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard.js';
import { PlanGuard } from '../../../common/guards/plan.guard.js';
import { RolesGuard } from '../../../common/guards/roles.guard.js';
import { RequiresPlan } from '../../../common/decorators/requires-plan.decorator.js';
import { Permissions } from '../../../common/decorators/permissions.decorator.js';
import { CurrentUser } from '../../../common/decorators/current-user.decorator.js';
import { AppPlan } from '@prisma/client';
import { InterviewsService } from './interviews.service.js';
import { CreateInterviewDto } from './dto/create-interview.dto.js';
import { UpdateInterviewDto } from './dto/update-interview.dto.js';
import { QueryInterviewsDto } from './dto/query-interviews.dto.js';
import { SubmitInterviewFeedbackDto } from './dto/submit-feedback.dto.js';

@Controller('ats/interviews')
@UseGuards(JwtAuthGuard, PlanGuard, RolesGuard)
@RequiresPlan(AppPlan.ATS)
export class InterviewsController {
  constructor(private readonly interviewsService: InterviewsService) {}

  @Post()
  @Permissions('interviews:*')
  @HttpCode(HttpStatus.CREATED)
  async create(
    @CurrentUser('organizationId') orgId: string,
    @CurrentUser('userId') userId: string,
    @Body() dto: CreateInterviewDto,
  ) {
    const interview = await this.interviewsService.create(orgId, dto, userId);
    return {
      message: 'Interview scheduled successfully and WhatsApp notification dispatched',
      interview,
    };
  }

  @Get()
  @Permissions('interviews:read', 'interviews:*')
  async findAll(
    @CurrentUser('organizationId') orgId: string,
    @Query() query: QueryInterviewsDto,
  ) {
    return this.interviewsService.findAll(orgId, query);
  }

  @Post('reminders/trigger')
  @Permissions('interviews:*')
  @HttpCode(HttpStatus.OK)
  async triggerReminders(@CurrentUser('organizationId') orgId: string) {
    return this.interviewsService.triggerDueReminders(orgId);
  }

  @Get(':id')
  @Permissions('interviews:read', 'interviews:*')
  async findOne(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    const interview = await this.interviewsService.findOne(orgId, id);
    return { interview };
  }

  @Patch(':id')
  @Permissions('interviews:*')
  async update(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: UpdateInterviewDto,
  ) {
    const interview = await this.interviewsService.update(orgId, id, dto);
    return {
      message: 'Interview updated successfully',
      interview,
    };
  }

  @Post(':id/feedback')
  @Permissions('interviews:*')
  @HttpCode(HttpStatus.OK)
  async submitFeedback(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
    @Body() dto: SubmitInterviewFeedbackDto,
  ) {
    const interview = await this.interviewsService.submitFeedback(orgId, id, dto);
    return {
      message: 'Interview scorecard and feedback submitted successfully',
      interview,
    };
  }

  @Delete(':id')
  @Permissions('interviews:*')
  async remove(
    @CurrentUser('organizationId') orgId: string,
    @Param('id') id: string,
  ) {
    return this.interviewsService.remove(orgId, id);
  }
}
