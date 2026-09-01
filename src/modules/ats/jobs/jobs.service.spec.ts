import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobsService } from './jobs.service.js';
import { PipelineStagesService } from './pipeline-stages.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { EmploymentType, JobStatus } from '@prisma/client';

describe('JobsService', () => {
  let service: JobsService;
  let prisma: PrismaService;
  let pipelineStagesService: PipelineStagesService;

  const mockOrgId = 'org-123';
  const mockUserId = 'user-456';

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn(async (cb) => cb(prisma)),
      job: {
        create: vi.fn(),
        findMany: vi.fn(),
        findFirst: vi.fn(),
        count: vi.fn(),
        update: vi.fn(),
        delete: vi.fn(),
      },
      pipelineStage: {
        createMany: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as PrismaService;

    pipelineStagesService = new PipelineStagesService(prisma);
    service = new JobsService(prisma, pipelineStagesService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a job and provision default pipeline stages', async () => {
      const createDto = {
        title: 'Senior Backend Engineer',
        description: 'Lead our backend architecture',
        department: 'Engineering',
        location: 'Remote',
        employmentType: EmploymentType.FULL_TIME,
        salaryMin: 1200000,
        salaryMax: 2000000,
      };

      const createdJobMock = {
        id: 'job-1',
        organizationId: mockOrgId,
        createdById: mockUserId,
        ...createDto,
        status: JobStatus.DRAFT,
      };

      const createdStagesMock = [
        { id: 'st-1', jobId: 'job-1', name: 'Applied', order: 0 },
        { id: 'st-2', jobId: 'job-1', name: 'Screening', order: 1 },
      ];

      vi.spyOn(prisma.job, 'create').mockResolvedValue(createdJobMock as any);
      vi.spyOn(pipelineStagesService, 'createStagesForJob').mockResolvedValue(
        createdStagesMock as any,
      );

      const result = await service.create(mockOrgId, mockUserId, createDto);

      expect(result.id).toBe('job-1');
      expect(result.pipelineStages).toEqual(createdStagesMock);
      expect(prisma.job.create).toHaveBeenCalled();
    });

    it('should throw BadRequestException if salaryMin > salaryMax', async () => {
      const invalidDto = {
        title: 'Developer',
        description: 'Desc',
        salaryMin: 50000,
        salaryMax: 30000,
      };

      await expect(
        service.create(mockOrgId, mockUserId, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });

    it('should throw BadRequestException if experienceMin > experienceMax', async () => {
      const invalidDto = {
        title: 'Developer',
        description: 'Desc',
        experienceMin: 5,
        experienceMax: 2,
      };

      await expect(
        service.create(mockOrgId, mockUserId, invalidDto),
      ).rejects.toThrow(BadRequestException);
    });
  });

  describe('findAll', () => {
    it('should return paginated list of jobs for an organization', async () => {
      vi.spyOn(prisma.job, 'count').mockResolvedValue(1);
      vi.spyOn(prisma.job, 'findMany').mockResolvedValue([
        {
          id: 'job-1',
          title: 'Full Stack Engineer',
          organizationId: mockOrgId,
          createdBy: { id: mockUserId, firstName: 'John', lastName: 'Doe', email: 'john@example.com' },
          _count: { pipelineStages: 6 },
        } as any,
      ]);

      const result = await service.findAll(mockOrgId, { page: 1, limit: 10 });

      expect(result.meta.total).toBe(1);
      expect(result.data).toHaveLength(1);
      expect(result.data[0].id).toBe('job-1');
    });
  });

  describe('findOne', () => {
    it('should return job with pipeline stages', async () => {
      vi.spyOn(prisma.job, 'findFirst').mockResolvedValue({
        id: 'job-1',
        organizationId: mockOrgId,
        title: 'DevOps Engineer',
        pipelineStages: [{ id: 'st-1', name: 'Applied', order: 0 }],
      } as any);

      const result = await service.findOne(mockOrgId, 'job-1');

      expect(result.id).toBe('job-1');
      expect(result.title).toBe('DevOps Engineer');
    });

    it('should throw NotFoundException if job does not exist or belongs to another tenant', async () => {
      vi.spyOn(prisma.job, 'findFirst').mockResolvedValue(null);

      await expect(service.findOne(mockOrgId, 'non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  describe('updateStatus', () => {
    it('should update job status (e.g. publish)', async () => {
      vi.spyOn(prisma.job, 'findFirst').mockResolvedValue({
        id: 'job-1',
        organizationId: mockOrgId,
        status: JobStatus.DRAFT,
      } as any);

      vi.spyOn(prisma.job, 'update').mockResolvedValue({
        id: 'job-1',
        status: JobStatus.OPEN,
        pipelineStages: [],
      } as any);

      const result = await service.updateStatus(
        mockOrgId,
        'job-1',
        JobStatus.OPEN,
      );

      expect(result.status).toBe(JobStatus.OPEN);
      expect(prisma.job.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'job-1' },
          data: { status: JobStatus.OPEN },
        }),
      );
    });
  });

  describe('remove', () => {
    it('should remove a job posting', async () => {
      vi.spyOn(prisma.job, 'findFirst').mockResolvedValue({
        id: 'job-1',
        organizationId: mockOrgId,
      } as any);
      vi.spyOn(prisma.job, 'delete').mockResolvedValue({ id: 'job-1' } as any);

      const result = await service.remove(mockOrgId, 'job-1');

      expect(result.id).toBe('job-1');
      expect(prisma.job.delete).toHaveBeenCalledWith({
        where: { id: 'job-1' },
      });
    });
  });
});
