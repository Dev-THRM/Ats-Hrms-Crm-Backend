import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { ResumeProcessorWorker } from './parser/resume-processor.worker.js';

describe('ATS Resume Parsing, AI Detection & Scoring E2E Test Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let worker: ResumeProcessorWorker;

  let accessToken: string;
  let organizationId: string;
  let jobId: string;
  let aiCandidateId: string;
  let humanCandidateId: string;
  let aiApplicationId: string;
  let humanApplicationId: string;

  const timestamp = Date.now();
  const testTenant = {
    organizationName: `AI Filter Corp ${timestamp}`,
    organizationSlug: `ai-filter-${timestamp}`,
    email: `recruiter-${timestamp}@aifilter.com`,
    password: 'Password123!',
    firstName: 'Filter',
    lastName: 'Admin',
  };

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();
    prisma = moduleRef.get<PrismaService>(PrismaService);
    worker = moduleRef.get<ResumeProcessorWorker>(ResumeProcessorWorker);

    // Register tenant with ATS plan
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register?plan=ATS')
      .send(testTenant)
      .expect(201);

    accessToken = regRes.body.tokens.accessToken;
    organizationId =
      regRes.body.user.organizationId || regRes.body.user.organization?.id;

    // Create a job posting
    const jobRes = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Senior Backend Engineer',
        description: 'Building microservices in TypeScript, NestJS, and PostgreSQL with Docker',
        experienceMin: 3,
        status: 'OPEN',
      })
      .expect(201);

    jobId = jobRes.body.job.id;
  });

  afterAll(async () => {
    try {
      if (prisma && organizationId) {
        await prisma.organization.delete({
          where: { id: organizationId },
        });
      }
    } catch {
      // Cleanup
    }
    if (app) {
      await app.close();
    }
  });

  it('1. AI-Written Resume: Auto-rejects application and transitions to Rejected stage', async () => {
    // 1. Create candidate
    const candRes = await request(app.getHttpServer())
      .post('/api/v1/ats/candidates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Chat',
        lastName: 'Bot',
        email: `chatgpt-${timestamp}@example.com`,
      })
      .expect(201);

    aiCandidateId = candRes.body.candidate.id;

    // 2. Upload AI-generated resume content
    const aiResumeContent = `
      Certainly! Here is a tailored resume for the Senior Backend Engineer position:
      Professional Summary:
      Results-driven professional with a proven track record of orchestrating synergies across distributed teams.
      Adept at leveraging cutting-edge cloud architectures to drive transformative business outcomes.
      Key Projects:
      • Spearheaded the orchestration of enterprise microservices resulting in a 40% boost in efficiency.
      • Instrumental in driving synergies across product engineering, delved into Kubernetes clusters.
      Skills: TypeScript, NestJS, PostgreSQL.
    `;

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/ats/resumes/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('candidateId', aiCandidateId)
      .field('jobId', jobId)
      .attach('file', Buffer.from(aiResumeContent), 'ai_resume.pdf')
      .expect(201);

    const resumeKey = uploadRes.body.key;

    // 3. Create application
    const appRes = await request(app.getHttpServer())
      .post('/api/v1/ats/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        candidateId: aiCandidateId,
        jobId,
        metadata: { resumeKey },
      })
      .expect(201);

    aiApplicationId = appRes.body.application.id;

    // 4. Trigger worker processing
    const workerResult = await worker.process({
      id: 'job-ai-test',
      data: {
        organizationId,
        applicationId: aiApplicationId,
        candidateId: aiCandidateId,
        resumeKey,
      },
    } as any);

    expect(workerResult.verdict).toBe('AI_GENERATED');
    expect(workerResult.status).toBe('REJECTED');

    // 5. Verify application is auto-rejected in DB and moved to Rejected stage
    const updatedApp = await prisma.application.findUnique({
      where: { id: aiApplicationId },
      include: { currentStage: true },
    });

    expect(updatedApp?.status).toBe('REJECTED');
    expect(updatedApp?.rejectionReason).toContain('AI');
    expect(updatedApp?.currentStage.name).toBe('Rejected');
  });

  it('2. Genuine Human Resume: Calculates ATS score, updates skills, and saves breakdown', async () => {
    // 1. Create candidate
    const candRes = await request(app.getHttpServer())
      .post('/api/v1/ats/candidates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Elena',
        lastName: 'Rostova',
        email: `elena-${timestamp}@example.com`,
      })
      .expect(201);

    humanCandidateId = candRes.body.candidate.id;

    // 2. Upload human resume content
    const humanResumeContent = `
      Elena Rostova
      elena.rostova@example.com | (555) 019-2834
      github.com/erostova | linkedin.com/in/erostova

      Work Experience:
      Senior Backend Developer at Alpha Labs (2020 - Present)
      - Designed RESTful API microservices with TypeScript, NestJS, and PostgreSQL.
      - Containerized internal backend services using Docker and managed Redis caches.
      - 4 years of experience working with SQL databases and CI/CD pipelines.

      Skills: TypeScript, NestJS, PostgreSQL, Redis, Docker, Git.
      Education: Bachelor of Science in Computer Engineering.
    `;

    const uploadRes = await request(app.getHttpServer())
      .post('/api/v1/ats/resumes/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('candidateId', humanCandidateId)
      .field('jobId', jobId)
      .attach('file', Buffer.from(humanResumeContent), 'elena_resume.pdf')
      .expect(201);

    const resumeKey = uploadRes.body.key;

    // 3. Create application
    const appRes = await request(app.getHttpServer())
      .post('/api/v1/ats/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        candidateId: humanCandidateId,
        jobId,
        metadata: { resumeKey },
      })
      .expect(201);

    humanApplicationId = appRes.body.application.id;

    // 4. Trigger worker processing
    const workerResult = await worker.process({
      id: 'job-human-test',
      data: {
        organizationId,
        applicationId: humanApplicationId,
        candidateId: humanCandidateId,
        resumeKey,
      },
    } as any);

    expect(workerResult.verdict).toBe('HUMAN_WRITTEN');
    expect(workerResult.atsScore).toBeGreaterThanOrEqual(70);

    // 5. Query ATS score endpoint (GET /api/v1/ats/applications/:id/ats-score)
    const scoreRes = await request(app.getHttpServer())
      .get(`/api/v1/ats/applications/${humanApplicationId}/ats-score`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(scoreRes.body.atsScore).toBeGreaterThanOrEqual(70);
    expect(scoreRes.body.atsScoreBreakdown.matchedSkills).toContain('TypeScript');
    expect(scoreRes.body.atsScoreBreakdown.matchedSkills).toContain('NestJS');
    expect(scoreRes.body.aiDetection.verdict).toBe('HUMAN_WRITTEN');

    // 6. Verify candidate skills were auto-populated in DB
    const candidateInDb = await prisma.candidate.findUnique({
      where: { id: humanCandidateId },
    });
    expect(candidateInDb?.skills).toContain('TypeScript');
    expect(candidateInDb?.skills).toContain('NestJS');
  });
});
