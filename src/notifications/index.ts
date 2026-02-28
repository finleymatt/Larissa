import nodemailer from 'nodemailer';
import axios from 'axios';
import { Alert, AlertConfig } from '../types';
import { logger } from '../utils/logger';

export class NotificationService {
  private config: AlertConfig;
  private emailTransporter?: nodemailer.Transporter;
  private alertHistory: Alert[] = [];

  constructor(config: AlertConfig) {
    this.config = config;

    if (config.enableEmail && config.smtpHost && config.smtpUser && config.smtpPass) {
      this.emailTransporter = nodemailer.createTransport({
        host: config.smtpHost,
        port: config.smtpPort || 587,
        secure: false,
        auth: {
          user: config.smtpUser,
          pass: config.smtpPass,
        },
      });
    }
  }

  async send(alert: Alert): Promise<void> {
    this.alertHistory.push(alert);
    logger.info(`[ALERT] ${alert.title}: ${alert.message}`);

    const promises: Promise<void>[] = [];

    if (this.config.enableEmail && this.emailTransporter) {
      promises.push(this.sendEmail(alert));
    }

    if (this.config.enableWebhook && this.config.webhookUrl) {
      promises.push(this.sendWebhook(alert));
    }

    await Promise.allSettled(promises);
  }

  private async sendEmail(alert: Alert): Promise<void> {
    if (!this.emailTransporter || !this.config.alertEmail) return;

    try {
      await this.emailTransporter.sendMail({
        from: this.config.smtpUser,
        to: this.config.alertEmail,
        subject: `[Larissa Bot] ${alert.title}`,
        text: alert.message,
        html: this.formatEmailHtml(alert),
      });
      logger.debug(`Email alert sent: ${alert.title}`);
    } catch (error: any) {
      logger.error(`Failed to send email alert: ${error.message}`);
    }
  }

  private async sendWebhook(alert: Alert): Promise<void> {
    if (!this.config.webhookUrl) return;

    try {
      await axios.post(this.config.webhookUrl, {
        text: `*${alert.title}*\n${alert.message}`,
        blocks: [
          {
            type: 'section',
            text: {
              type: 'mrkdwn',
              text: `*${alert.title}*\n${alert.message}`,
            },
          },
        ],
      });
      logger.debug(`Webhook alert sent: ${alert.title}`);
    } catch (error: any) {
      logger.error(`Failed to send webhook alert: ${error.message}`);
    }
  }

  private formatEmailHtml(alert: Alert): string {
    const typeColors: Record<string, string> = {
      trade_opened: '#4CAF50',
      trade_closed: '#2196F3',
      signal: '#FF9800',
      risk_warning: '#f44336',
      error: '#f44336',
      daily_summary: '#9C27B0',
    };

    const color = typeColors[alert.type] || '#333';

    return `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background-color: ${color}; color: white; padding: 12px 20px; border-radius: 4px 4px 0 0;">
          <h2 style="margin: 0;">${alert.title}</h2>
        </div>
        <div style="background-color: #f5f5f5; padding: 20px; border: 1px solid #ddd; border-radius: 0 0 4px 4px;">
          <pre style="white-space: pre-wrap; font-size: 14px;">${alert.message}</pre>
          <p style="color: #666; font-size: 12px; margin-top: 20px;">
            ${new Date(alert.timestamp).toISOString()}
          </p>
        </div>
      </div>
    `;
  }

  getAlertHistory(): Alert[] {
    return [...this.alertHistory];
  }
}
