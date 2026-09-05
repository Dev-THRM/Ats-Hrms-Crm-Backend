import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  UploadedFile,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PublicCareerService } from './public-career.service.js';
import { PublicApplyJobDto } from './dto/public-apply.dto.js';

@Controller('ats/public/jobs')
export class PublicCareerController {
  constructor(private readonly publicCareerService: PublicCareerService) {}

  /**
   * Public endpoint to list all open positions for an organization.
   */
  @Get(':orgSlug')
  async getPublicJobs(@Param('orgSlug') orgSlug: string) {
    return this.publicCareerService.getPublicJobs(orgSlug);
  }

  /**
   * Public endpoint to view a specific open job posting.
   */
  @Get(':orgSlug/:jobId')
  async getPublicJobDetails(
    @Param('orgSlug') orgSlug: string,
    @Param('jobId') jobId: string,
  ) {
    return this.publicCareerService.getPublicJobDetails(orgSlug, jobId);
  }

  /**
   * Public endpoint for candidate direct application submission with resume upload.
   */
  @Post(':orgSlug/:jobId/apply')
  @HttpCode(HttpStatus.CREATED)
  @UseInterceptors(FileInterceptor('file'))
  async applyPublic(
    @Param('orgSlug') orgSlug: string,
    @Param('jobId') jobId: string,
    @Body() dto: PublicApplyJobDto,
    @UploadedFile(
      new ParseFilePipe({
        fileIsRequired: false,
        validators: [
          new MaxFileSizeValidator({ maxSize: 10 * 1024 * 1024 }), // 10MB
          new FileTypeValidator({
            fileType: /(pdf|docx|msword|document)/,
          }),
        ],
      }),
    )
    file?: Express.Multer.File,
  ) {
    return this.publicCareerService.applyPublic(orgSlug, jobId, dto, file);
  }
}
