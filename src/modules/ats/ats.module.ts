import { Module } from '@nestjs/common';
import { PipelineStagesService } from './jobs/pipeline-stages.service.js';
import { AtsController } from './ats.controller.js';

@Module({
  controllers: [AtsController],
  providers: [PipelineStagesService],
  exports: [PipelineStagesService],
})
export class AtsModule {}
