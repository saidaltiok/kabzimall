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
import { ResolvePriceDto, STRATEGIES } from './dto/resolve-price.dto';
import { SuggestPriceDto } from './dto/suggest-price.dto';
import { ApplyPriceDto } from './dto/apply-price.dto';
import { ProductsStore, type ProductRecord } from './products.store';
import { PriceHistoryStore, type PriceHistoryRecord } from './price-history.store';

@Injectable()
export class PriceService {
  constructor(
    private readonly products: ProductsStore,
    private readonly history: PriceHistoryStore,
  ) {}

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
   */
  apply(dto: ApplyPriceDto): { product: ProductRecord; history: PriceHistoryRecord } {
    const { product, oldPrice } = this.products.setBasePrice(dto.productId, dto.price);
    const history = this.history.append({
      productId: dto.productId,
      oldPrice,
      newPrice: dto.price,
      strategyApplied: dto.strategy,
      reason: dto.reason ?? null,
      netMargin: dto.netMargin ?? null,
      changedBy: dto.changedBy ?? null,
    });
    return { product, history };
  }

  /** Uygulanmış fiyat değişikliklerinin geçmişi (en yeni → en eski). */
  findHistory(productId?: string): PriceHistoryRecord[] {
    return this.history.findAll(productId);
  }
}
