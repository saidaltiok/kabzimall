import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { createHash, randomInt } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { JWT_SECRET } from '../auth/auth.constants';
import { MailService } from './mail.service';

const OTP_TTL_MS = 5 * 60_000; // kod 5 dk geçerli
const OTP_MAX_ATTEMPTS = 5; // kod başına deneme hakkı
const OTP_REQUEST_WINDOW_MS = 10 * 60_000; // e-posta başına pencere
const OTP_MAX_REQUESTS_PER_WINDOW = 3; // pencere içi kod isteği limiti
const CUSTOMER_TOKEN_TTL = '30d';

/** Kod düz metin saklanmaz — e-postaya bağlı hash (başka e-postanın koduyla doğrulanamaz). */
const hashCode = (email: string, code: string) =>
  createHash('sha256').update(`${email.toLocaleLowerCase('tr')}:${code}`).digest('hex');

/**
 * Müşteri e-posta OTP girişi (guest-first korunur: sipariş için giriş ŞART DEĞİL).
 * Doğrulanan e-postaya kind:'customer' JWT verilir; "Siparişlerim" bu e-postayla
 * verilen siparişleri sunucudan listeler (cihaz değişse de kaybolmaz).
 */
@Injectable()
export class CustomerAuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly mail: MailService,
  ) {}

  /** Basit IP başına kayan-pencere limiti (OTP isteği + telefonla sipariş arama). */
  private readonly ipHits = new Map<string, number[]>();
  assertIpLimit(key: string, max = 10, windowMs = 15 * 60_000) {
    const now = Date.now();
    const hits = (this.ipHits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (hits.length >= max) {
      throw new BadRequestException('Çok fazla deneme yapıldı. Lütfen biraz sonra tekrar deneyin.');
    }
    hits.push(now);
    this.ipHits.set(key, hits);
  }

  /** 6 haneli kod üret, hash'le sakla, e-postala. Log modunda devCode döner (yalnız dev). */
  async requestOtp(emailRaw: string, ip: string) {
    const email = emailRaw.trim().toLocaleLowerCase('tr');
    this.assertIpLimit(`otp:${ip}`, 10);

    // E-posta başına pencere limiti (DB'den — süreç yeniden başlasa da tutar).
    const since = new Date(Date.now() - OTP_REQUEST_WINDOW_MS);
    const recent = await this.prisma.customerOtp.count({
      where: { tenantId: DEV_TENANT_ID, email, createdAt: { gte: since } },
    });
    if (recent >= OTP_MAX_REQUESTS_PER_WINDOW) {
      throw new BadRequestException('Bu e-postaya kısa süre önce kod gönderildi. Birkaç dakika sonra tekrar deneyin.');
    }

    const code = String(randomInt(100000, 1000000)); // 6 hane, kriptografik rastgele
    await this.prisma.customerOtp.create({
      data: {
        tenantId: DEV_TENANT_ID,
        email,
        codeHash: hashCode(email, code),
        expiresAt: new Date(Date.now() + OTP_TTL_MS),
      },
    });
    await this.mail.send(email, 'KabzıMall giriş kodunuz', `Giriş kodunuz: ${code} (5 dakika geçerlidir). Siz istemediyseniz bu e-postayı yok sayın.`);
    return { sent: true, ...(this.mail.isLogMode ? { devCode: code } : {}) };
  }

  /** Kodu doğrula → müşteri token'ı (30 gün). Yanlış kod deneme hakkını düşürür. */
  async verifyOtp(emailRaw: string, code: string) {
    const email = emailRaw.trim().toLocaleLowerCase('tr');
    const otp = await this.prisma.customerOtp.findFirst({
      where: { tenantId: DEV_TENANT_ID, email, consumedAt: null, expiresAt: { gte: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    if (!otp) throw new BadRequestException('Geçerli bir kod bulunamadı. Yeni kod isteyin.');
    if (otp.attempts >= OTP_MAX_ATTEMPTS) {
      throw new BadRequestException('Çok fazla yanlış deneme. Yeni kod isteyin.');
    }
    if (otp.codeHash !== hashCode(email, code.trim())) {
      await this.prisma.customerOtp.update({ where: { id: otp.id }, data: { attempts: { increment: 1 } } });
      throw new BadRequestException('Kod hatalı. Tekrar deneyin.');
    }
    await this.prisma.customerOtp.update({ where: { id: otp.id }, data: { consumedAt: new Date() } });
    const token = this.jwt.sign({ kind: 'customer', email }, { secret: JWT_SECRET, expiresIn: CUSTOMER_TOKEN_TTL });
    return { token, email };
  }

  /** Authorization başlığından doğrulanmış müşteri e-postasını çıkarır. */
  emailFromAuthHeader(auth: string | undefined): string {
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('Giriş gerekli.');
    try {
      const payload = this.jwt.verify<{ kind?: string; email?: string }>(token, { secret: JWT_SECRET });
      if (payload.kind !== 'customer' || !payload.email) throw new Error('kind');
      return payload.email;
    } catch {
      throw new UnauthorizedException('Oturum geçersiz ya da süresi dolmuş. Yeniden giriş yapın.');
    }
  }
}
