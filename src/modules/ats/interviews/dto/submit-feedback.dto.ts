import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';

export class SubmitInterviewFeedbackDto {
  @IsNumber()
  @IsNotEmpty()
  @Min(1)
  @Max(5)
  @Type(() => Number)
  rating: number;

  @IsString()
  @IsOptional()
  notes?: string;
}
