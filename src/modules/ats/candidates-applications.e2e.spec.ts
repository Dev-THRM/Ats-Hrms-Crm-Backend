import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';

describe('ATS Candidates & Applications E2E Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testOrgSlug = `cand-app-org-${Date.now()}`;
  const testEmail = `recruiter-${Date.now()}@example.com`;
  let accessToken: string;
  let jobId: string;
  let screeningStageId: string;
  let hiredStageId: string;
  let rejectedStageId: string;
  let candidate1Id: string;
  let application1Id: string;
  let application2Id: string;

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

    // Register tenant with ATS plan
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register?plan=ATS')
      .send({
        organizationName: 'Candidates & Apps E2E Corp',
        organizationSlug: testOrgSlug,
        firstName: 'Recruiter',
        lastName: 'Specialist',
        email: testEmail,
        password: 'Password123!',
      })
      .expect(201);

    accessToken = regRes.body.tokens.accessToken;

    // Create a job
    const jobRes = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Senior Full Stack Engineer',
        description: 'React, Node.js, and Postgres expertise required',
        department: 'Engineering',
        location: 'Remote',
      })
      .expect(201);

    jobId = jobRes.body.job.id;
    const stages = jobRes.body.job.pipelineStages;
    screeningStageId = stages.find((s: any) => s.name === 'Screening').id;
    hiredStageId = stages.find((s: any) => s.name === 'Hired').id;
    rejectedStageId = stages.find((s: any) => s.name === 'Rejected').id;
  }, 30000);

  afterAll(async () => {
    const org = await prisma.organization.findUnique({
      where: { slug: testOrgSlug },
    });
    if (org) {
      await prisma.organization.delete({
        where: { id: org.id },
      });
    }
    await app.close();
  });

  it('1. Create candidate (POST /api/v1/ats/candidates)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/candidates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Sarah',
        lastName: 'Connor',
        email: 'sarah.connor@example.com',
        phone: '+1234567890',
        currentCompany: 'Cyberdyne Systems',
        currentTitle: 'Lead Architect',
        skills: ['TypeScript', 'Node.js', 'PostgreSQL', 'Docker'],
        source: 'LINKEDIN',
      })
      .expect(201);

    expect(res.body.candidate).toBeDefined();
    expect(res.body.candidate.id).toBeDefined();
    expect(res.body.candidate.email).toBe('sarah.connor@example.com');
    expect(res.body.candidate.skills).toContain('TypeScript');

    candidate1Id = res.body.candidate.id;
  });

  it('2. Prevent duplicate candidate email in same tenant (POST /api/v1/ats/candidates) -> 409', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ats/candidates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Sarah',
        lastName: 'Connor',
        email: 'sarah.connor@example.com',
      })
      .expect(409);
  });

  it('3. Query candidates by skill (GET /api/v1/ats/candidates?skill=TypeScript)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ats/candidates?skill=TypeScript')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].email).toBe('sarah.connor@example.com');
  });

  it('4. Apply existing candidate to job (POST /api/v1/ats/applications)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        jobId,
        candidateId: candidate1Id,
        coverLetter: 'Excited about the full stack role!',
      })
      .expect(201);

    expect(res.body.application).toBeDefined();
    expect(res.body.application.jobId).toBe(jobId);
    expect(res.body.application.candidateId).toBe(candidate1Id);
    expect(res.body.application.currentStage.name).toBe('Applied');
    expect(res.body.application.status).toBe('ACTIVE');

    application1Id = res.body.application.id;
  });

  it('5. Prevent duplicate application for same job (POST /api/v1/ats/applications) -> 409', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ats/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        jobId,
        candidateId: candidate1Id,
      })
      .expect(409);
  });

  it('6. Apply with inline candidate creation (POST /api/v1/ats/applications)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/applications')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        jobId,
        candidate: {
          firstName: 'John',
          lastName: 'Reese',
          email: 'john.reese@example.com',
          skills: ['Python', 'FastAPI'],
        },
        coverLetter: 'Security and backend specialist',
      })
      .expect(201);

    expect(res.body.application).toBeDefined();
    expect(res.body.application.candidate.email).toBe('john.reese@example.com');
    expect(res.body.application.currentStage.name).toBe('Applied');

    application2Id = res.body.application.id;
  });

  it('7. List applications filtered by jobId (GET /api/v1/ats/applications?jobId=...)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/ats/applications?jobId=${jobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data).toHaveLength(2);
    expect(res.body.meta.total).toBe(2);
  });

  it('8. Get single application detail (GET /api/v1/ats/applications/:id)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/ats/applications/${application1Id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(application1Id);
    expect(res.body.candidate.email).toBe('sarah.connor@example.com');
    expect(res.body.job.id).toBe(jobId);
  });

  it('9. Move application to Screening stage (PATCH /api/v1/ats/applications/:id/stage)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/ats/applications/${application1Id}/stage`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stageId: screeningStageId })
      .expect(200);

    expect(res.body.currentStage.id).toBe(screeningStageId);
    expect(res.body.status).toBe('ACTIVE');
  });

  it('10. Move application to Hired stage (auto-status HIRED) (PATCH /api/v1/ats/applications/:id/stage)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/ats/applications/${application1Id}/stage`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ stageId: hiredStageId })
      .expect(200);

    expect(res.body.currentStage.id).toBe(hiredStageId);
    expect(res.body.status).toBe('HIRED');
  });

  it('11. Move application to Rejected stage with reason (auto-status REJECTED)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/ats/applications/${application2Id}/stage`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stageId: rejectedStageId,
        rejectionReason: 'Position closed before interview',
      })
      .expect(200);

    expect(res.body.currentStage.id).toBe(rejectedStageId);
    expect(res.body.status).toBe('REJECTED');
    expect(res.body.rejectionReason).toBe('Position closed before interview');
  });

  it('12. Delete application (DELETE /api/v1/ats/applications/:id)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/ats/applications/${application2Id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.message).toContain('deleted successfully');
  });
});
