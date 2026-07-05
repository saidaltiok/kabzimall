import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';

export interface CouponCheck {
  valid: boolean;
  code: string;
  discount: number; // kuruş
  message: string;
}

const normalize = (code: string) => code.trim().toLocaleUpperCase('tr').replace(/İ/g, 'I');

/**
 * Kupon/kampanya: PERCENT (yüzde) ya da FIXED (kuruş) indirim. Doğrulama ve
 * indirim hesabı HER ZAMAN sunucuda; kullanım sayacı sipariş transaction'ı
 * içinde atomik artar (maxUses yarışı olmaz).
 */
@Injectable()
export class CouponService {
  constructor(private readonly prisma: PrismaService) {}

  /** İndirim hesabı (kuruş) — ara toplamı asla aşmaz. */
  static discountFor(coupon: { type: string; value: number }, subtotal: number): number {
    const raw = coupon.type === 'PERCENT' ? Math.round((subtotal * coupon.value) / 100) : coupon.value;
    return Math.max(0, Math.min(raw, subtotal));
  }

  /** Sepette/checkout'ta önizleme: geçerli mi + ne kadar indirim. Hata fırlatmaz. */
  async check(codeRaw: string, subtotal: number): Promise<CouponCheck> {
    const code = normalize(codeRaw ?? '');
    if (!code) return { valid: false, code, discount: 0, message: 'Kupon kodu girin.' };
    const c = await this.prisma.coupon.findUnique({ where: { tenantId_code: { tenantId: DEV_TENANT_ID, code } } });
    if (!c || !c.isActive) return { valid: false, code, discount: 0, message: 'Kupon bulunamadı ya da aktif değil.' };
    if (c.expiresAt && c.expiresAt < new Date()) return { valid: false, code, discount: 0, message: 'Kuponun süresi dolmuş.' };
    if (c.maxUses != null && c.usedCount >= c.maxUses) return { valid: false, code, discount: 0, message: 'Kupon kullanım limitine ulaştı.' };
    if (subtotal < c.minSubtotal) {
      return { valid: false, code, discount: 0, message: `Bu kupon ${(c.minSubtotal / 100).toLocaleString('tr-TR')} ₺ ve üzeri sepetlerde geçerli.` };
    }
    const discount = CouponService.discountFor(c, subtotal);
    return { valid: true, code, discount, message: c.type === 'PERCENT' ? `%${c.value} indirim uygulandı.` : 'İndirim uygulandı.' };
  }

  /**
   * Sipariş oluşturma sırasında kullan: koşullu atomik artış — koşullar artık
   * sağlanmıyorsa (limit dolduysa) sipariş 400 ile durur, sessizce indirimsiz geçmez.
   */
  async redeem(tx: Prisma.TransactionClient, codeRaw: string, subtotal: number): Promise<{ code: string; discount: number }> {
    const code = normalize(codeRaw);
    const c = await tx.coupon.findUnique({ where: { tenantId_code: { tenantId: DEV_TENANT_ID, code } } });
    if (!c) throw new BadRequestException('Kupon bulunamadı.');
    const pre = await this.check(code, subtotal);
    if (!pre.valid) throw new BadRequestException(pre.message);
    const res = await tx.coupon.updateMany({
      where: {
        id: c.id,
        isActive: true,
        OR: [{ maxUses: null }, { usedCount: { lt: c.maxUses ?? 0 } }],
      },
      data: { usedCount: { increment: 1 } },
    });
    if (res.count === 0) throw new BadRequestException('Kupon kullanım limitine ulaştı.');
    return { code, discount: CouponService.discountFor(c, subtotal) };
  }

  /** Paketlemede gerçek gramaj sonrası indirimi yeniden hesapla (PERCENT ölçeklenir, FIXED sabit). */
  async recompute(codeRaw: string | null, fallbackDiscount: number, finalSubtotal: number): Promise<number> {
    if (!codeRaw) return Math.min(fallbackDiscount, finalSubtotal);
    const c = await this.prisma.coupon.findUnique({ where: { tenantId_code: { tenantId: DEV_TENANT_ID, code: normalize(codeRaw) } } }).catch(() => null);
    if (!c) return Math.min(fallbackDiscount, finalSubtotal); // kupon silinmişse sipariş anındaki tutar korunur
    return CouponService.discountFor(c, finalSubtotal);
  }

  /* ------------------------------ Admin ------------------------------ */

  list() {
    return this.prisma.coupon.findMany({ where: { tenantId: DEV_TENANT_ID }, orderBy: { createdAt: 'desc' } });
  }

  async create(dto: { code: string; type: 'PERCENT' | 'FIXED'; value: number; minSubtotal?: number; expiresAt?: string; maxUses?: number }) {
    const code = normalize(dto.code);
    if (!/^[A-Z0-9_-]{3,24}$/.test(code)) throw new BadRequestException('Kod 3-24 karakter; harf/rakam/tire.');
    if (dto.type === 'PERCENT' && (dto.value < 1 || dto.value > 100)) throw new BadRequestException('Yüzde 1-100 arası olmalı.');
    if (dto.type === 'FIXED' && dto.value < 1) throw new BadRequestException('Tutar (kuruş) pozitif olmalı.');
    try {
      return await this.prisma.coupon.create({
        data: {
          tenantId: DEV_TENANT_ID,
          code,
          type: dto.type,
          value: dto.value,
          minSubtotal: dto.minSubtotal ?? 0,
          expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : null,
          maxUses: dto.maxUses ?? null,
        },
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Bu kupon kodu zaten var.');
      }
      throw e;
    }
  }

  async setActive(id: string, isActive: boolean) {
    const r = await this.prisma.coupon.updateMany({ where: { id, tenantId: DEV_TENANT_ID }, data: { isActive } });
    if (r.count === 0) throw new NotFoundException('Kupon bulunamadı.');
    return this.prisma.coupon.findUnique({ where: { id } });
  }
}
