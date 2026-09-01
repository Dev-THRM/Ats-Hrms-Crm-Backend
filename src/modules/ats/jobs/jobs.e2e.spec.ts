import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../../app.module.js';
import { PrismaService } from '../../shared/prisma/prisma.service.js';

describe('ATS Jobs Module E2E Test', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testOrgSlug = `jobs-e2e-org-${Date.now()}`;
  const testEmail = `jobs-admin-${Date.now()}@example.com`;
  let accessToken: string;
  let createdJobId: string;
  let stage1Id: string;
  let stage2Id: string;

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
        organizationName: 'Jobs E2E Corp',
        organizationSlug: testOrgSlug,
        firstName: 'Recruiter',
        lastName: 'Admin',
        email: testEmail,
        password: 'Password123!',
      })
      .expect(201);

    accessToken = regRes.body.tokens.accessToken;
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

  it('1. Create job with default pipeline stages (POST /api/v1/ats/jobs)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Senior Node.js Developer',
        description: 'Lead backend microservices and databases',
        department: 'Engineering',
        location: 'Bengaluru, India',
        employmentType: 'FULL_TIME',
        salaryMin: 1800000,
        salaryMax: 2500000,
        salaryCurrency: 'INR',
        experienceMin: 4,
        experienceMax: 8,
      })
      .expect(201);

    expect(res.body.job).toBeDefined();
    expect(res.body.job.id).toBeDefined();
    expect(res.body.job.title).toBe('Senior Node.js Developer');
    expect(res.body.job.status).toBe('DRAFT');
    expect(res.body.job.pipelineStages).toHaveLength(6);
    expect(res.body.job.pipelineStages[0].name).toBe('Applied');
    expect(res.body.job.pipelineStages[0].order).toBe(0);

    createdJobId = res.body.job.id;
    stage1Id = res.body.job.pipelineStages[0].id;
    stage2Id = res.body.job.pipelineStages[1].id;
  });

  it('2. Create job with custom pipeline template (POST /api/v1/ats/jobs)', async () => {
    const customStages = ['Application Review', 'Coding Challenge', 'System Design', 'HR Offer'];
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Principal Architect',
        description: 'Drive system design and platform scaling',
        department: 'Architecture',
        location: 'Remote',
        employmentType: 'FULL_TIME',
        pipelineStages: customStages,
      })
      .expect(201);

    expect(res.body.job.pipelineStages).toHaveLength(4);
    expect(res.body.job.pipelineStages[0].name).toBe('Application Review');
    expect(res.body.job.pipelineStages[3].name).toBe('HR Offer');
  });

  it('3. List jobs with filters and pagination (GET /api/v1/ats/jobs)', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/v1/ats/jobs?search=Node.js&page=1&limit=10')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.data).toBeDefined();
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
    expect(res.body.meta.total).toBeGreaterThanOrEqual(1);
    expect(res.body.data[0].title).toContain('Node.js');
  });

  it('4. Get single job by ID (GET /api/v1/ats/jobs/:id)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/ats/jobs/${createdJobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.id).toBe(createdJobId);
    expect(res.body.pipelineStages).toHaveLength(6);
    expect(res.body.createdBy.email).toBe(testEmail.toLowerCase());
  });

  it('5. Update job details (PATCH /api/v1/ats/jobs/:id)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/ats/jobs/${createdJobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Lead Node.js Developer',
        location: 'Hybrid - Bengaluru',
      })
      .expect(200);

    expect(res.body.title).toBe('Lead Node.js Developer');
    expect(res.body.location).toBe('Hybrid - Bengaluru');
  });

  it('6. Publish job / update status (PATCH /api/v1/ats/jobs/:id/status)', async () => {
    const res = await request(app.getHttpServer())
      .patch(`/api/v1/ats/jobs/${createdJobId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: 'OPEN' })
      .expect(200);

    expect(res.body.status).toBe('OPEN');
  });

  it('7. Reorder pipeline stages (PUT /api/v1/ats/jobs/:id/stages/reorder)', async () => {
    const res = await request(app.getHttpServer())
      .put(`/api/v1/ats/jobs/${createdJobId}/stages/reorder`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        stages: [
          { id: stage1Id, order: 1 },
          { id: stage2Id, order: 0 },
        ],
      })
      .expect(200);

    expect(res.body).toBeDefined();
    const stage2 = res.body.find((s: any) => s.id === stage2Id);
    expect(stage2.order).toBe(0);
  });

  it('8. Delete job (DELETE /api/v1/ats/jobs/:id)', async () => {
    const res = await request(app.getHttpServer())
      .delete(`/api/v1/ats/jobs/${createdJobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.message).toContain('deleted successfully');

    // Confirm it returns 404 now
    await request(app.getHttpServer())
      .get(`/api/v1/ats/jobs/${createdJobId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(404);
  });
});
