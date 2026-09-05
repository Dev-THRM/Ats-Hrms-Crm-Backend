import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { CandidateNotificationWorker } from './notifications/candidate-notification.worker.js';

describe('Candidate WhatsApp Notifications E2E Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationWorker: CandidateNotificationWorker;

  const testOrgSlug = `notif-org-${Date.now()}`;
  const testEmail = `hr-lead-${Date.now()}@example.com`;
  let accessToken: string;
  let jobId: string;
  let candidateId: string;
  let applicationId: string;
  let interviewStageId: string;
  let rejectedStageId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
        forbidNonWhitelisted: true,
      }),
    );
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);
    notificationWorker = app.get<CandidateNotificationWorker>(
      CandidateNotificationWorker,
    );

    // Register HR admin tenant
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register?plan=ATS')
      .send({
        organizationName: 'Global Hiring Corp',
        organizationSlug: testOrgSlug,
        firstName: 'Elena',
        lastName: 'Rostova',
        email: testEmail,
        password: 'Password123!',
      })
      .expect(201);

    accessToken = regRes.body.tokens.accessToken;

    // Create Job
    const jobRes = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Senior LatAm Engineer',
        description: 'Building scalable high throughput systems',
        employmentType: 'FULL_TIME',
        pipelineStages: ['Applied', 'Screening', 'Interview', 'Rejected', 'Hired'],
      })
      .expect(201);

    const createdJob = jobRes.body.job || jobRes.body;
    jobId = createdJob.id;
    interviewStageId = createdJob.pipelineStages.find(
      (s: any) => s.name === 'Interview',
    ).id;
    rejectedStageId = createdJob.pipelineStages.find(
      (s: any) => s.name === 'Rejected',
    ).id;
  }, 30000);

  afterAll(async () => {
    try {
      const org = await prisma.organization.findUnique({
        where: { slug: testOrgSlug },
      });
      if (org) {
        await prisma.organization.delete({ where: { id: org.id } });
      }
    } catch {
      // Cleanup best effort
    }
    await app.close();
  });

  it('1. Create candidate with international phone number (e.g. Brazil / LatAm)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/candidates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Thiago',
        lastName: 'Macedo',
        email: `thiago-${Date.now()}@example.com`,
        phone: '+5511999887766',
        skills: ['TypeScript', 'NestJS', 'PostgreSQL'],
        currentCompany: 'Sao Paulo Fintech',
      })
      .expect(201);

    const candidate = res.body.candidate || res.body;
    expect(candidate.id).toBeDefined();
    expect(candidate.phone).toBe('+5511999887766');
    candidateId = candidate.id;
  });

  it('2. Submit application and move candidate to Interview stage', async () => {
    // Apply
    const appRes = await request(app.getHttpServer())
      .post('/api/v1/ats/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        jobId,
        candidateId,
        coverLetter: 'Passionate about distributed backend systems.',
      })
      .expect(201);

    const application = appRes.body.application || appRes.body;
    applicationId = application.id;
    expect(application.status).toBe('ACTIVE');

    // Move to Interview stage
    const stageRes = await request(app.getHttpServer())
      .patch(`/api/v1/ats/applications/${applicationId}/stage`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stageId: interviewStageId,
      })
      .expect(200);

    const updatedStageApp = stageRes.body.application || stageRes.body;
    expect(updatedStageApp.currentStageId).toBe(interviewStageId);
  }, 30000);

  it('3. Worker processes WhatsApp status update job and updates application communications history', async () => {
    const jobMock: any = {
      id: `job-mock-${Date.now()}`,
      data: {
        applicationId,
        candidateId,
        candidateName: 'Thiago Macedo',
        candidatePhone: '+5511999887766',
        candidateEmail: 'thiago@example.com',
        jobId,
        jobTitle: 'Senior LatAm Engineer',
        companyName: 'Global Hiring Corp',
        stageName: 'Interview',
        fromStageName: 'Applied',
      },
    };

    const processResult = await notificationWorker.process(jobMock);
    expect(processResult.success).toBe(true);
    expect(processResult.templateName).toBe('ats_stage_interview');

    // Verify application metadata includes communication record
    const updatedApp = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    const meta = updatedApp?.metadata as any;
    expect(meta?.communications).toBeDefined();
    expect(meta.communications.length).toBeGreaterThan(0);

    const interviewLog = meta.communications.find(
      (c: any) => c.stage === 'Interview',
    );
    expect(interviewLog).toBeDefined();
    expect(interviewLog.channel).toBe('WHATSAPP');
    expect(interviewLog.recipientPhone).toBe('+5511999887766');
    expect(interviewLog.templateName).toBe('ats_stage_interview');
  }, 30000);

  it('4. Move candidate to Rejected stage with feedback note and process rejection notice', async () => {
    const stageRes = await request(app.getHttpServer())
      .patch(`/api/v1/ats/applications/${applicationId}/stage`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stageId: rejectedStageId,
        rejectionReason: 'Looking for deeper expertise in distributed transactions.',
      })
      .expect(200);

    expect(stageRes.body.status).toBe('REJECTED');
    expect(stageRes.body.rejectionReason).toBe(
      'Looking for deeper expertise in distributed transactions.',
    );

    const rejectJobMock: any = {
      id: `reject-job-${Date.now()}`,
      data: {
        applicationId,
        candidateId,
        candidateName: 'Thiago Macedo',
        candidatePhone: '+5511999887766',
        candidateEmail: 'thiago@example.com',
        jobId,
        jobTitle: 'Senior LatAm Engineer',
        companyName: 'Global Hiring Corp',
        stageName: 'Rejected',
        rejectionReason: 'Looking for deeper expertise in distributed transactions.',
      },
    };

    const rejectResult = await notificationWorker.process(rejectJobMock);
    expect(rejectResult.success).toBe(true);
    expect(rejectResult.templateName).toBe('ats_stage_rejected');

    const finalApp = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    const finalMeta = finalApp?.metadata as any;
    expect(finalMeta.communications.length).toBeGreaterThan(1);

    const rejectedLog = finalMeta.communications.find(
      (c: any) => c.stage === 'Rejected',
    );
    expect(rejectedLog).toBeDefined();
    expect(rejectedLog.messagePreview).toContain(
      'Looking for deeper expertise in distributed transactions.',
    );
  }, 30000);
});
