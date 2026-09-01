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
import { ResumeParserService } from './parser/resume-parser.service.js';
import { AiDetectorService } from './parser/ai-detector.service.js';
import { GeminiParserService } from './parser/gemini-parser.service.js';
import { ResumeProcessorWorker } from './parser/resume-processor.worker.js';

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
    ResumeParserService,
    AiDetectorService,
    GeminiParserService,
    ResumeProcessorWorker,
  ],
  exports: [
    JobsService,
    PipelineStagesService,
    CandidatesService,
    ApplicationsService,
    ResumesService,
    ResumeParserService,
    AiDetectorService,
    GeminiParserService,
  ],
})
export class AtsModule {}
