import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { AppModule } from '../../app.module.js';
import { PrismaService } from '../shared/prisma/prisma.service.js';

describe('ATS Resumes Upload E2E Test Suite', () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let accessToken: string;
  let organizationId: string;
  let candidateId: string;
  let uploadedKey: string;
  let uploadedResumeUrl: string;

  const timestamp = Date.now();
  const testTenant = {
    organizationName: `Resume Corp ${timestamp}`,
    organizationSlug: `resume-corp-${timestamp}`,
    email: `recruiter-${timestamp}@resumecorp.com`,
    password: 'Password123!',
    firstName: 'Resume',
    lastName: 'Manager',
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

    // Register tenant with ATS plan
    const regRes = await request(app.getHttpServer())
      .post('/api/v1/auth/register?plan=ATS')
      .send(testTenant)
      .expect(201);

    accessToken = regRes.body.tokens.accessToken;
    organizationId = regRes.body.user.organizationId;

    // Create a candidate
    const candRes = await request(app.getHttpServer())
      .post('/api/v1/ats/candidates')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        firstName: 'Marcus',
        lastName: 'Fenix',
        email: `marcus-${timestamp}@example.com`,
        skills: ['C++', 'Unreal Engine'],
      })
      .expect(201);

    candidateId = candRes.body.candidate.id;
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

  it('1. Request pre-signed upload URL for PDF (POST /api/v1/ats/resumes/upload-url)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/resumes/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileName: 'marcus_resume.pdf',
        contentType: 'application/pdf',
        candidateId,
      })
      .expect(200);

    expect(res.body.uploadUrl).toBeDefined();
    expect(res.body.key).toContain('marcus_resume.pdf');
    expect(res.body.key).toContain(candidateId);
  });

  it('2. Reject disallowed file format (POST /api/v1/ats/resumes/upload-url) -> 400', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/ats/resumes/upload-url')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        fileName: 'script.exe',
      })
      .expect(400);
  });

  it('3. Direct multipart resume upload (POST /api/v1/ats/resumes/upload)', async () => {
    const mockFileBuffer = Buffer.from('%PDF-1.4 Mock PDF Content');

    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/resumes/upload')
      .set('Authorization', `Bearer ${accessToken}`)
      .field('candidateId', candidateId)
      .attach('file', mockFileBuffer, 'marcus_cv.pdf')
      .expect(201);

    expect(res.body.message).toBe('Resume uploaded successfully');
    expect(res.body.key).toBeDefined();
    expect(res.body.resumeUrl).toBeDefined();

    uploadedKey = res.body.key;
    uploadedResumeUrl = res.body.resumeUrl;

    // Verify candidate was automatically updated with resumeUrl
    const cand = await prisma.candidate.findUnique({
      where: { id: candidateId },
    });
    expect(cand?.resumeUrl).toBe(uploadedResumeUrl);
  });

  it('4. Get secure download URL (GET /api/v1/ats/resumes/download-url?key=...)', async () => {
    const res = await request(app.getHttpServer())
      .get(`/api/v1/ats/resumes/download-url?key=${encodeURIComponent(uploadedKey)}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body.downloadUrl).toBeDefined();
    expect(res.body.key).toBe(uploadedKey);
  });

  it('5. Attach resume to candidate (POST /api/v1/ats/resumes/attach)', async () => {
    const res = await request(app.getHttpServer())
      .post('/api/v1/ats/resumes/attach')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        candidateId,
        resumeUrl: 'https://storage.example.com/resumes/updated.pdf',
        key: 'resumes/org/cand/updated.pdf',
      })
      .expect(200);

    expect(res.body.candidate.resumeUrl).toBe(
      'https://storage.example.com/resumes/updated.pdf',
    );
  });
});
