import { Module } from '@nestjs/common';
import { SharedModule } from '../shared/shared.module.js';
import { AtsController } from './ats.controller.js';
import { JobsController } from './jobs/jobs.controller.js';
import { JobsService } from './jobs/jobs.service.js';
import { PipelineStagesService } from './jobs/pipeline-stages.service.js';
import { CandidatesController } from './candidates/candidates.controller.js';
import { CandidatesService } from './candidates/candidates.service.js';
import { ApplicationsController } from './applications/applications.controller.js';
import { ApplicationsService } from './applications/applications.service.js';
import { ResumesController } from './resumes/resumes.controller.js';
import { ResumesService } from './resumes/resumes.service.js';

@Module({
  imports: [SharedModule],
  controllers: [
    AtsController,
    JobsController,
    CandidatesController,
    ApplicationsController,
    ResumesController,
  ],
  providers: [
    JobsService,
    PipelineStagesService,
    CandidatesService,
    ApplicationsService,
    ResumesService,
  ],
  exports: [
    JobsService,
    PipelineStagesService,
    CandidatesService,
    ApplicationsService,
    ResumesService,
  ],
})
export class AtsModule {}
