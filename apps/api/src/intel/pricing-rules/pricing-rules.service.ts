import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { UpsertPricingRuleDto } from './dto/pricing-rule.dto';

export interface EffectiveRule {
  strategy: string | null;
  targetMargin: number | null;
  floorMargin: number | null;
  psychological: boolean | null;
  /** Hangi kapsamlar katki verdi (seffaflik/panel gosterimi). */
  matched: { scope: string; refId: string }[];
}

@Injectable()
export class PricingRulesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.pricingRule.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ scope: 'asc' }, { refId: 'asc' }],
    });
  }

  async upsert(dto: UpsertPricingRuleDto) {
    const refId = dto.scope === 'GLOBAL' ? '' : (dto.refId?.trim() ?? '');
    if (dto.scope !== 'GLOBAL' && !refId) {
      throw new BadRequestException('CATEGORY/PRODUCT kapsami icin refId (kategori/urun slug) gerekli');
    }
    const data = {
      strategy: dto.strategy ?? null,
      targetMargin: dto.targetMargin ?? null,
      floorMargin: dto.floorMargin ?? null,
      psychological: dto.psychological ?? true,
    };
    return this.prisma.pricingRule.upsert({
      where: { tenantId_scope_refId: { tenantId: DEV_TENANT_ID, scope: dto.scope, refId } },
      create: { tenantId: DEV_TENANT_ID, scope: dto.scope, refId, ...data },
      update: data,
    });
  }

  async remove(id: string) {
    const r = await this.prisma.pricingRule.findFirst({ where: { id, tenantId: DEV_TENANT_ID } }).catch(() => null);
    if (!r) throw new NotFoundException(`Kural bulunamadi: ${id}`);
    await this.prisma.pricingRule.delete({ where: { id } });
    return { deleted: true };
  }

  /**
   * Urun icin etkin kural — alan bazli en-spesifik kazanir (PRODUCT > CATEGORY > GLOBAL).
   * Orn. GLOBAL taban %20, CATEGORY(sebze) taban %25 → sebze urununde %25 gecerli.
   */
  async resolveEffective(productSlug: string): Promise<EffectiveRule> {
    const product = await this.prisma.product
      .findFirst({ where: { tenantId: DEV_TENANT_ID, slug: productSlug }, select: { category: { select: { slug: true } } } })
      .catch(() => null);
    const categorySlug = product?.category?.slug ?? null;

    const or: { scope: string; refId: string }[] = [
      { scope: 'GLOBAL', refId: '' },
      { scope: 'PRODUCT', refId: productSlug },
    ];
    if (categorySlug) or.push({ scope: 'CATEGORY', refId: categorySlug });

    const rules = await this.prisma.pricingRule.findMany({
      where: { tenantId: DEV_TENANT_ID, OR: or },
    });
    const g = rules.find((r) => r.scope === 'GLOBAL');
    const c = rules.find((r) => r.scope === 'CATEGORY');
    const p = rules.find((r) => r.scope === 'PRODUCT');
    const order = [p, c, g]; // en spesifikten genele

    const pick = <T>(get: (r: (typeof rules)[number]) => T | null | undefined): T | null => {
      for (const r of order) {
        if (!r) continue;
        const v = get(r);
        if (v !== null && v !== undefined) return v;
      }
      return null;
    };

    return {
      strategy: pick((r) => r.strategy),
      targetMargin: pick((r) => r.targetMargin),
      floorMargin: pick((r) => r.floorMargin),
      psychological: pick((r) => r.psychological),
      matched: order.filter(Boolean).map((r) => ({ scope: r!.scope, refId: r!.refId })),
    };
  }
}
