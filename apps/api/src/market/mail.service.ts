import { Injectable, Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

/**
 * E-posta gönderimi — sağlayıcıdan bağımsız SMTP.
 * env: SMTP_HOST, SMTP_PORT (587), SMTP_USER, SMTP_PASS, MAIL_FROM.
 * SMTP_HOST tanımlı değilse "log modu": gönderim yapılmaz, mesaj loglanır —
 * geliştirmede akış uçtan uca test edilir, canlıda yalnızca env doldurulur.
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transport = process.env.SMTP_HOST
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT ?? 587),
        secure: Number(process.env.SMTP_PORT ?? 587) === 465,
        auth: process.env.SMTP_USER
          ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS ?? '' }
          : undefined,
      })
    : null;

  /** SMTP yapılandırılmadı → log modu (dev). OTP devCode yalnız bu modda döner. */
  get isLogMode(): boolean {
    return this.transport === null;
  }

  /** true = gerçekten gönderildi; false = log modu (ya da adres yok). Hata fırlatmaz. */
  async send(to: string | null | undefined, subject: string, text: string): Promise<boolean> {
    if (!to) return false;
    if (!this.transport) {
      this.logger.log(`EMAIL (log modu) → ${to} | ${subject} | ${text}`);
      return false;
    }
    try {
      await this.transport.sendMail({
        from: process.env.MAIL_FROM ?? 'KabzıMall <no-reply@kabzimall.local>',
        to,
        subject,
        text,
      });
      return true;
    } catch (e) {
      // E-posta hiçbir ana akışı (sipariş, durum) bloklamaz — logla, devam et.
      this.logger.warn(`E-posta gönderilemedi (${to}): ${(e as Error).message}`);
      return false;
    }
  }
}
