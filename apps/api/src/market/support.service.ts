import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MailService } from './mail.service';
import { DEV_TENANT_ID } from '../common/tenant';

const MAX_PER_DAY_PER_IP = 5;

/**
 * Destek talepleri: web iletişim formu → panelde kuyruk. Admin yanıtı
 * müşteriye e-postayla gider (SMTP yoksa LOG modu). IP başına günlük
 * gönderim sınırı basit koruma sağlar.
 */
@Injectable()
export class SupportService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
  ) {}

  async create(dto: { name: string; email?: string; phone?: string; orderCode?: string; message: string }, ip: string) {
    const name = dto.name?.trim();
    const message = dto.message?.trim();
    if (!name || !message) throw new BadRequestException('Ad ve mesaj zorunlu.');
    if (message.length > 2000) throw new BadRequestException('Mesaj en fazla 2000 karakter olabilir.');
    if (!dto.email?.trim() && !dto.phone?.trim()) throw new BadRequestException('Size dönebilmemiz için e-posta ya da telefon girin.');

    const since = new Date(Date.now() - 86_400_000);
    const recent = await this.prisma.supportTicket.count({ where: { tenantId: DEV_TENANT_ID, ip, createdAt: { gte: since } } });
    if (recent >= MAX_PER_DAY_PER_IP) throw new BadRequestException('Günlük talep sınırına ulaşıldı — lütfen yarın tekrar deneyin.');

    const t = await this.prisma.supportTicket.create({
      data: {
        tenantId: DEV_TENANT_ID,
        name,
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        orderCode: dto.orderCode?.trim().toUpperCase() || null,
        message,
        ip,
      },
    });
    return { id: t.id, ok: true, message: 'Talebiniz alındı — en kısa sürede dönüş yapacağız.' };
  }

  list(status?: string) {
    return this.prisma.supportTicket.findMany({
      where: { tenantId: DEV_TENANT_ID, ...(status ? { status } : {}) },
      orderBy: [{ status: 'desc' }, { createdAt: 'desc' }], // OPEN önce (desc: OPEN > CLOSED)
      take: 200,
    });
  }

  /** Yanıtla ve/veya kapat — yanıt varsa müşteriye e-posta gider. */
  async update(id: string, dto: { reply?: string; status?: 'OPEN' | 'CLOSED' }, actor?: string) {
    const t = await this.prisma.supportTicket.findFirst({ where: { id, tenantId: DEV_TENANT_ID } });
    if (!t) throw new NotFoundException('Talep bulunamadı.');
    if (dto.status && !['OPEN', 'CLOSED'].includes(dto.status)) throw new BadRequestException('Geçersiz durum.');

    const reply = dto.reply?.trim();
    const updated = await this.prisma.supportTicket.update({
      where: { id },
      data: {
        ...(reply ? { reply, repliedBy: actor ?? null } : {}),
        ...(dto.status ? { status: dto.status } : {}),
      },
    });
    if (reply && t.email) {
      await this.mail.send(t.email, `Destek talebinize yanıt${t.orderCode ? ` (${t.orderCode})` : ''}`, `Merhaba ${t.name},\n\n${reply}\n\nKabzıMall`).catch(() => {});
    }
    return updated;
  }
}
