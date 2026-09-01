import {
  IsString,
  IsNotEmpty,
  IsOptional,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { CreateCandidateDto } from '../../candidates/dto/create-candidate.dto.js';

export class CreateApplicationDto {
  @IsString()
  @IsNotEmpty()
  jobId: string;

  @IsString()
  @IsOptional()
  candidateId?: string;

  @ValidateNested()
  @Type(() => CreateCandidateDto)
  @IsOptional()
  candidate?: CreateCandidateDto;

  @IsString()
  @IsOptional()
  stageId?: string;

  @IsString()
  @IsOptional()
  coverLetter?: string;

  @IsOptional()
  metadata?: Record<string, any>;
}
