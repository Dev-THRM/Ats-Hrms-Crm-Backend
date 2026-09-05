import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger, Inject } from '@nestjs/common';
import { Job } from 'bullmq';
import { NOTIFICATION_QUEUE } from '../../shared/queue/queue.module.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';
import { WhatsAppTemplatesService } from './whatsapp-templates.service.js';
import { WhatsAppService } from './whatsapp.service.js';

export interface CandidateStatusUpdateJobData {
  applicationId: string;
  candidateId: string;
  candidateName: string;
  candidatePhone?: string | null;
  candidateEmail?: string | null;
  jobId: string;
  jobTitle: string;
  companyName: string;
  stageName: string;
  fromStageName?: string | null;
  rejectionReason?: string | null;
  customNotes?: string | null;
  channel?: 'WHATSAPP' | 'EMAIL' | 'ALL';
}

@Processor(NOTIFICATION_QUEUE)
export class CandidateNotificationWorker extends WorkerHost {
  private readonly logger = new Logger(CandidateNotificationWorker.name);

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Inject(WhatsAppTemplatesService)
    private readonly templatesService: WhatsAppTemplatesService,
    @Inject(WhatsAppService) private readonly whatsAppService: WhatsAppService,
  ) {
    super();
  }

  async process(job: Job<CandidateStatusUpdateJobData>): Promise<any> {
    const {
      applicationId,
      candidateName,
      candidatePhone,
      jobTitle,
      companyName,
      stageName,
      rejectionReason,
      customNotes,
    } = job.data;

    this.logger.log(
      `Processing status update notification for candidate ${candidateName} (Application: ${applicationId}) -> Stage: ${stageName}`,
    );

    if (!candidatePhone) {
      this.logger.warn(
        `Candidate ${candidateName} has no phone number attached. Skipping WhatsApp dispatch.`,
      );
      return { skipped: true, reason: 'NO_PHONE_NUMBER' };
    }

    // 1. Render stage-specific message template
    const rendered = this.templatesService.renderStageUpdateMessage({
      candidateName,
      jobTitle,
      companyName: companyName || 'Our Company',
      stageName,
      rejectionReason: rejectionReason || undefined,
      customNotes: customNotes || undefined,
    });

    // 2. Dispatch via active WhatsApp Driver
    const sendResult = await this.whatsAppService.send({
      to: candidatePhone,
      templateName: rendered.templateName,
      languageCode: rendered.languageCode,
      parameters: rendered.parameters,
      bodyText: rendered.bodyText,
    });

    // 3. Persist dispatch log to Application metadata for HR visibility
    try {
      const application = await this.prisma.application.findUnique({
        where: { id: applicationId },
      });

      if (application) {
        const metadata = (application.metadata as Record<string, any>) || {};
        const communications = Array.isArray(metadata.communications)
          ? metadata.communications
          : [];

        communications.push({
          channel: 'WHATSAPP',
          stage: stageName,
          templateName: rendered.templateName,
          recipientPhone: candidatePhone,
          messagePreview: rendered.bodyText,
          messageId: sendResult.messageId || null,
          provider: sendResult.provider,
          success: sendResult.success,
          error: sendResult.error || null,
          sentAt: sendResult.timestamp,
        });

        await this.prisma.application.update({
          where: { id: applicationId },
          data: {
            metadata: {
              ...metadata,
              communications,
              lastContactedAt: new Date().toISOString(),
            },
          },
        });
      }
    } catch (dbErr: any) {
      this.logger.error(
        `Failed to update application metadata with notification log: ${dbErr.message}`,
      );
    }

    return {
      success: sendResult.success,
      messageId: sendResult.messageId,
      provider: sendResult.provider,
      templateName: rendered.templateName,
    };
  }
}
