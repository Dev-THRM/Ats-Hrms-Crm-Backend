import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class UpdateApplicationStageDto {
  @IsString()
  @IsNotEmpty()
  stageId: string;

  @IsString()
  @IsOptional()
  rejectionReason?: string;
}
