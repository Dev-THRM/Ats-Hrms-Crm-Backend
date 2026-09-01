import { describe, it, expect, beforeEach } from 'vitest';
import { StorageService } from './storage.service.js';
import { ConfigService } from '@nestjs/config';

describe('StorageService', () => {
  let service: StorageService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService();
    service = new StorageService(configService);
  });

  it('should be defined in Local-Safe mode when R2 is not configured', () => {
    expect(service).toBeDefined();
    expect(service.isR2Active()).toBe(false);
  });

  it('should generate a local presigned upload URL in local mode', async () => {
    const result = await service.generatePresignedUploadUrl(
      'resumes/org-1/cand-1/resume.pdf',
      'application/pdf',
    );

    expect(result.uploadUrl).toContain('/api/v1/ats/resumes/local-upload');
    expect(result.key).toBe('resumes/org-1/cand-1/resume.pdf');
  });

  it('should upload a buffer locally and read it back', async () => {
    const testKey = 'test/mock-resume.pdf';
    const testBuffer = Buffer.from('PDF Mock Content');

    const uploadResult = await service.uploadBuffer({
      key: testKey,
      buffer: testBuffer,
      contentType: 'application/pdf',
    });

    expect(uploadResult.key).toBe(testKey);

    const fetchedBuffer = await service.getFileBuffer(testKey);
    expect(fetchedBuffer.toString()).toBe('PDF Mock Content');

    // Clean up
    await service.deleteFile(testKey);
  });
});
