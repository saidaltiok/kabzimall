import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { avg, directCost, type CostInput } from '../../pricing-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { UpsertCostComponentDto } from './dto/upsert-cost-component.dto';
import type { CostComponent } from '@prisma/client';

export interface CostBreakdownResult {
  productId: string;
  /** Etkin bileşenin kaynağı. */
  source: 'PRODUCT' | 'GLOBAL';
  /** Kullanılan hal ortalaması (kuruş); yoksa null → directCost hesaplanamaz. */
  halAvg: number | null;
  components: {
    fireRate: number;
    packaging: number;
    labor: number;
    fuel: number;
    coldStorage: number;
    amortization: number;
    commissionRate: number;
    taxRate: number;
  };
  /** packages/pricing.directCost (kuruş); halAvg yoksa null. */
  directCost: number | null;
  breakdown: CostInput | null;
}

@Injectable()
export class CostComponentsService {
  constructor(private readonly prisma: PrismaService) {}

  async upsert(dto: UpsertCostComponentDto): Promise<CostComponent> {
    if (dto.scope !== 'GLOBAL' && !dto.refId) {
      throw new BadRequestException(`${dto.scope} kapsamı için refId zorunludur`);
    }
    const refId = dto.scope === 'GLOBAL' ? '' : dto.refId!;
    const fields = {
      fireRate: dto.fireRate ?? 0,
      packaging: dto.packaging ?? 0,
      labor: dto.labor ?? 0,
      fuel: dto.fuel ?? 0,
      coldStorage: dto.coldStorage ?? 0,
      amortization: dto.amortization ?? 0,
      commissionRate: dto.commissionRate ?? 0,
      taxRate: dto.taxRate ?? 0,
    };

    return this.prisma.costComponent.upsert({
      where: { tenantId_scope_refId: { tenantId: DEV_TENANT_ID, scope: dto.scope, refId } },
      create: { tenantId: DEV_TENANT_ID, scope: dto.scope, refId, ...fields },
      update: fields,
    });
  }

  list() {
    return this.prisma.costComponent.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ scope: 'asc' }, { refId: 'asc' }],
    });
  }

  /**
   * Ürün için etkin maliyet (en-spesifik kazanır: PRODUCT > GLOBAL) + directCost.
   * halAvg: ?halAvg= override, yoksa ürünün en güncel günlük hal ortalaması.
   */
  async costForProduct(
    productId: string,
    halAvgOverride?: number,
  ): Promise<CostBreakdownResult> {
    const [product, global] = await Promise.all([
      this.prisma.costComponent.findFirst({
        where: { tenantId: DEV_TENANT_ID, scope: 'PRODUCT', refId: productId },
      }),
      this.prisma.costComponent.findFirst({
        where: { tenantId: DEV_TENANT_ID, scope: 'GLOBAL', refId: '' },
      }),
    ]);

    const effective = product ?? global;
    if (!effective) {
      throw new NotFoundException(
        `Maliyet bileşeni tanımlı değil (ürün: ${productId}). Önce PUT /intel/cost-components.`,
      );
    }

    const halAvg = halAvgOverride ?? (await this.latestHalAvg(productId));
    const components = {
      fireRate: effective.fireRate,
      packaging: effective.packaging,
      labor: effective.labor,
      fuel: effective.fuel,
      coldStorage: effective.coldStorage,
      amortization: effective.amortization,
      commissionRate: effective.commissionRate,
      taxRate: effective.taxRate,
    };

    let breakdown: CostInput | null = null;
    let dc: number | null = null;
    if (halAvg != null) {
      breakdown = {
        halAvg,
        fireRate: components.fireRate,
        labor: components.labor,
        packaging: components.packaging,
        fuel: components.fuel,
        coldStorage: components.coldStorage,
        amortization: components.amortization,
        commissionRate: components.commissionRate,
      };
      dc = Math.round(directCost(breakdown));
    }

    return {
      productId,
      source: product ? 'PRODUCT' : 'GLOBAL',
      halAvg,
      components,
      directCost: dc,
      breakdown,
    };
  }

  /** Ürünün en güncel güne ait hal fiyatlarının ortalaması (kuruş) ya da null. */
  private async latestHalAvg(productSlug: string): Promise<number | null> {
    const latest = await this.prisma.halPriceEntry.findFirst({
      where: { tenantId: DEV_TENANT_ID, productSlug },
      orderBy: { date: 'desc' },
      select: { date: true },
    });
    if (!latest) return null;

    const sameDay = await this.prisma.halPriceEntry.findMany({
      where: { tenantId: DEV_TENANT_ID, productSlug, date: latest.date },
      select: { price: true },
    });
    return Math.round(avg(sameDay.map((e) => e.price)));
  }
}
