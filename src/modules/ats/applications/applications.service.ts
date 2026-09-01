import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Prisma, ApplicationStatus } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { CandidatesService } from '../candidates/candidates.service.js';
import { PipelineStagesService } from '../jobs/pipeline-stages.service.js';
import { CreateApplicationDto } from './dto/create-application.dto.js';
import { QueryApplicationsDto } from './dto/query-applications.dto.js';

@Injectable()
export class ApplicationsService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(CandidatesService)
    private readonly candidatesService: CandidatesService,
    @Inject(PipelineStagesService)
    private readonly pipelineStagesService: PipelineStagesService,
  ) {}

  /**
   * Submits a candidate application for a specific job.
   */
  async create(organizationId: string, dto: CreateApplicationDto) {
    const job = await this.prisma.job.findFirst({
      where: {
        id: dto.jobId,
        organizationId,
      },
      include: {
        pipelineStages: {
          orderBy: { order: 'asc' },
        },
      },
    });

    if (!job) {
      throw new NotFoundException(`Job with ID '${dto.jobId}' not found`);
    }

    if (job.status === 'CLOSED') {
      throw new BadRequestException('Cannot apply to a closed job posting');
    }

    let candidateId = dto.candidateId;

    if (candidateId) {
      const candidate = await this.prisma.candidate.findFirst({
        where: { id: candidateId, organizationId },
      });
      if (!candidate) {
        throw new NotFoundException(
          `Candidate with ID '${candidateId}' not found in your organization`,
        );
      }
    } else if (dto.candidate) {
      const candidate = await this.candidatesService.findOrCreate(
        organizationId,
        dto.candidate,
      );
      candidateId = candidate.id;
    } else {
      throw new BadRequestException(
        'Either candidateId or candidate details must be provided',
      );
    }

    // Check duplicate application
    const existing = await this.prisma.application.findUnique({
      where: {
        candidateId_jobId: {
          candidateId,
          jobId: dto.jobId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        'Candidate has already submitted an application for this job',
      );
    }

    // Determine initial stage
    let currentStageId = dto.stageId;
    if (currentStageId) {
      const matchingStage = job.pipelineStages.find(
        (s) => s.id === currentStageId,
      );
      if (!matchingStage) {
        throw new BadRequestException(
          `Stage ID '${currentStageId}' does not belong to this job pipeline`,
        );
      }
    } else {
      if (job.pipelineStages.length > 0) {
        currentStageId = job.pipelineStages[0].id;
      } else {
        const createdStages =
          await this.pipelineStagesService.createStagesForJob(job.id);
        currentStageId = createdStages[0].id;
      }
    }

    return this.prisma.application.create({
      data: {
        organizationId,
        jobId: dto.jobId,
        candidateId,
        currentStageId,
        coverLetter: dto.coverLetter,
        metadata: dto.metadata ?? undefined,
        status: ApplicationStatus.ACTIVE,
      },
      include: {
        candidate: true,
        job: {
          select: {
            id: true,
            title: true,
            department: true,
            status: true,
          },
        },
        currentStage: true,
      },
    });
  }

  /**
   * Retrieves applications with filters by job, stage, status, candidate search, and pagination.
   */
  async findAll(organizationId: string, query: QueryApplicationsDto = {}) {
    const {
      jobId,
      stageId,
      status,
      search,
      page = 1,
      limit = 10,
      sortBy = 'appliedAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.ApplicationWhereInput = {
      organizationId,
      ...(jobId && { jobId }),
      ...(stageId && { currentStageId: stageId }),
      ...(status && { status }),
      ...(search && {
        candidate: {
          OR: [
            { firstName: { contains: search, mode: 'insensitive' } },
            { lastName: { contains: search, mode: 'insensitive' } },
            { email: { contains: search, mode: 'insensitive' } },
            { currentCompany: { contains: search, mode: 'insensitive' } },
          ],
        },
      }),
    };

    const skip = (page - 1) * limit;

    const [total, applications] = await Promise.all([
      this.prisma.application.count({ where }),
      this.prisma.application.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          candidate: true,
          job: {
            select: {
              id: true,
              title: true,
              department: true,
              status: true,
            },
          },
          currentStage: true,
        },
      }),
    ]);

    return {
      data: applications,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Finds a single application by ID with complete candidate, job, and pipeline stage details.
   */
  async findOne(organizationId: string, applicationId: string) {
    const application = await this.prisma.application.findFirst({
      where: {
        id: applicationId,
        organizationId,
      },
      include: {
        candidate: true,
        job: {
          include: {
            pipelineStages: {
              orderBy: { order: 'asc' },
            },
          },
        },
        currentStage: true,
      },
    });

    if (!application) {
      throw new NotFoundException(
        `Application with ID '${applicationId}' not found`,
      );
    }

    return application;
  }

  /**
   * Transitions an application to a new pipeline stage.
   */
  async moveToStage(
    organizationId: string,
    applicationId: string,
    targetStageId: string,
    rejectionReason?: string,
  ) {
    const application = await this.findOne(organizationId, applicationId);

    const targetStage = application.job.pipelineStages.find(
      (s) => s.id === targetStageId,
    );

    if (!targetStage) {
      throw new BadRequestException(
        `Stage ID '${targetStageId}' does not belong to job '${application.job.title}'`,
      );
    }

    let status = application.status;
    const stageNameLower = targetStage.name.toLowerCase();

    if (stageNameLower.includes('reject')) {
      status = ApplicationStatus.REJECTED;
    } else if (stageNameLower.includes('hired') || stageNameLower.includes('hire')) {
      status = ApplicationStatus.HIRED;
    } else if (status === ApplicationStatus.REJECTED || status === ApplicationStatus.HIRED) {
      // Re-activating from terminal stage to active review
      status = ApplicationStatus.ACTIVE;
    }

    return this.prisma.application.update({
      where: { id: applicationId },
      data: {
        currentStageId: targetStageId,
        status,
        ...(rejectionReason !== undefined && { rejectionReason }),
      },
      include: {
        candidate: true,
        job: {
          select: {
            id: true,
            title: true,
            department: true,
            status: true,
          },
        },
        currentStage: true,
      },
    });
  }

  /**
   * Updates application status directly (e.g. WITHDRAWN, REJECTED, HIRED).
   */
  async updateStatus(
    organizationId: string,
    applicationId: string,
    status: ApplicationStatus,
    rejectionReason?: string,
  ) {
    await this.findOne(organizationId, applicationId);

    return this.prisma.application.update({
      where: { id: applicationId },
      data: {
        status,
        ...(rejectionReason !== undefined && { rejectionReason }),
      },
      include: {
        candidate: true,
        job: {
          select: {
            id: true,
            title: true,
            department: true,
            status: true,
          },
        },
        currentStage: true,
      },
    });
  }

  /**
   * Removes an application record.
   */
  async remove(organizationId: string, applicationId: string) {
    await this.findOne(organizationId, applicationId);

    await this.prisma.application.delete({
      where: { id: applicationId },
    });

    return {
      message: 'Application deleted successfully',
      id: applicationId,
    };
  }
}
