import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GeminiParserService } from './gemini-parser.service.js';
import { ConfigService } from '@nestjs/config';

describe('GeminiParserService', () => {
  let service: GeminiParserService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService();
    service = new GeminiParserService(configService);
  });

  it('should be defined and inactive when GEMINI_API_KEY is not provided', () => {
    expect(service).toBeDefined();
    expect(service.isAiActive()).toBe(false);
  });

  it('should initialize successfully when GEMINI_API_KEY is provided', () => {
    const customConfig = {
      get: vi.fn().mockImplementation((key) => {
        if (key === 'GEMINI_API_KEY') return 'AIzaSyMockKey12345';
        return null;
      }),
    } as unknown as ConfigService;

    const activeService = new GeminiParserService(customConfig);
    expect(activeService.isAiActive()).toBe(true);
  });
});
