import { describe, it, expect, beforeEach } from 'vitest';
import { WhatsAppTemplatesService } from './whatsapp-templates.service.js';

describe('WhatsAppTemplatesService', () => {
  let service: WhatsAppTemplatesService;

  beforeEach(() => {
    service = new WhatsAppTemplatesService();
  });

  it('should format Applied stage notification correctly', () => {
    const result = service.renderStageUpdateMessage({
      candidateName: 'Carlos Silva',
      jobTitle: 'Senior Backend Engineer',
      companyName: 'Acme Corp',
      stageName: 'Applied',
    });

    expect(result.templateName).toBe('ats_stage_applied');
    expect(result.bodyText).toContain('Carlos Silva');
    expect(result.bodyText).toContain('Senior Backend Engineer');
    expect(result.bodyText).toContain('Acme Corp');
    expect(result.parameters['1']).toBe('Carlos Silva');
  });

  it('should format Interview stage notification correctly', () => {
    const result = service.renderStageUpdateMessage({
      candidateName: 'Mei Lin',
      jobTitle: 'Frontend Engineer',
      companyName: 'Tech Innovations',
      stageName: 'Technical Interview',
      customNotes: 'Please bring your portfolio',
    });

    expect(result.templateName).toBe('ats_stage_interview');
    expect(result.bodyText).toContain('Mei Lin');
    expect(result.bodyText).toContain('Technical Interview');
    expect(result.bodyText).toContain('Please bring your portfolio');
  });

  it('should format Offer stage notification with congratulations', () => {
    const result = service.renderStageUpdateMessage({
      candidateName: 'Priya Sharma',
      jobTitle: 'Product Manager',
      companyName: 'Global Solutions',
      stageName: 'Offer',
    });

    expect(result.templateName).toBe('ats_stage_offer');
    expect(result.bodyText).toContain('congratulations');
    expect(result.bodyText).toContain('Product Manager');
  });

  it('should format Rejected stage notification with constructive feedback', () => {
    const result = service.renderStageUpdateMessage({
      candidateName: 'John Doe',
      jobTitle: 'DevOps Architect',
      companyName: 'Cloud Inc',
      stageName: 'Rejected',
      rejectionReason: 'Looking for more Kubernetes production experience',
    });

    expect(result.templateName).toBe('ats_stage_rejected');
    expect(result.bodyText).toContain('Looking for more Kubernetes production experience');
    expect(result.parameters['5']).toBe('Looking for more Kubernetes production experience');
  });

  it('should substitute custom dynamic tags with formatCustomTemplate', () => {
    const template = 'Hello {{name}}, your interview for {{role}} is confirmed!';
    const formatted = service.formatCustomTemplate(template, {
      name: 'Alice',
      role: 'Fullstack Dev',
    });

    expect(formatted).toBe('Hello Alice, your interview for Fullstack Dev is confirmed!');
  });
});
