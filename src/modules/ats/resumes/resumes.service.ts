import {
  Injectable,
  BadRequestException,
  NotFoundException,
  Inject,
  Optional,
} from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { StorageService } from '../../shared/storage/storage.service.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { RESUME_QUEUE } from '../../shared/queue/queue.module.js';
import { GetPresignedUrlDto } from './dto/get-presigned-url.dto.js';
import { AttachResumeDto } from './dto/attach-resume.dto.js';
import * as path from 'node:path';
import 'multer';

export class UploadedResumeFile {
  originalname!: string;
  mimetype!: string;
  size!: number;
  buffer!: Buffer;
}

const ALLOWED_MIME_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/msword',
];

const ALLOWED_EXTENSIONS = ['.pdf', '.docx', '.doc'];
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Injectable()
export class ResumesService {
  constructor(
    @Inject(StorageService) private readonly storageService: StorageService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @InjectQueue(RESUME_QUEUE) private readonly resumeQueue?: Queue,
  ) {}

  /**
   * Generates a tenant-partitioned pre-signed upload URL for direct client-to-R2 upload.
   */
  async getPresignedUploadUrl(
    organizationId: string,
    dto: GetPresignedUrlDto,
  ) {
    const ext = path.extname(dto.fileName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Invalid file extension '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    const sanitizedName = path
      .basename(dto.fileName)
      .replace(/[^a-zA-Z0-9.-]/g, '_');
    const folder = dto.candidateId ? dto.candidateId : 'temp';
    const key = `resumes/${organizationId}/${folder}/${Date.now()}-${sanitizedName}`;

    const presigned = await this.storageService.generatePresignedUploadUrl(
      key,
      dto.contentType || 'application/pdf',
    );

    return {
      ...presigned,
      organizationId,
      candidateId: dto.candidateId,
      jobId: dto.jobId,
    };
  }

  /**
   * Direct multipart file upload via NestJS server.
   */
  async uploadDirect(
    organizationId: string,
    file: UploadedResumeFile,
    candidateId?: string,
    jobId?: string,
    applicationId?: string,
  ) {
    if (!file) {
      throw new BadRequestException('No resume file provided');
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File exceeds maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      );
    }

    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_EXTENSIONS.includes(ext)) {
      throw new BadRequestException(
        `Invalid file extension '${ext}'. Allowed types: ${ALLOWED_EXTENSIONS.join(', ')}`,
      );
    }

    const sanitizedName = path
      .basename(file.originalname)
      .replace(/[^a-zA-Z0-9.-]/g, '_');
    const folder = candidateId ? candidateId : 'temp';
    const key = `resumes/${organizationId}/${folder}/${Date.now()}-${sanitizedName}`;

    const { url } = await this.storageService.uploadBuffer({
      key,
      buffer: file.buffer,
      contentType: file.mimetype,
      metadata: {
        organizationId,
        originalName: file.originalname,
        ...(candidateId && { candidateId }),
        ...(jobId && { jobId }),
      },
    });

    // If candidateId was provided, automatically update Candidate.resumeUrl
    if (candidateId) {
      const candidate = await this.prisma.candidate.findFirst({
        where: { id: candidateId, organizationId },
      });
      if (candidate) {
        await this.prisma.candidate.update({
          where: { id: candidateId },
          data: { resumeUrl: url },
        });
      }
    }

    // Enqueue background parsing job
    if (this.resumeQueue) {
      await this.resumeQueue.add('parse-resume', {
        organizationId,
        candidateId,
        jobId,
        applicationId,
        resumeKey: key,
        resumeUrl: url,
      });
    }

    return {
      message: 'Resume uploaded successfully and queued for AI parsing',
      key,
      resumeUrl: url,
      fileName: file.originalname,
      fileSize: file.size,
      mimeType: file.mimetype,
    };
  }

  /**
   * Generates a temporary secure pre-signed download URL.
   */
  async getDownloadUrl(organizationId: string, key: string) {
    if (!key.startsWith(`resumes/${organizationId}/`)) {
      throw new BadRequestException(
        'Access denied: You can only access resumes in your organization',
      );
    }

    const downloadUrl = await this.storageService.generatePresignedDownloadUrl(
      key,
      3600,
    );

    return {
      key,
      downloadUrl,
      expiresInSeconds: 3600,
    };
  }

  /**
   * Attaches an uploaded resume URL/key to a Candidate profile and optional Application record.
   */
  async attachResume(organizationId: string, dto: AttachResumeDto) {
    const candidate = await this.prisma.candidate.findFirst({
      where: { id: dto.candidateId, organizationId },
    });

    if (!candidate) {
      throw new NotFoundException(
        `Candidate with ID '${dto.candidateId}' not found`,
      );
    }

    const updatedCandidate = await this.prisma.candidate.update({
      where: { id: dto.candidateId },
      data: { resumeUrl: dto.resumeUrl },
    });

    let updatedApplication = null;
    if (dto.applicationId) {
      const application = await this.prisma.application.findFirst({
        where: { id: dto.applicationId, organizationId },
      });
      if (application) {
        const metadata = (application.metadata as Record<string, any>) || {};
        updatedApplication = await this.prisma.application.update({
          where: { id: dto.applicationId },
          data: {
            metadata: {
              ...metadata,
              resumeUrl: dto.resumeUrl,
              resumeKey: dto.key,
            },
          },
        });
      }
    }

    // Enqueue parsing job if key is provided
    if (dto.key && this.resumeQueue) {
      await this.resumeQueue.add('parse-resume', {
        organizationId,
        candidateId: dto.candidateId,
        applicationId: dto.applicationId,
        resumeKey: dto.key,
        resumeUrl: dto.resumeUrl,
      });
    }

    return {
      message: 'Resume attached successfully',
      candidate: updatedCandidate,
      application: updatedApplication,
    };
  }

  /**
   * Retrieves raw resume Buffer from storage (for BullMQ resume parser).
   */
  async getResumeBuffer(key: string): Promise<Buffer> {
    return this.storageService.getFileBuffer(key);
  }
}
