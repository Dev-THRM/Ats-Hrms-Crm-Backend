export interface WhatsAppMessagePayload {
  to: string; // E.164 formatted phone number e.g. +919876543210, +5511999999999
  templateName?: string;
  languageCode?: string;
  parameters?: Record<string, string>;
  bodyText: string;
}

export interface WhatsAppSendResult {
  success: boolean;
  messageId?: string;
  provider: 'meta_cloud_api' | 'console_mock' | 'baileys';
  error?: string;
  timestamp: Date;
}

export interface IWhatsAppDriver {
  readonly providerName: 'meta_cloud_api' | 'console_mock' | 'baileys';
  sendMessage(payload: WhatsAppMessagePayload): Promise<WhatsAppSendResult>;
}
