import { Injectable, Inject } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntityPipelineType, Prisma } from '@prisma/client';

export interface StageTransitionParams {
  organizationId: string;
  entityType: EntityPipelineType;
  entityId: string;
  fromStageId?: string | null;
  fromStageName?: string | null;
  toStageId: string;
  toStageName: string;
  performedById?: string | null;
  reason?: string | null;
  notes?: string | null;
  metadata?: Record<string, any>;
}

@Injectable()
export class StageTransitionService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Records a stage transition audit log in the database.
   * Can be executed within an existing Prisma transaction or standalone.
   */
  async recordTransition(
    params: StageTransitionParams,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;

    return client.stageTransitionLog.create({
      data: {
        organizationId: params.organizationId,
        entityType: params.entityType,
        entityId: params.entityId,
        fromStageId: params.fromStageId ?? null,
        fromStageName: params.fromStageName ?? null,
        toStageId: params.toStageId,
        toStageName: params.toStageName,
        performedById: params.performedById ?? null,
        reason: params.reason ?? null,
        notes: params.notes ?? null,
        metadata: params.metadata ?? undefined,
      },
      include: {
        performedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Retrieves the full transition history and audit timeline for an entity (Application or CRM Deal/Lead).
   */
  async getEntityTimeline(
    organizationId: string,
    entityType: EntityPipelineType,
    entityId: string,
  ) {
    return this.prisma.stageTransitionLog.findMany({
      where: {
        organizationId,
        entityType,
        entityId,
      },
      orderBy: { createdAt: 'asc' },
      include: {
        performedBy: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
          },
        },
      },
    });
  }

  /**
   * Calculates stage velocity metrics (e.g. average dwell time in hours/days per stage).
   */
  async getStageDwellMetrics(
    organizationId: string,
    entityType: EntityPipelineType,
    entityId: string,
  ) {
    const logs = await this.getEntityTimeline(
      organizationId,
      entityType,
      entityId,
    );

    const timelineWithDwell = [];
    for (let i = 0; i < logs.length; i++) {
      const current = logs[i];
      const next = logs[i + 1];

      const durationMs = next
        ? new Date(next.createdAt).getTime() -
          new Date(current.createdAt).getTime()
        : Date.now() - new Date(current.createdAt).getTime();

      timelineWithDwell.push({
        ...current,
        dwellTimeSeconds: Math.floor(durationMs / 1000),
        dwellTimeHours: +(durationMs / (1000 * 60 * 60)).toFixed(2),
      });
    }

    return timelineWithDwell;
  }
}
