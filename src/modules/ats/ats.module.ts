import { Module } from '@nestjs/common';
import { PipelineStagesService } from './jobs/pipeline-stages.service.js';

@Module({
  providers: [PipelineStagesService]
})
export class AtsModule {}
