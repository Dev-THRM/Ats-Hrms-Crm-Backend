import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Test, TestingModule } from '@nestjs/testing';
import { PublicCareerService } from './public-career.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { NotFoundException, BadRequestException } from '@nestjs/common';
import { JobStatus } from '@prisma/client';

describe('PublicCareerService', () => {
  let service: PublicCareerService;

  const mockPrisma = {
    organization: {
      findUnique: vi.fn(),
    },
    job: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    candidate: {
      findUnique: vi.fn(),
    },
    application: {
      findUnique: vi.fn(),
    },
  };

  const mockStorageService = {
    uploadBuffer: vi.fn(),
  };

  const mockApplicationsService = {
    create: vi.fn(),
  };

  const mockCandidatesService = {
    findOrCreate: vi.fn(),
  };

  beforeEach(async () => {
    vi.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PublicCareerService,
        { provide: PrismaService, useValue: mockPrisma },
        { provide: StorageService, useValue: mockStorageService },
        { provide: ApplicationsService, useValue: mockApplicationsService },
        { provide: CandidatesService, useValue: mockCandidatesService },
      ],
    }).compile();

    service = module.get<PublicCareerService>(PublicCareerService);
  });

  describe('getPublicJobs', () => {
    it('throws NotFoundException if organization slug is invalid', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue(null);

      await expect(service.getPublicJobs('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('returns public organization info and open jobs list', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        name: 'Acme Corp',
        slug: 'acme',
        logoUrl: 'https://acme.com/logo.png',
        website: 'https://acme.com',
      });

      mockPrisma.job.findMany.mockResolvedValue([
        {
          id: 'job-1',
          title: 'Senior Backend Engineer',
          department: 'Engineering',
          location: 'Remote',
          employmentType: 'FULL_TIME',
          createdAt: new Date(),
        },
      ]);

      const result = await service.getPublicJobs('acme');
      expect(result.organization.slug).toBe('acme');
      expect(result.totalJobs).toBe(1);
      expect(result.jobs[0].title).toBe('Senior Backend Engineer');
    });
  });

  describe('getPublicJobDetails', () => {
    it('throws NotFoundException if job is not found or not OPEN', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        slug: 'acme',
      });
      mockPrisma.job.findFirst.mockResolvedValue(null);

      await expect(
        service.getPublicJobDetails('acme', 'job-invalid'),
      ).rejects.toThrow(NotFoundException);
    });

    it('returns full job details for open job', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        slug: 'acme',
      });
      mockPrisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        title: 'Full Stack Developer',
        status: JobStatus.OPEN,
        description: 'Great role...',
      });

      const result = await service.getPublicJobDetails('acme', 'job-1');
      expect(result.job.id).toBe('job-1');
      expect(result.job.title).toBe('Full Stack Developer');
    });
  });

  describe('applyPublic', () => {
    it('throws BadRequestException if job is not open', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        slug: 'acme',
      });
      mockPrisma.job.findFirst.mockResolvedValue(null);

      await expect(
        service.applyPublic('acme', 'job-closed', {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('uploads resume if provided and creates candidate + application with CAREER_PORTAL source', async () => {
      mockPrisma.organization.findUnique.mockResolvedValue({
        id: 'org-1',
        slug: 'acme',
      });
      mockPrisma.job.findFirst.mockResolvedValue({
        id: 'job-1',
        title: 'Backend Engineer',
        status: JobStatus.OPEN,
      });

      mockStorageService.uploadBuffer.mockResolvedValue({
        key: 'resumes/org-1/public/123-resume.pdf',
        url: 'https://r2.example.com/resumes/org-1/public/123-resume.pdf',
      });

      mockCandidatesService.findOrCreate.mockResolvedValue({
        id: 'cand-1',
        firstName: 'John',
        lastName: 'Doe',
        email: 'john@example.com',
      });

      mockApplicationsService.create.mockResolvedValue({
        id: 'app-1',
      });

      const mockFile = {
        originalname: 'resume.pdf',
        mimetype: 'application/pdf',
        buffer: Buffer.from('dummy resume content'),
      } as Express.Multer.File;

      const result = await service.applyPublic(
        'acme',
        'job-1',
        {
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          phone: '+1234567890',
          coverLetter: 'I am excited to apply...',
        },
        mockFile,
      );

      expect(mockStorageService.uploadBuffer).toHaveBeenCalledWith(
        expect.objectContaining({
          contentType: 'application/pdf',
        }),
      );
      expect(mockCandidatesService.findOrCreate).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          firstName: 'John',
          lastName: 'Doe',
          email: 'john@example.com',
          source: 'CAREER_PORTAL',
        }),
      );
      expect(mockApplicationsService.create).toHaveBeenCalledWith(
        'org-1',
        expect.objectContaining({
          jobId: 'job-1',
          candidateId: 'cand-1',
          coverLetter: 'I am excited to apply...',
        }),
      );
      expect(result.applicationId).toBe('app-1');
      expect(result.message).toBe('Application submitted successfully');
    });
  });
});
