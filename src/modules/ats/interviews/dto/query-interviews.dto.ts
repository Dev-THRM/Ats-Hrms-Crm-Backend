import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { InterviewStatus, InterviewType } from '@prisma/client';

export class QueryInterviewsDto {
  @IsString()
  @IsOptional()
  applicationId?: string;

  @IsString()
  @IsOptional()
  candidateId?: string;

  @IsString()
  @IsOptional()
  jobId?: string;

  @IsString()
  @IsOptional()
  interviewerId?: string;

  @IsEnum(InterviewStatus)
  @IsOptional()
  status?: InterviewStatus;

  @IsEnum(InterviewType)
  @IsOptional()
  type?: InterviewType;

  @IsDateString()
  @IsOptional()
  from?: string;

  @IsDateString()
  @IsOptional()
  to?: string;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @IsNumber()
  @IsOptional()
  @Min(1)
  @Type(() => Number)
  limit?: number = 20;
}
