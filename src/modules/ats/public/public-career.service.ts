import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { StorageService } from '../../shared/storage/storage.service.js';
import { ApplicationsService } from '../applications/applications.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { JobStatus } from '@prisma/client';
import { PublicApplyJobDto } from './dto/public-apply.dto.js';

@Injectable()
export class PublicCareerService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(ApplicationsService)
    private readonly applicationsService: ApplicationsService,
    @Inject(CandidatesService)
    private readonly candidatesService: CandidatesService,
  ) {}

  /**
   * Retrieves organization info and published open job postings for candidate public career page.
   */
  async getPublicJobs(orgSlug: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        website: true,
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const jobs = await this.prisma.job.findMany({
      where: {
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
      select: {
        id: true,
        title: true,
        department: true,
        location: true,
        employmentType: true,
        experienceMin: true,
        experienceMax: true,
        experienceLevel: true,
        salaryMin: true,
        salaryMax: true,
        salaryCurrency: true,
        salaryVisible: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      organization: org,
      totalJobs: jobs.length,
      jobs,
    };
  }

  /**
   * Retrieves full public description for a single open job posting.
   */
  async getPublicJobDetails(orgSlug: string, jobId: string) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
      select: {
        id: true,
        name: true,
        slug: true,
        logoUrl: true,
        website: true,
      },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
    });

    if (!job) {
      throw new NotFoundException(`Job posting not found or no longer open`);
    }

    return {
      organization: org,
      job,
    };
  }

  /**
   * Allows public external candidates to submit an application with resume upload.
   */
  async applyPublic(
    orgSlug: string,
    jobId: string,
    dto: PublicApplyJobDto,
    file?: Express.Multer.File,
  ) {
    const org = await this.prisma.organization.findUnique({
      where: { slug: orgSlug },
    });

    if (!org) {
      throw new NotFoundException(`Organization with slug '${orgSlug}' not found`);
    }

    const job = await this.prisma.job.findFirst({
      where: {
        id: jobId,
        organizationId: org.id,
        status: JobStatus.OPEN,
      },
    });

    if (!job) {
      throw new BadRequestException('Cannot apply: job is not currently open');
    }

    let resumeKey: string | null = null;
    let resumeUrl: string | null = null;

    if (file) {
      const sanitizedName = (file.originalname || 'resume.pdf').replace(
        /[^a-zA-Z0-9.-]/g,
        '_',
      );
      resumeKey = `resumes/${org.id}/public/${Date.now()}-${sanitizedName}`;
      const uploadResult = await this.storageService.uploadBuffer({
        key: resumeKey,
        buffer: file.buffer,
        contentType: file.mimetype,
        metadata: {
          organizationId: org.id,
          originalName: file.originalname,
          source: 'PUBLIC_CAREER_PORTAL',
        },
      });
      resumeUrl = uploadResult.url;
    }

    // 1. Create or update candidate record with source = 'CAREER_PORTAL'
    const candidate = await this.candidatesService.findOrCreate(org.id, {
      firstName: dto.firstName,
      lastName: dto.lastName,
      email: dto.email,
      phone: dto.phone,
      currentCompany: dto.currentCompany,
      currentTitle: dto.currentTitle,
      location: dto.location,
      linkedinUrl: dto.linkedinUrl,
      portfolioUrl: dto.portfolioUrl,
      githubUrl: dto.githubUrl,
      skills: dto.skills || [],
      source: 'CAREER_PORTAL',
      resumeUrl: resumeUrl || undefined,
    });

    // 2. Submit application & trigger async BullMQ parser + candidate WhatsApp confirmation
    const application = await this.applicationsService.create(org.id, {
      jobId: job.id,
      candidateId: candidate.id,
      coverLetter: dto.coverLetter,
      metadata: resumeKey
        ? {
            resumeKey,
            resumeUrl,
            appliedVia: 'PUBLIC_CAREER_PORTAL',
          }
        : {
            appliedVia: 'PUBLIC_CAREER_PORTAL',
          },
    });

    return {
      message: 'Application submitted successfully',
      applicationId: application.id,
      candidateId: candidate.id,
      jobTitle: job.title,
    };
  }
}
