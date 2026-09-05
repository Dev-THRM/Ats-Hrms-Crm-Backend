import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewsController } from './interviews.controller.js';
import { InterviewsService } from './interviews.service.js';
import { InterviewType } from '@prisma/client';

describe('InterviewsController', () => {
  let controller: InterviewsController;
  let serviceMock: any;

  beforeEach(() => {
    serviceMock = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      submitFeedback: vi.fn(),
      remove: vi.fn(),
      triggerDueReminders: vi.fn(),
    };

    controller = new InterviewsController(serviceMock as InterviewsService);
  });

  it('should call create and return wrapped result with message', async () => {
    serviceMock.create.mockResolvedValue({
      id: 'interview-1',
      title: 'Tech Round',
    });

    const result = await controller.create('org-1', 'user-1', {
      applicationId: 'app-1',
      title: 'Tech Round',
      type: InterviewType.TECHNICAL,
      scheduledAt: new Date().toISOString(),
    });

    expect(result.message).toContain('Interview scheduled successfully');
    expect(result.interview.id).toBe('interview-1');
  });

  it('should call findAll with query filters', async () => {
    serviceMock.findAll.mockResolvedValue({
      data: [{ id: 'interview-1' }],
      meta: { total: 1, page: 1, limit: 20, totalPages: 1 },
    });

    const result = await controller.findAll('org-1', { page: 1, limit: 20 });
    expect(result.data).toHaveLength(1);
  });
});
