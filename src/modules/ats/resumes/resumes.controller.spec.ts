import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResumesController } from './resumes.controller.js';
import { ResumesService, UploadedResumeFile } from './resumes.service.js';
import { StorageService } from '../../shared/storage/storage.service.js';

describe('ResumesController', () => {
  let controller: ResumesController;
  let resumesService: ResumesService;
  let storageService: StorageService;

  const mockOrgId = 'org-123';

  beforeEach(() => {
    resumesService = {
      getPresignedUploadUrl: vi.fn().mockResolvedValue({
        uploadUrl: 'https://example.com/upload',
        key: 'resumes/org-123/cand-1/resume.pdf',
      }),
      uploadDirect: vi.fn().mockResolvedValue({
        message: 'Resume uploaded successfully',
        resumeUrl: 'https://cdn.example.com/resume.pdf',
      }),
      getDownloadUrl: vi.fn().mockResolvedValue({
        downloadUrl: 'https://cdn.example.com/resume.pdf',
      }),
      attachResume: vi.fn().mockResolvedValue({
        message: 'Resume attached successfully',
      }),
    } as unknown as ResumesService;

    storageService = {
      uploadBuffer: vi.fn().mockResolvedValue({
        key: 'resumes/org-123/resume.pdf',
        url: '/storage/resumes/org-123/resume.pdf',
      }),
    } as unknown as StorageService;

    controller = new ResumesController(resumesService, storageService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('should get presigned upload URL', async () => {
    const dto = { fileName: 'resume.pdf' };
    const result = await controller.getPresignedUploadUrl(mockOrgId, dto);

    expect(result.uploadUrl).toBe('https://example.com/upload');
    expect(resumesService.getPresignedUploadUrl).toHaveBeenCalledWith(
      mockOrgId,
      dto,
    );
  });

  it('should upload direct resume file', async () => {
    const mockFile: UploadedResumeFile = {
      originalname: 'resume.pdf',
      mimetype: 'application/pdf',
      size: 5000,
      buffer: Buffer.from('test'),
    };

    const result = await controller.uploadDirect(
      mockOrgId,
      mockFile,
      'cand-1',
    );

    expect(result.message).toBe('Resume uploaded successfully');
    expect(resumesService.uploadDirect).toHaveBeenCalledWith(
      mockOrgId,
      mockFile,
      'cand-1',
      undefined,
    );
  });
});
