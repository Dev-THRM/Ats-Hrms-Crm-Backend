import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  IWhatsAppDriver,
  WhatsAppMessagePayload,
  WhatsAppSendResult,
} from './whatsapp-driver.interface.js';

/**
 * Default Mock / Development Driver that logs WhatsApp dispatches to console without external API calls.
 */
class ConsoleMockWhatsAppDriver implements IWhatsAppDriver {
  readonly providerName = 'console_mock' as const;
  private readonly logger = new Logger('WhatsAppConsoleDriver');

  async sendMessage(payload: WhatsAppMessagePayload): Promise<WhatsAppSendResult> {
    this.logger.log(
      `[MOCK DISPATCH] Sending WhatsApp to: ${payload.to} | Template: ${payload.templateName || 'custom'}\nContent: "${payload.bodyText}"`,
    );

    return {
      success: true,
      messageId: `mock_wamid_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      provider: 'console_mock',
      timestamp: new Date(),
    };
  }
}

/**
 * Official Meta Cloud API Driver (Facebook Graph API).
 */
class MetaCloudApiWhatsAppDriver implements IWhatsAppDriver {
  readonly providerName = 'meta_cloud_api' as const;
  private readonly logger = new Logger('MetaCloudApiWhatsAppDriver');

  constructor(
    private readonly apiToken: string,
    private readonly phoneNumberId: string,
    private readonly graphApiVersion: string = 'v19.0',
  ) {}

  async sendMessage(payload: WhatsAppMessagePayload): Promise<WhatsAppSendResult> {
    const url = `https://graph.facebook.com/${this.graphApiVersion}/${this.phoneNumberId}/messages`;

    // Construct Meta Cloud API template or text payload
    const body: Record<string, any> = {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: payload.to.replace(/[^0-9+]/g, ''),
    };

    if (payload.templateName) {
      const parameterList = payload.parameters
        ? Object.entries(payload.parameters).map(([_, value]) => ({
            type: 'text',
            text: value,
          }))
        : [];

      body.type = 'template';
      body.template = {
        name: payload.templateName,
        language: {
          code: payload.languageCode || 'en',
        },
        components:
          parameterList.length > 0
            ? [
                {
                  type: 'body',
                  parameters: parameterList,
                },
              ]
            : undefined,
      };
    } else {
      body.type = 'text';
      body.text = {
        preview_url: false,
        body: payload.bodyText,
      };
    }

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.apiToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      const json = await response.json();

      if (!response.ok) {
        this.logger.error(
          `Meta WhatsApp API returned HTTP ${response.status}: ${JSON.stringify(json)}`,
        );
        return {
          success: false,
          error: json?.error?.message || `HTTP ${response.status}`,
          provider: 'meta_cloud_api',
          timestamp: new Date(),
        };
      }

      const messageId = json?.messages?.[0]?.id;
      return {
        success: true,
        messageId,
        provider: 'meta_cloud_api',
        timestamp: new Date(),
      };
    } catch (err: any) {
      this.logger.error(`Failed to send WhatsApp message via Meta Cloud API: ${err.message}`);
      return {
        success: false,
        error: err.message,
        provider: 'meta_cloud_api',
        timestamp: new Date(),
      };
    }
  }
}

@Injectable()
export class WhatsAppService {
  private readonly logger = new Logger(WhatsAppService.name);
  private driver: IWhatsAppDriver;

  constructor(private readonly config: ConfigService) {
    const provider = this.config.get<string>('WHATSAPP_PROVIDER', 'mock');
    const apiToken = this.config.get<string>('WHATSAPP_API_TOKEN');
    const phoneNumberId = this.config.get<string>('WHATSAPP_PHONE_NUMBER_ID');

    if (provider === 'meta' && apiToken && phoneNumberId) {
      this.logger.log('Initializing Meta Cloud API WhatsApp driver');
      this.driver = new MetaCloudApiWhatsAppDriver(apiToken, phoneNumberId);
    } else {
      this.logger.log('Initializing Console / Mock WhatsApp driver (Safe for Dev/Test)');
      this.driver = new ConsoleMockWhatsAppDriver();
    }
  }

  /**
   * Sets custom driver instance (useful for testing or switching to Baileys / custom gateway).
   */
  setDriver(driver: IWhatsAppDriver) {
    this.driver = driver;
  }

  /**
   * Current active driver name.
   */
  get activeProvider(): string {
    return this.driver.providerName;
  }

  /**
   * Dispatches WhatsApp message to candidate.
   */
  async send(payload: WhatsAppMessagePayload): Promise<WhatsAppSendResult> {
    if (!payload.to || payload.to.trim() === '') {
      this.logger.warn('Skipping WhatsApp dispatch: recipient phone number is missing');
      return {
        success: false,
        error: 'Phone number is missing',
        provider: this.driver.providerName,
        timestamp: new Date(),
      };
    }

    return this.driver.sendMessage(payload);
  }
}
