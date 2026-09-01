import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ApplicationsService } from './applications.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { PipelineStagesService } from '../jobs/pipeline-stages.service.js';
import { StageTransitionService } from '../../shared/pipelines/stage-transition.service.js';
import { ConflictException, NotFoundException, BadRequestException } from '@nestjs/common';
import { ApplicationStatus } from '@prisma/client';

describe('ApplicationsService', () => {
  let service: ApplicationsService;
  let prisma: PrismaService;
  let candidatesService: CandidatesService;
  let pipelineStagesService: PipelineStagesService;
  let stageTransitionService: StageTransitionService;

  const mockOrgId = 'org-123';

  beforeEach(() => {
    prisma = {
      job: {
        findFirst: vi.fn(),
      },
      candidate: {
        findFirst: vi.fn(),
      },
      application: {
        findUnique: vi.fn(),
        findFirst: vi.fn(),
        findMany: vi.fn(),
        count: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
    } as unknown as PrismaService;

    candidatesService = {
      findOrCreate: vi.fn(),
    } as unknown as CandidatesService;

    pipelineStagesService = {
      createStagesForJob: vi.fn(),
    } as unknown as PipelineStagesService;

    stageTransitionService = {
      recordTransition: vi.fn().mockResolvedValue({ id: 'log-1' }),
      getEntityTimeline: vi.fn().mockResolvedValue([]),
    } as unknown as StageTransitionService;

    service = new ApplicationsService(
      prisma,
      candidatesService,
      pipelineStagesService,
      stageTransitionService,
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create an application successfully', async () => {
      const mockJob = {
        id: 'job-1',
        title: 'Backend Engineer',
        status: 'OPEN',
        pipelineStages: [{ id: 'st-1', name: 'Applied', order: 0 }],
      };

      vi.spyOn(prisma.job, 'findFirst').mockResolvedValue(mockJob as any);
      vi.spyOn(candidatesService, 'findOrCreate').mockResolvedValue({
        id: 'cand-1',
        email: 'john@example.com',
      } as any);
      vi.spyOn(prisma.application, 'findUnique').mockResolvedValue(null);
      vi.spyOn(prisma.application, 'create').mockResolvedValue({
        id: 'app-1',
        jobId: 'job-1',
        candidateId: 'cand-1',
        currentStageId: 'st-1',
        status: ApplicationStatus.ACTIVE,
      } as any);

      const result = await service.create(mockOrgId, {
        jobId: 'job-1',
        candidate: {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        },
      });

      expect(result.id).toBe('app-1');
      expect(result.currentStageId).toBe('st-1');
      expect(stageTransitionService.recordTransition).toHaveBeenCalled();
    });

    it('should throw ConflictException if candidate already applied', async () => {
      const mockJob = {
        id: 'job-1',
        status: 'OPEN',
        pipelineStages: [{ id: 'st-1', name: 'Applied', order: 0 }],
      };

      vi.spyOn(prisma.job, 'findFirst').mockResolvedValue(mockJob as any);
      vi.spyOn(candidatesService, 'findOrCreate').mockResolvedValue({
        id: 'cand-1',
      } as any);
      vi.spyOn(prisma.application, 'findUnique').mockResolvedValue({
        id: 'existing-app',
      } as any);

      await expect(
        service.create(mockOrgId, {
          jobId: 'job-1',
          candidate: {
            firstName: 'John',
            lastName: 'Doe',
            email: 'john@example.com',
          },
        }),
      ).rejects.toThrow(ConflictException);
    });

    it('should throw BadRequestException if job is closed', async () => {
      vi.spyOn(prisma.job, 'findFirst').mockResolvedValue({
        id: 'job-1',
        status: 'CLOSED',
      } as any);

      await expect(
        service.create(mockOrgId, {
          jobId: 'job-1',
          candidateId: 'cand-1',
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('moveToStage', () => {
    it('should move application to a new stage', async () => {
      const mockApp = {
        id: 'app-1',
        status: ApplicationStatus.ACTIVE,
        job: {
          title: 'Full Stack',
          pipelineStages: [
            { id: 'st-1', name: 'Applied', order: 0 },
            { id: 'st-2', name: 'Interview', order: 1 },
          ],
        },
        currentStage: { id: 'st-1', name: 'Applied' },
      };

      vi.spyOn(service, 'findOne').mockResolvedValue(mockApp as any);
      vi.spyOn(prisma.application, 'update').mockResolvedValue({
        id: 'app-1',
        currentStageId: 'st-2',
        status: ApplicationStatus.ACTIVE,
      } as any);

      const result = await service.moveToStage(mockOrgId, 'app-1', 'st-2');

      expect(result.currentStageId).toBe('st-2');
      expect(stageTransitionService.recordTransition).toHaveBeenCalled();
    });

    it('should auto-mark status as REJECTED if moved to Rejected stage', async () => {
      const mockApp = {
        id: 'app-1',
        status: ApplicationStatus.ACTIVE,
        job: {
          title: 'Full Stack',
          pipelineStages: [
            { id: 'st-1', name: 'Applied', order: 0 },
            { id: 'st-reject', name: 'Rejected', order: 5 },
          ],
        },
        currentStage: { id: 'st-1', name: 'Applied' },
      };

      vi.spyOn(service, 'findOne').mockResolvedValue(mockApp as any);
      vi.spyOn(prisma.application, 'update').mockResolvedValue({
        id: 'app-1',
        currentStageId: 'st-reject',
        status: ApplicationStatus.REJECTED,
      } as any);

      const result = await service.moveToStage(mockOrgId, 'app-1', 'st-reject');

      expect(result.status).toBe(ApplicationStatus.REJECTED);
      expect(stageTransitionService.recordTransition).toHaveBeenCalled();
    });
  });
});
