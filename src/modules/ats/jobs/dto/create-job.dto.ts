import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsNumber,
  IsBoolean,
  IsArray,
  Min,
  ArrayMinSize,
} from 'class-validator';
import { Type } from 'class-transformer';
import { EmploymentType, JobStatus, ExperienceLevel } from '@prisma/client';

export class CreateJobDto {
  @IsString()
  @IsNotEmpty()
  title: string;

  @IsString()
  @IsOptional()
  description?: string = '';

  @IsString()
  @IsOptional()
  department?: string;

  @IsString()
  @IsOptional()
  location?: string;

  @IsEnum(EmploymentType)
  @IsOptional()
  employmentType?: EmploymentType = EmploymentType.FULL_TIME;

  @IsEnum(JobStatus)
  @IsOptional()
  status?: JobStatus = JobStatus.DRAFT;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  salaryMin?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  salaryMax?: number;

  @IsString()
  @IsOptional()
  salaryCurrency?: string = 'INR';

  @IsBoolean()
  @IsOptional()
  salaryVisible?: boolean = true;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  experienceMin?: number;

  @IsNumber()
  @IsOptional()
  @Min(0)
  @Type(() => Number)
  experienceMax?: number;

  @IsEnum(ExperienceLevel)
  @IsOptional()
  experienceLevel?: ExperienceLevel;

  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  @ArrayMinSize(1)
  pipelineStages?: string[];
}
