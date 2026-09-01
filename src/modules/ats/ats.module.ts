import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { AtsController } from './ats.controller.js';
import { JobsController } from './jobs/jobs.controller.js';
import { JobsService } from './jobs/jobs.service.js';
import { PipelineStagesService } from './jobs/pipeline-stages.service.js';

@Module({
  imports: [SharedModule],
  controllers: [AtsController, JobsController],
  providers: [JobsService, PipelineStagesService],
  exports: [JobsService, PipelineStagesService],
})
export class AtsModule {}
