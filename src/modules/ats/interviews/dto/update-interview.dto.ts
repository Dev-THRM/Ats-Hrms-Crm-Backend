import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InterviewType, InterviewStatus } from '@prisma/client';

export class UpdateInterviewDto {
  @IsString()
  @IsOptional()
  interviewerId?: string;

  @IsString()
  @IsOptional()
  title?: string;

  @IsEnum(InterviewType)
  @IsOptional()
  type?: InterviewType;

  @IsEnum(InterviewStatus)
  @IsOptional()
  status?: InterviewStatus;

  @IsDateString()
  @IsOptional()
  scheduledAt?: string;

  @IsNumber()
  @IsOptional()
  @Min(15)
  @Max(240)
  @Type(() => Number)
  durationMinutes?: number;

  @IsString()
  @IsOptional()
  timezone?: string;

  @IsString()
  @IsOptional()
  meetingLink?: string;

  @IsString()
  @IsOptional()
  locationNotes?: string;
}
