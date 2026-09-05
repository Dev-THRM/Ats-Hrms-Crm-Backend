import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConfigService } from '@nestjs/config';
import { WhatsAppService } from './whatsapp.service.js';
import { IWhatsAppDriver } from './whatsapp-driver.interface.js';

describe('WhatsAppService', () => {
  let service: WhatsAppService;
  let configService: ConfigService;

  beforeEach(() => {
    configService = new ConfigService();
    service = new WhatsAppService(configService);
  });

  it('should initialize with Console/Mock driver by default', () => {
    expect(service.activeProvider).toBe('console_mock');
  });

  it('should successfully dispatch message via mock driver', async () => {
    const result = await service.send({
      to: '+5511999999999',
      templateName: 'ats_stage_interview',
      bodyText: 'Hello candidate!',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('console_mock');
    expect(result.messageId).toBeDefined();
  });

  it('should skip sending if recipient phone number is missing', async () => {
    const result = await service.send({
      to: '',
      bodyText: 'No phone number provided',
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('Phone number is missing');
  });

  it('should allow setting a custom driver instance', async () => {
    const customDriver: IWhatsAppDriver = {
      providerName: 'baileys',
      sendMessage: vi.fn().mockResolvedValue({
        success: true,
        messageId: 'baileys_msg_123',
        provider: 'baileys',
        timestamp: new Date(),
      }),
    };

    service.setDriver(customDriver);
    expect(service.activeProvider).toBe('baileys');

    const result = await service.send({
      to: '+628123456789',
      bodyText: 'Hi from Baileys driver',
    });

    expect(result.success).toBe(true);
    expect(result.provider).toBe('baileys');
    expect(customDriver.sendMessage).toHaveBeenCalled();
  });
});
