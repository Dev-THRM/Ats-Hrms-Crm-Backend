import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  PipelineStagesService,
  DEFAULT_ATS_PIPELINE_STAGES,
} from './pipeline-stages.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';

describe('PipelineStagesService', () => {
  let service: PipelineStagesService;
  let prisma: PrismaService;

  beforeEach(() => {
    prisma = {
      $transaction: vi.fn(async (cbOrArr) => {
        if (typeof cbOrArr === 'function') return cbOrArr(prisma);
        return cbOrArr;
      }),
      job: {
        findFirst: vi.fn(),
      },
      pipelineStage: {
        createMany: vi.fn(),
        findMany: vi.fn(),
        create: vi.fn(),
        update: vi.fn(),
      },
    } as unknown as PrismaService;

    service = new PipelineStagesService(prisma);
  });

  it('should create default stages when customStages are not provided', async () => {
    vi.spyOn(prisma.pipelineStage, 'createMany').mockResolvedValue({
      count: DEFAULT_ATS_PIPELINE_STAGES.length,
    });
    vi.spyOn(prisma.pipelineStage, 'findMany').mockResolvedValue(
      DEFAULT_ATS_PIPELINE_STAGES.map((name, i) => ({
        id: `st-${i}`,
        jobId: 'job-1',
        name,
        order: i,
      })) as any,
    );

    const result = await service.createStagesForJob('job-1');

    expect(result).toHaveLength(DEFAULT_ATS_PIPELINE_STAGES.length);
    expect(prisma.pipelineStage.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining([
        expect.objectContaining({ name: 'Applied', order: 0 }),
      ]),
    });
  });

  it('should create custom stages when provided', async () => {
    const custom = ['Application', 'Technical Interview', 'Executive Review'];
    vi.spyOn(prisma.pipelineStage, 'createMany').mockResolvedValue({ count: 3 });
    vi.spyOn(prisma.pipelineStage, 'findMany').mockResolvedValue(
      custom.map((name, i) => ({
        id: `st-${i}`,
        jobId: 'job-1',
        name,
        order: i,
      })) as any,
    );

    const result = await service.createStagesForJob('job-1', custom);

    expect(result).toHaveLength(3);
    expect(prisma.pipelineStage.createMany).toHaveBeenCalledWith({
      data: custom.map((name, index) => ({
        jobId: 'job-1',
        name,
        order: index,
      })),
    });
  });

  it('should throw NotFoundException if job not found when fetching stages', async () => {
    vi.spyOn(prisma.job, 'findFirst').mockResolvedValue(null);

    await expect(
      service.getStagesForJob('non-existent', 'org-1'),
    ).rejects.toThrow(NotFoundException);
  });

  it('should throw BadRequestException if reordering invalid stage id', async () => {
    vi.spyOn(prisma.job, 'findFirst').mockResolvedValue({
      id: 'job-1',
      organizationId: 'org-1',
      pipelineStages: [{ id: 'st-1', order: 0 }],
    } as any);

    await expect(
      service.reorderStages('job-1', 'org-1', [{ id: 'wrong-id', order: 1 }]),
    ).rejects.toThrow(BadRequestException);
  });
});
