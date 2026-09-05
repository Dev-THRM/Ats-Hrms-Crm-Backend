import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';
import { JobStatus } from '@prisma/client';

describe('ATS Dashboard & Public Career Portal E2E Tests', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  const testOrgSlug = `public-portal-org-${Date.now()}`;
  const testEmail = `admin-${Date.now()}@portaltest.com`;
  let accessToken: string;
  let orgId: string;
  let openJobId: string;
  let draftJobId: string;

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

    // Register test organization
    const registerRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register?plan=ATS')
      .send({
        email: testEmail,
        password: 'Password123!',
        firstName: 'Public',
        lastName: 'Admin',
        organizationName: 'Public Portal Corp',
        organizationSlug: testOrgSlug,
      })
      .expect(201);

    accessToken = registerRes.body.tokens.accessToken;
    orgId = registerRes.body.user.organization.id;

    // Create an OPEN job
    const openJobRes = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Senior Frontend Architect',
        department: 'Engineering',
        location: 'Remote',
        employmentType: 'FULL_TIME',
        experienceLevel: 'SENIOR',
        description: 'Lead our Next.js frontend architecture',
        salaryMin: 120000,
        salaryMax: 160000,
        salaryCurrency: 'USD',
        salaryVisible: true,
      })
      .expect(201);

    openJobId = openJobRes.body.job.id;

    // Publish the job to OPEN status
    await request(app.getHttpServer())
      .patch(`/api/v1/ats/jobs/${openJobId}/status`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ status: JobStatus.OPEN })
      .expect(200);

    // Create a DRAFT job (should not appear in public careers)
    const draftJobRes = await request(app.getHttpServer())
      .post('/api/v1/ats/jobs')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        title: 'Internal Confidential Role',
        department: 'Executive',
        location: 'HQ',
        employmentType: 'FULL_TIME',
        description: 'Draft internal role',
      })
      .expect(201);

    draftJobId = draftJobRes.body.job.id;
  });

  afterAll(async () => {
    try {
      if (orgId) {
        await prisma.organization.delete({ where: { id: orgId } });
      }
    } catch {
      // Ignore cleanup errors
    }
    await app.close();
  });

  describe('Public Career Portal (Unauthenticated)', () => {
    it('1. GET /api/v1/ats/public/jobs/:orgSlug - returns only OPEN published jobs', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ats/public/jobs/${testOrgSlug}`)
        .expect(200);

      expect(res.body.organization.slug).toBe(testOrgSlug);
      expect(res.body.organization.name).toBe('Public Portal Corp');
      expect(res.body.totalJobs).toBe(1);
      expect(res.body.jobs[0].id).toBe(openJobId);
      expect(res.body.jobs[0].title).toBe('Senior Frontend Architect');
    });

    it('2. GET /api/v1/ats/public/jobs/:orgSlug/:jobId - returns job details for open job', async () => {
      const res = await request(app.getHttpServer())
        .get(`/api/v1/ats/public/jobs/${testOrgSlug}/${openJobId}`)
        .expect(200);

      expect(res.body.job.id).toBe(openJobId);
      expect(res.body.job.title).toBe('Senior Frontend Architect');
      expect(res.body.job.description).toContain('Next.js');
    });

    it('3. GET /api/v1/ats/public/jobs/:orgSlug/:jobId - returns 404 for draft job', async () => {
      await request(app.getHttpServer())
        .get(`/api/v1/ats/public/jobs/${testOrgSlug}/${draftJobId}`)
        .expect(404);
    });

    it('4. POST /api/v1/ats/public/jobs/:orgSlug/:jobId/apply - submits public application with resume upload', async () => {
      const res = await request(app.getHttpServer())
        .post(`/api/v1/ats/public/jobs/${testOrgSlug}/${openJobId}/apply`)
        .field('firstName', 'Jane')
        .field('lastName', 'Candidate')
        .field('email', `jane.cand-${Date.now()}@example.com`)
        .field('phone', '+14155552671')
        .field('location', 'San Francisco, CA')
        .field('currentTitle', 'Senior Frontend Engineer')
        .field('coverLetter', 'I am thrilled to apply for the Senior Frontend Architect position.')
        .attach('file', Buffer.from('%PDF-1.4 Mock Public Resume Content'), 'jane_resume.pdf')
        .expect(201);

      expect(res.body.message).toBe('Application submitted successfully');
      expect(res.body.applicationId).toBeDefined();
      expect(res.body.candidateId).toBeDefined();
      expect(res.body.jobTitle).toBe('Senior Frontend Architect');
    });
  });

  describe('ATS Dashboard Engine (Authenticated HR/Recruiter)', () => {
    it('5. GET /api/v1/ats/dashboard - aggregates real metrics and funnel breakdown', async () => {
      const res = await request(app.getHttpServer())
        .get('/api/v1/ats/dashboard')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(res.body.kpis).toBeDefined();
      expect(res.body.kpis.totalJobsCount).toBeGreaterThanOrEqual(2);
      expect(res.body.kpis.activeJobsCount).toBeGreaterThanOrEqual(1);
      expect(res.body.kpis.activeApplications).toBeGreaterThanOrEqual(1);
      expect(res.body.kpis.totalCandidates).toBeGreaterThanOrEqual(1);

      expect(res.body.pipelineFunnel).toBeDefined();
      expect(Array.isArray(res.body.pipelineFunnel)).toBe(true);

      expect(res.body.sourcesBreakdown).toBeDefined();
      expect(Array.isArray(res.body.sourcesBreakdown)).toBe(true);
      const portalSource = res.body.sourcesBreakdown.find(
        (s: any) => s.source === 'CAREER_PORTAL',
      );
      expect(portalSource).toBeDefined();

      expect(res.body.recentApplications).toBeDefined();
      expect(Array.isArray(res.body.recentApplications)).toBe(true);
      expect(res.body.recentApplications.length).toBeGreaterThanOrEqual(1);
      expect(res.body.upcomingInterviews).toBeDefined();
    });
  });
});
