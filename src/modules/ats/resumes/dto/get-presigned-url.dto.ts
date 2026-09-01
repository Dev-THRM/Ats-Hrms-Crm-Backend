import { IsString, IsNotEmpty, IsOptional, Matches } from 'class-validator';

export class GetPresignedUrlDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/\.(pdf|docx|doc)$/i, {
    message: 'fileName must end in .pdf, .docx, or .doc',
  })
  fileName!: string;

  @IsString()
  @IsOptional()
  contentType?: string = 'application/pdf';

  @IsString()
  @IsOptional()
  candidateId?: string;

  @IsString()
  @IsOptional()
  jobId?: string;
}
