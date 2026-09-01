import { Injectable, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { Prisma } from '@prisma/client';

export const DEFAULT_ATS_PIPELINE_STAGES = [
  'Applied',
  'Screening',
  'Interview',
  'Offer',
  'Hired',
  'Rejected',
];

@Injectable()
export class PipelineStagesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Provisions default or custom pipeline stages for a newly created job.
   */
  async createStagesForJob(
    jobId: string,
    customStages?: string[],
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const stageNames =
      customStages && customStages.length > 0
        ? customStages
        : DEFAULT_ATS_PIPELINE_STAGES;

    const stagesData = stageNames.map((name, index) => ({
      jobId,
      name: name.trim(),
      order: index,
    }));

    await client.pipelineStage.createMany({
      data: stagesData,
    });

    return client.pipelineStage.findMany({
      where: { jobId },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Retrieves pipeline stages for a specific job scoped to tenant organization.
   */
  async getStagesForJob(jobId: string, organizationId: string) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId },
      include: {
        pipelineStages: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    return job.pipelineStages;
  }

  /**
   * Reorders pipeline stages for a job avoiding unique constraint collision.
   */
  async reorderStages(
    jobId: string,
    organizationId: string,
    stageOrders: { id: string; order: number }[],
  ) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId },
      include: { pipelineStages: true },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const existingStageIds = new Set(job.pipelineStages.map((s) => s.id));
    for (const item of stageOrders) {
      if (!existingStageIds.has(item.id)) {
        throw new BadRequestException(
          `Stage ID [${item.id}] does not belong to this job`,
        );
      }
    }

    // Execute stage reordering transactionally using a temporary negative offset to avoid unique collision
    await this.prisma.$transaction(async (tx) => {
      // Pass 1: Set temporary negative order
      for (let i = 0; i < stageOrders.length; i++) {
        await tx.pipelineStage.update({
          where: { id: stageOrders[i].id },
          data: { order: -(i + 1) },
        });
      }
      // Pass 2: Set final requested order
      for (const item of stageOrders) {
        await tx.pipelineStage.update({
          where: { id: item.id },
          data: { order: item.order },
        });
      }
    });

    return this.prisma.pipelineStage.findMany({
      where: { jobId },
      orderBy: { order: 'asc' },
    });
  }

  /**
   * Adds a new custom stage to a job pipeline.
   */
  async addStage(
    jobId: string,
    organizationId: string,
    name: string,
    order?: number,
  ) {
    const job = await this.prisma.job.findFirst({
      where: { id: jobId, organizationId },
      include: { pipelineStages: { orderBy: { order: 'desc' } } },
    });

    if (!job) {
      throw new NotFoundException('Job not found');
    }

    const nextOrder =
      order !== undefined
        ? order
        : job.pipelineStages.length > 0
          ? job.pipelineStages[0].order + 1
          : 0;

    return this.prisma.pipelineStage.create({
      data: {
        jobId,
        name: name.trim(),
        order: nextOrder,
      },
    });
  }
}
