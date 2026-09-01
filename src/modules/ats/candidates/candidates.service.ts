import {
  Injectable,
  NotFoundException,
  ConflictException,
  Inject,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { CreateCandidateDto } from './dto/create-candidate.dto.js';
import { UpdateCandidateDto } from './dto/update-candidate.dto.js';
import { QueryCandidatesDto } from './dto/query-candidates.dto.js';

@Injectable()
export class CandidatesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  /**
   * Creates a new candidate or returns existing candidate if email exists for organization.
   */
  async create(organizationId: string, dto: CreateCandidateDto) {
    const email = dto.email.toLowerCase().trim();

    const existing = await this.prisma.candidate.findUnique({
      where: {
        email_organizationId: {
          email,
          organizationId,
        },
      },
    });

    if (existing) {
      throw new ConflictException(
        `Candidate with email '${email}' already exists in your organization`,
      );
    }

    return this.prisma.candidate.create({
      data: {
        ...dto,
        email,
        organizationId,
      },
    });
  }

  /**
   * Finds or creates a candidate during quick application submission.
   */
  async findOrCreate(
    organizationId: string,
    dto: CreateCandidateDto,
    tx?: Prisma.TransactionClient,
  ) {
    const client = tx || this.prisma;
    const email = dto.email.toLowerCase().trim();

    let candidate = await client.candidate.findUnique({
      where: {
        email_organizationId: {
          email,
          organizationId,
        },
      },
    });

    if (!candidate) {
      candidate = await client.candidate.create({
        data: {
          ...dto,
          email,
          organizationId,
        },
      });
    }

    return candidate;
  }

  /**
   * Lists candidates with search, skill filtering, and pagination.
   */
  async findAll(organizationId: string, query: QueryCandidatesDto = {}) {
    const {
      search,
      skill,
      source,
      tag,
      page = 1,
      limit = 10,
      sortBy = 'createdAt',
      sortOrder = 'desc',
    } = query;

    const where: Prisma.CandidateWhereInput = {
      organizationId,
      ...(source && { source }),
      ...(skill && { skills: { has: skill } }),
      ...(tag && { tags: { has: tag } }),
      ...(search && {
        OR: [
          { firstName: { contains: search, mode: 'insensitive' } },
          { lastName: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
          { currentCompany: { contains: search, mode: 'insensitive' } },
          { currentTitle: { contains: search, mode: 'insensitive' } },
          { location: { contains: search, mode: 'insensitive' } },
        ],
      }),
    };

    const skip = (page - 1) * limit;

    const [total, candidates] = await Promise.all([
      this.prisma.candidate.count({ where }),
      this.prisma.candidate.findMany({
        where,
        skip,
        take: limit,
        orderBy: { [sortBy]: sortOrder },
        include: {
          _count: {
            select: {
              applications: true,
            },
          },
        },
      }),
    ]);

    return {
      data: candidates,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Finds a specific candidate with all past applications, jobs, and stage details.
   */
  async findOne(organizationId: string, candidateId: string) {
    const candidate = await this.prisma.candidate.findFirst({
      where: {
        id: candidateId,
        organizationId,
      },
      include: {
        applications: {
          include: {
            job: {
              select: {
                id: true,
                title: true,
                department: true,
                status: true,
                employmentType: true,
              },
            },
            currentStage: {
              select: {
                id: true,
                name: true,
                order: true,
              },
            },
          },
          orderBy: { appliedAt: 'desc' },
        },
      },
    });

    if (!candidate) {
      throw new NotFoundException(`Candidate with ID '${candidateId}' not found`);
    }

    return candidate;
  }

  /**
   * Updates an existing candidate profile.
   */
  async update(
    organizationId: string,
    candidateId: string,
    dto: UpdateCandidateDto,
  ) {
    await this.findOne(organizationId, candidateId);

    const email = dto.email ? dto.email.toLowerCase().trim() : undefined;

    if (email) {
      const existing = await this.prisma.candidate.findUnique({
        where: {
          email_organizationId: {
            email,
            organizationId,
          },
        },
      });

      if (existing && existing.id !== candidateId) {
        throw new ConflictException(
          `Candidate with email '${email}' already exists in your organization`,
        );
      }
    }

    return this.prisma.candidate.update({
      where: { id: candidateId },
      data: {
        ...dto,
        ...(email && { email }),
      },
    });
  }

  /**
   * Deletes a candidate and their associated applications.
   */
  async remove(organizationId: string, candidateId: string) {
    await this.findOne(organizationId, candidateId);

    await this.prisma.candidate.delete({
      where: { id: candidateId },
    });

    return {
      message: 'Candidate profile deleted successfully',
      id: candidateId,
    };
  }
}
