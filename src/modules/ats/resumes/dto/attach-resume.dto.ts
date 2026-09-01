import { IsString, IsNotEmpty, IsOptional, IsUrl } from 'class-validator';

export class AttachResumeDto {
  @IsString()
  @IsNotEmpty()
  candidateId!: string;

  @IsString()
  @IsNotEmpty()
  resumeUrl!: string;

  @IsString()
  @IsOptional()
  applicationId?: string;

  @IsString()
  @IsOptional()
  key?: string;
}
