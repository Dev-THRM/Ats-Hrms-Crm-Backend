import { describe, it, expect, beforeEach, vi } from 'vitest';
import { StageTransitionService } from './stage-transition.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { EntityPipelineType } from '@prisma/client';

describe('StageTransitionService', () => {
  let service: StageTransitionService;
  let prisma: PrismaService;

  const mockOrgId = 'org-123';

  beforeEach(() => {
    prisma = {
      stageTransitionLog: {
        create: vi.fn(),
        findMany: vi.fn(),
      },
    } as unknown as PrismaService;

    service = new StageTransitionService(prisma);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should record stage transition audit entry', async () => {
    const params = {
      organizationId: mockOrgId,
      entityType: EntityPipelineType.APPLICATION,
      entityId: 'app-1',
      fromStageId: 'st-1',
      fromStageName: 'Applied',
      toStageId: 'st-2',
      toStageName: 'Screening',
      performedById: 'user-1',
    };

    vi.spyOn(prisma.stageTransitionLog, 'create').mockResolvedValue({
      id: 'log-1',
      ...params,
      createdAt: new Date(),
    } as any);

    const result = await service.recordTransition(params);

    expect(result.id).toBe('log-1');
    expect(prisma.stageTransitionLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityId: 'app-1',
          toStageName: 'Screening',
        }),
      }),
    );
  });

  it('should get entity timeline history', async () => {
    vi.spyOn(prisma.stageTransitionLog, 'findMany').mockResolvedValue([
      {
        id: 'log-1',
        entityId: 'app-1',
        toStageName: 'Applied',
        createdAt: new Date(),
      } as any,
    ]);

    const result = await service.getEntityTimeline(
      mockOrgId,
      EntityPipelineType.APPLICATION,
      'app-1',
    );

    expect(result).toHaveLength(1);
    expect(result[0].toStageName).toBe('Applied');
  });
});
