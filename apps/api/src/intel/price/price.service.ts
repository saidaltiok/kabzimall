import { BadRequestException, Injectable } from '@nestjs/common';
import {
  resolvePrice,
  suggestPrice,
  DEFAULT_CHAIN,
  type CostInput,
  type Competitor,
  type SuggestParams,
  type SuggestResult,
  type Strategy,
} from '../../pricing-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { ResolvePriceDto, STRATEGIES } from './dto/resolve-price.dto';
import { SuggestPriceDto } from './dto/suggest-price.dto';
import { ApplyPriceDto } from './dto/apply-price.dto';

@Injectable()
export class PriceService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Hiyerarşik fiyat çözümü. Tüm hesap packages/pricing'te;
   * burada yalnızca girdi doğrulanır ve motora geçirilir.
   */
  resolve(dto: ResolvePriceDto): SuggestResult & { chainUsed: string[] } {
    const chain = (dto.chain ?? DEFAULT_CHAIN).map((s) => {
      if (!STRATEGIES.includes(s.strategy as Strategy)) {
        throw new BadRequestException(`Geçersiz strateji: ${s.strategy}`);
      }
      return { strategy: s.strategy as Strategy, params: s.params as SuggestParams | undefined };
    });

    const cost = dto.cost as CostInput;
    const competitors = (dto.competitors ?? []) as Competitor[];
    const baseParams = (dto.baseParams ?? {}) as SuggestParams;

    let result: SuggestResult;
    try {
      result = resolvePrice(cost, competitors, chain, baseParams);
    } catch (e) {
      // fireRate / marj+komisyon gibi RangeError'ları 400'e çevir.
      throw new BadRequestException((e as Error).message);
    }

    return { ...result, chainUsed: chain.map((c) => c.strategy) };
  }

  /**
   * Tek strateji ile öneri (fallback yok). Veri yetersizse (ör. COMP_AVG
   * istenip rakip yoksa) motor taban marja düşer / floored döner.
   */
  suggest(dto: SuggestPriceDto): SuggestResult {
    const cost = dto.cost as CostInput;
    const competitors = (dto.competitors ?? []) as Competitor[];
    const params = (dto.params ?? {}) as SuggestParams;

    try {
      return suggestPrice(cost, competitors, dto.strategy, params);
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /**
   * Seçilen fiyatı ürünün mağaza fiyatı (base_price) olarak yayınlar ve
   * price_history'e append-only kayıt düşer (Teknik doküman Bölüm 6.3).
   * Client `productId`'yi ürün slug'ı olarak gönderir (katalog henüz yok).
   */
  apply(dto: ApplyPriceDto) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.product.findUnique({
        where: { tenantId_slug: { tenantId: DEV_TENANT_ID, slug: dto.productId } },
        select: { id: true, basePrice: true },
      });
      const oldPrice = existing?.basePrice ?? null;

      const productSelect = {
        id: true,
        slug: true,
        basePrice: true,
        createdAt: true,
        updatedAt: true,
      } as const;

      const product = existing
        ? await tx.product.update({
            where: { id: existing.id },
            data: { basePrice: dto.price },
            select: productSelect,
          })
        : await tx.product.create({
            data: { tenantId: DEV_TENANT_ID, slug: dto.productId, basePrice: dto.price },
            select: productSelect,
          });

      const history = await tx.priceHistory.create({
        data: {
          tenantId: DEV_TENANT_ID,
          productId: product.id,
          oldPrice,
          newPrice: dto.price,
          strategyApplied: dto.strategy,
          reason: dto.reason ?? null,
          netMargin: dto.netMargin ?? null,
          changedBy: dto.changedBy ?? null,
        },
      });

      return { product, history };
    });
  }

  /** Uygulanmış fiyat değişikliklerinin geçmişi (en yeni → en eski). */
  async findHistory(productSlug?: string) {
    if (productSlug) {
      const product = await this.prisma.product.findUnique({
        where: { tenantId_slug: { tenantId: DEV_TENANT_ID, slug: productSlug } },
        select: { id: true },
      });
      if (!product) return [];
      return this.prisma.priceHistory.findMany({
        where: { productId: product.id },
        orderBy: { changedAt: 'desc' },
      });
    }
    return this.prisma.priceHistory.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: { changedAt: 'desc' },
    });
  }
}
