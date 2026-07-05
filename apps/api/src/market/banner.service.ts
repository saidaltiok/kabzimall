import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';

/**
 * Vitrin banner'ları: ana sayfa promo alanı panelden yönetilir. Vitrine yalnız
 * aktif kayıtlar, sortOrder sırasıyla döner; kupon kodu banner'da rozet olur.
 */
@Injectable()
export class BannerService {
  constructor(private readonly prisma: PrismaService) {}

  /** Vitrin: aktif banner'lar (sortOrder → en yenisi önce). */
  activeForStorefront() {
    return this.prisma.banner.findMany({
      where: { tenantId: DEV_TENANT_ID, isActive: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
      select: { id: true, kicker: true, title: true, subtitle: true, couponCode: true },
    });
  }

  list() {
    return this.prisma.banner.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'desc' }],
    });
  }

  async create(dto: { title: string; kicker?: string; subtitle?: string; couponCode?: string; sortOrder?: number }) {
    const title = dto.title?.trim();
    if (!title) throw new BadRequestException('Başlık zorunlu.');
    if (dto.couponCode?.trim()) {
      // yanlış yazılmış kod yayına çıkmasın — kupon var mı bak (aktiflik anlık kontrol, uyarı değil engel)
      const code = dto.couponCode.trim().toLocaleUpperCase('tr').replace(/İ/g, 'I');
      const c = await this.prisma.coupon.findUnique({ where: { tenantId_code: { tenantId: DEV_TENANT_ID, code } } });
      if (!c) throw new BadRequestException(`'${code}' diye bir kupon yok — önce kuponu oluşturun.`);
      dto.couponCode = code;
    }
    return this.prisma.banner.create({
      data: {
        tenantId: DEV_TENANT_ID,
        title,
        kicker: dto.kicker?.trim() || null,
        subtitle: dto.subtitle?.trim() || null,
        couponCode: dto.couponCode?.trim() || null,
        sortOrder: dto.sortOrder ?? 0,
      },
    });
  }

  async setActive(id: string, isActive: boolean) {
    const r = await this.prisma.banner.updateMany({ where: { id, tenantId: DEV_TENANT_ID }, data: { isActive } });
    if (r.count === 0) throw new NotFoundException('Banner bulunamadı.');
    return this.prisma.banner.findUnique({ where: { id } });
  }

  async remove(id: string) {
    const r = await this.prisma.banner.deleteMany({ where: { id, tenantId: DEV_TENANT_ID } });
    if (r.count === 0) throw new NotFoundException('Banner bulunamadı.');
    return { ok: true };
  }
}
