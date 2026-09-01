import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CandidatesController } from './candidates.controller.js';
import { CandidatesService } from './candidates.service.js';

describe('CandidatesController', () => {
  let controller: CandidatesController;
  let service: CandidatesService;

  const mockOrgId = 'org-123';

  beforeEach(() => {
    service = {
      create: vi.fn(),
      findAll: vi.fn(),
      findOne: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
    } as unknown as CandidatesService;

    controller = new CandidatesController(service);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should create candidate', async () => {
    const dto = {
      firstName: 'Alice',
      lastName: 'Smith',
      email: 'alice@example.com',
    };

    vi.spyOn(service, 'create').mockResolvedValue({
      id: 'cand-1',
      ...dto,
    } as any);

    const result = await controller.create(mockOrgId, dto);
    expect(result.candidate.id).toBe('cand-1');
    expect(service.create).toHaveBeenCalledWith(mockOrgId, dto);
  });

  it('should find all candidates', async () => {
    vi.spyOn(service, 'findAll').mockResolvedValue({
      data: [],
      meta: { total: 0, page: 1, limit: 10, totalPages: 1 },
    });

    const result = await controller.findAll(mockOrgId, {});
    expect(result.data).toEqual([]);
  });
});
