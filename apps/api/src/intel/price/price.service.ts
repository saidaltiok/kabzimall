import { BadRequestException, Injectable } from '@nestjs/common';
import {
  resolvePrice,
  DEFAULT_CHAIN,
  type CostInput,
  type Competitor,
  type SuggestParams,
  type SuggestResult,
  type Strategy,
} from '../../pricing-engine';
import { ResolvePriceDto, STRATEGIES } from './dto/resolve-price.dto';

@Injectable()
export class PriceService {
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
}
