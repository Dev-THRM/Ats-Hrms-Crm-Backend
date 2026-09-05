import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { CandidateNotificationWorker } from './notifications/candidate-notification.worker.js';

describe('ATS Interviews & Calendar/Meet Automation E2E Test Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let notificationWorker: CandidateNotificationWorker;

  const testOrgSlug = `interview-org-${Date.now()}`;
  const testEmail = `hr-scheduler-${Date.now()}@example.com`;
  let accessToken: string;
  let jobId: string;
  let candidateId: string;
  let applicationId: string;
  let interviewId: string;
  let generatedMeetLink: string;

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

    // Register tenant with ATS plan
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register?plan=ATS')
      .send({
        organizationName: 'Global AI Hiring Corp',
        organizationSlug: testOrgSlug,
        firstName: 'Sophia',
        lastName: 'Recruiter',
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
        title: 'Principal Cloud Architect',
        description: 'Lead next-gen serverless microservices',
        employmentType: 'FULL_TIME',
      })
      .expect(201);

    jobId = (jobRes.body.job || jobRes.body).id;

    // Create Candidate
    const candRes = await request(app.getHttpServer())
      .post('/api/v1/ats/candidates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Gabriel',
        lastName: 'Santos',
        email: `gabriel-${Date.now()}@example.com`,
        phone: '+5511999776655',
        skills: ['Node.js', 'AWS', 'Kubernetes'],
      })
      .expect(201);

    candidateId = (candRes.body.candidate || candRes.body).id;

    // Create Application
    const appRes = await request(app.getHttpServer())
      .post('/api/v1/ats/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        jobId,
        candidateId,
        coverLetter: 'Expertise in architecting resilient microservices.',
      })
      .expect(201);

    applicationId = (appRes.body.application || appRes.body).id;
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

  it('1. Schedule interview with automated Google Meet link generation (POST /api/v1/ats/interviews)', async () => {
    const scheduledDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000); // 2 days in the future

    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/interviews')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        applicationId,
        title: 'System Design Round 1',
        type: 'TECHNICAL',
        scheduledAt: scheduledDate.toISOString(),
        durationMinutes: 60,
      })
      .expect(201);

    const interview = res.body.interview || res.body;
    expect(interview.id).toBeDefined();
    expect(interview.title).toBe('System Design Round 1');
    expect(interview.status).toBe('SCHEDULED');
    expect(interview.meetingLink).toMatch(/^https:\/\/meet\.google\.com\//);
    expect(interview.googleCalendarHtmlLink).toContain('calendar.google.com');

    interviewId = interview.id;
    generatedMeetLink = interview.meetingLink;
  }, 30000);

  it('2. List interviews and get interview detail by ID (GET /api/v1/ats/interviews/:id)', async () => {
    // List
    const listRes = await request(app.getHttpServer())
      .get('/api/v1/ats/interviews')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(listRes.body.data.length).toBeGreaterThan(0);
    const found = listRes.body.data.find((i: any) => i.id === interviewId);
    expect(found).toBeDefined();
    expect(found.candidate.firstName).toBe('Gabriel');

    // Detail
    const detailRes = await request(app.getHttpServer())
      .get(`/api/v1/ats/interviews/${interviewId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(detailRes.body.interview.id).toBe(interviewId);
    expect(detailRes.body.interview.meetingLink).toBe(generatedMeetLink);
  }, 30000);

  it('3. Process WhatsApp interview invitation and verify Google Meet link in candidate communication log', async () => {
    const jobMock: any = {
      id: `interview-job-${Date.now()}`,
      name: 'send-interview-invite',
      data: {
        interviewId,
        applicationId,
        candidateId,
        candidateName: 'Gabriel Santos',
        candidatePhone: '+5511999776655',
        candidateEmail: 'gabriel@example.com',
        jobTitle: 'Principal Cloud Architect',
        companyName: 'Global AI Hiring Corp',
        interviewTitle: 'System Design Round 1',
        scheduledAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        meetingLink: generatedMeetLink,
        type: 'INVITE',
      },
    };

    const processResult = await notificationWorker.process(jobMock);
    expect(processResult.success).toBe(true);
    expect(processResult.templateName).toBe('ats_interview_scheduled');
    expect(processResult.meetingLink).toBe(generatedMeetLink);

    // Verify application metadata communications record
    const updatedApp = await prisma.application.findUnique({
      where: { id: applicationId },
    });

    const meta = updatedApp?.metadata as any;
    expect(meta.communications).toBeDefined();
    const inviteLog = meta.communications.find(
      (c: any) => c.type === 'INTERVIEW_INVITE',
    );
    expect(inviteLog).toBeDefined();
    expect(inviteLog.recipientPhone).toBe('+5511999776655');
    expect(inviteLog.meetingLink).toBe(generatedMeetLink);
    expect(inviteLog.messagePreview).toContain(generatedMeetLink);
  }, 30000);

  it('4. Process 1-day pre-interview WhatsApp reminder and verify reminderSent in DB', async () => {
    const reminderJobMock: any = {
      id: `reminder-job-${Date.now()}`,
      name: 'send-interview-reminder',
      data: {
        interviewId,
        applicationId,
        candidateId,
        candidateName: 'Gabriel Santos',
        candidatePhone: '+5511999776655',
        jobTitle: 'Principal Cloud Architect',
        companyName: 'Global AI Hiring Corp',
        interviewTitle: 'System Design Round 1',
        scheduledAt: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000).toISOString(),
        durationMinutes: 60,
        meetingLink: generatedMeetLink,
        type: 'REMINDER',
      },
    };

    const reminderResult = await notificationWorker.process(reminderJobMock);
    expect(reminderResult.success).toBe(true);
    expect(reminderResult.templateName).toBe('ats_interview_reminder');

    // Verify DB updated reminderSent = true
    const updatedInterview = await prisma.interview.findUnique({
      where: { id: interviewId },
    });
    expect(updatedInterview?.reminderSent).toBe(true);
    expect(updatedInterview?.reminderSentAt).toBeDefined();
  }, 30000);

  it('5. Submit interviewer feedback scorecard (POST /api/v1/ats/interviews/:id/feedback)', async () => {
    const res = await request(app.getHttpServer())
      .post(`/api/v1/ats/interviews/${interviewId}/feedback`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        rating: 5,
        notes: 'Outstanding system architecture design and microservices scaling knowledge.',
      })
      .expect(200);

    const interview = res.body.interview || res.body;
    expect(interview.status).toBe('COMPLETED');
    expect(interview.feedbackRating).toBe(5);
    expect(interview.feedbackNotes).toContain('Outstanding system architecture');
  }, 30000);
});
