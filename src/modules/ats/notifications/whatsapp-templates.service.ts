import { Injectable } from '@nestjs/common';

export interface StageUpdateTemplateParams {
  candidateName: string;
  jobTitle: string;
  companyName: string;
  stageName: string;
  rejectionReason?: string;
  customNotes?: string;
  language?: string;
}

export interface RenderedTemplate {
  templateName: string;
  languageCode: string;
  bodyText: string;
  parameters: Record<string, string>;
}

@Injectable()
export class WhatsAppTemplatesService {
  /**
   * Evaluates the pipeline stage and resolves the corresponding WhatsApp message template.
   */
  renderStageUpdateMessage(params: StageUpdateTemplateParams): RenderedTemplate {
    const {
      candidateName,
      jobTitle,
      companyName,
      stageName,
      rejectionReason,
      customNotes,
      language = 'en',
    } = params;

    const normalizedStage = stageName.trim().toLowerCase();
    let templateName = 'ats_stage_generic_update';
    let bodyText = '';

    const parameters: Record<string, string> = {
      '1': candidateName,
      '2': jobTitle,
      '3': companyName,
      '4': stageName,
    };

    if (normalizedStage.includes('reject')) {
      templateName = 'ats_stage_rejected';
      const reasonSuffix = rejectionReason ? ` Feedback: ${rejectionReason}` : '';
      bodyText = `Hi ${candidateName}, thank you for your interest in the ${jobTitle} role at ${companyName}. After careful review, we have decided to move forward with other candidates at this time.${reasonSuffix} We wish you all the best in your job search.`;
      if (rejectionReason) {
        parameters['5'] = rejectionReason;
      }
    } else if (normalizedStage.includes('offer')) {
      templateName = 'ats_stage_offer';
      bodyText = `Hi ${candidateName}, congratulations! 🎉 We are thrilled to extend an offer for the ${jobTitle} position at ${companyName}. Our team will share the formal offer details and next steps shortly.`;
    } else if (
      normalizedStage.includes('interview') ||
      normalizedStage.includes('tech round') ||
      normalizedStage.includes('screening')
    ) {
      templateName = 'ats_stage_interview';
      const noteSuffix = customNotes ? ` Note: ${customNotes}` : '';
      bodyText = `Hi ${candidateName}, great news! You have been moved to the ${stageName} stage for the ${jobTitle} position at ${companyName}.${noteSuffix} Our recruiting team will follow up with scheduling details.`;
      if (customNotes) {
        parameters['5'] = customNotes;
      }
    } else if (
      normalizedStage.includes('applied') ||
      normalizedStage.includes('application')
    ) {
      templateName = 'ats_stage_applied';
      bodyText = `Hi ${candidateName}, thanks for applying for the ${jobTitle} role at ${companyName}! We have received your application and our recruitment team is currently reviewing your profile.`;
    } else {
      templateName = 'ats_stage_generic_update';
      bodyText = `Hi ${candidateName}, your application for the ${jobTitle} role at ${companyName} has been updated to stage: ${stageName}. We will keep you updated on the next steps!`;
    }

    return {
      templateName,
      languageCode: language,
      bodyText,
      parameters,
    };
  }

  /**
   * Helper to replace {{placeholder}} tags inside dynamic template strings.
   */
  formatCustomTemplate(template: string, variables: Record<string, string>): string {
    return template.replace(/\{\{(\w+)\}\}/g, (_, key) => {
      return variables[key] !== undefined ? variables[key] : `{{${key}}}`;
    });
  }
}
