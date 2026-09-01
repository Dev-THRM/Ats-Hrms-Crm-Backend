import { describe, it, expect, beforeEach, vi } from 'vitest';
import { JobsController } from './jobs.controller.js';
import { JobsService } from './jobs.service.js';
import { PipelineStagesService } from './pipeline-stages.service.js';
import { JobStatus, EmploymentType } from '@prisma/client';

describe('JobsController', () => {
  let controller: JobsController;
  let jobsService: JobsService;
  let pipelineStagesService: PipelineStagesService;

  const mockOrgId = 'org-123';
  const mockUserId = 'user-456';

  beforeEach(() => {
    jobsService = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      updateStatus: vi.fn(),
      remove: vi.fn(),
    } as unknown as JobsService;

    pipelineStagesService = {
      getStagesForJob: vi.fn(),
      reorderStages: vi.fn(),
    } as unknown as PipelineStagesService;

    controller = new JobsController(jobsService, pipelineStagesService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should call create on jobsService', async () => {
    const dto = {
      title: 'Frontend Engineer',
      description: 'React expert',
      employmentType: EmploymentType.FULL_TIME,
    };

    vi.spyOn(jobsService, 'create').mockResolvedValue({
      id: 'job-1',
      organizationId: mockOrgId,
      ...dto,
    } as any);

    const result = await controller.create(mockOrgId, mockUserId, dto);
    expect(result.job.id).toBe('job-1');
    expect(result.message).toBe('Job posting created successfully');
    expect(jobsService.create).toHaveBeenCalledWith(mockOrgId, mockUserId, dto);
  });

  it('should call findAll on jobsService', async () => {
    vi.spyOn(jobsService, 'findAll').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });

    const result = await controller.findAll(mockOrgId, {});
    expect(result.data).toEqual([]);
    expect(jobsService.findAll).toHaveBeenCalledWith(mockOrgId, {});
  });

  it('should call findOne on jobsService', async () => {
    vi.spyOn(jobsService, 'findOne').mockResolvedValue({ id: 'job-1' } as any);

    const result = await controller.findOne(mockOrgId, 'job-1');
    expect(result.id).toBe('job-1');
    expect(jobsService.findOne).toHaveBeenCalledWith(mockOrgId, 'job-1');
  });

  it('should call updateStatus on jobsService', async () => {
    vi.spyOn(jobsService, 'updateStatus').mockResolvedValue({
      id: 'job-1',
      status: JobStatus.OPEN,
    } as any);

    const result = await controller.updateStatus(mockOrgId, 'job-1', {
      status: JobStatus.OPEN,
    });
    expect(result.status).toBe(JobStatus.OPEN);
    expect(jobsService.updateStatus).toHaveBeenCalledWith(
      mockOrgId,
      'job-1',
      JobStatus.OPEN,
    );
  });
});
