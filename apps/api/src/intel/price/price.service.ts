import { BadRequestException, Injectable } from '@nestjs/common';
import {
  resolvePrice,
  suggestPrice,
  directCost,
  netMargin,
  priceForMargin,
  psych,
  DEFAULT_CHAIN,
  type CostInput,
  type Competitor,
  type SuggestParams,
  type SuggestResult,
  type Strategy,
} from '../../pricing-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { CostComponentsService } from '../cost-components/cost-components.service';
import { CompetitorsService } from '../competitors/competitors.service';
import { PricingRulesService } from '../pricing-rules/pricing-rules.service';
import { ResolvePriceDto, STRATEGIES } from './dto/resolve-price.dto';
import { SuggestPriceDto } from './dto/suggest-price.dto';
import { ApplyPriceDto } from './dto/apply-price.dto';
import { SuggestProductDto } from './dto/suggest-product.dto';
import { ResolveProductDto } from './dto/resolve-product.dto';
import { BulkApplyDto } from './dto/bulk-apply.dto';
import { ScenarioDto } from './dto/scenario.dto';

/** productId ile öneride DB'den toplanan girdilerin özeti (panel gösterimi). */
interface AssembledInputs {
  halAvg: number;
  costSource: 'PRODUCT' | 'GLOBAL';
  directCost: number;
  competitorCount: number;
  competitorAvg: number | null;
}

@Injectable()
export class PriceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
    private readonly competitors: CompetitorsService,
    private readonly rules: PricingRulesService,
  ) {}

  /**
   * Ürünün kalıcı fiyat kuralını (varsa) çağrı parametrelerinin ALTINA serer:
   * çağrı açıkça bir alanı verdiyse o kazanır; yoksa kural varsayılanı uygulanır.
   * Böylece "sebzede taban %25" gibi kurallar öneride otomatik devreye girer.
   */
  private async withRuleDefaults(
    productId: string,
    params: SuggestParams | undefined,
  ): Promise<{ params: SuggestParams; strategy: Strategy | null; ruleMatched: { scope: string; refId: string }[] }> {
    const eff = await this.rules.resolveEffective(productId);
    const merged: SuggestParams = {
      ...(eff.targetMargin != null ? { targetMargin: eff.targetMargin } : {}),
      ...(eff.floorMargin != null ? { floorMargin: eff.floorMargin } : {}),
      ...(eff.psychological != null ? { psychological: eff.psychological } : {}),
      ...(params ?? {}), // çağrı parametreleri kuralı ezer
    };
    return { params: merged, strategy: (eff.strategy as Strategy | null) ?? null, ruleMatched: eff.matched };
  }

  /**
   * Hiyerarşik fiyat çözümü. Tüm hesap packages/pricing'te;
   * burada yalnızca girdi doğrulanır ve motora geçirilir.
   */
  resolve(dto: ResolvePriceDto): SuggestResult & { chainUsed: string[] } {
    const chain = this.buildChain(dto.chain);

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
            // Katalogda yoksa yer tutucu oluştur (ad = slug; katalogdan düzenlenebilir).
            data: { tenantId: DEV_TENANT_ID, slug: dto.productId, name: dto.productId, basePrice: dto.price },
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

  /**
   * productId ile öneri: maliyeti (cost-components + günlük hal ort.) ve
   * rakipleri DB'den toplar, tek strateji uygular. Panel "öner" akışı.
   */
  async suggestForProduct(
    dto: SuggestProductDto,
  ): Promise<SuggestResult & { inputs: AssembledInputs; ruleMatched: { scope: string; refId: string }[] }> {
    const { cost, competitors, inputs } = await this.assemble(dto.productId, dto.halAvg, dto.date);
    const { params, strategy: ruleStrategy, ruleMatched } = await this.withRuleDefaults(dto.productId, dto.params);
    const strategy = dto.strategy ?? ruleStrategy ?? ('MARGIN' as Strategy);
    try {
      return { ...suggestPrice(cost, competitors, strategy, params), inputs, ruleMatched };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /** productId ile hiyerarşik çözüm (fallback zinciri) — girdiler DB'den. */
  async resolveForProduct(
    dto: ResolveProductDto,
  ): Promise<SuggestResult & { chainUsed: string[]; inputs: AssembledInputs }> {
    const { cost, competitors, inputs } = await this.assemble(dto.productId, dto.halAvg, dto.date);
    const chain = this.buildChain(dto.chain);
    const { params: baseParams } = await this.withRuleDefaults(dto.productId, dto.baseParams);
    try {
      const result = resolvePrice(cost, competitors, chain, baseParams);
      return { ...result, chainUsed: chain.map((c) => c.strategy), inputs };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /**
   * Toplu öneri/uygulama. Her ürün için girdiler DB'den toplanır, strateji
   * uygulanır. Varsayılan önizleme; commit=true ise base_price + price_history
   * yazılır. Maliyet/hal eksik ürün batch'i bozmaz → "skipped".
   */
  async bulkApply(dto: BulkApplyDto) {
    const results: Array<Record<string, unknown>> = [];

    for (const slug of dto.productIds) {
      let assembled: Awaited<ReturnType<PriceService['assemble']>>;
      try {
        assembled = await this.assemble(slug, undefined, dto.date);
      } catch (e) {
        results.push({ productId: slug, skipped: true, reason: (e as Error).message });
        continue;
      }

      const { params: ruleParams } = await this.withRuleDefaults(slug, dto.params);
      const sug = suggestPrice(assembled.cost, assembled.competitors, dto.strategy, ruleParams);
      const current = await this.prisma.product.findUnique({
        where: { tenantId_slug: { tenantId: DEV_TENANT_ID, slug } },
        select: { basePrice: true },
      });

      let applied = false;
      if (dto.commit) {
        await this.apply({
          productId: slug,
          price: sug.price,
          strategy: sug.strategy,
          netMargin: sug.netMargin,
          reason: 'Toplu güncelleme',
        });
        applied = true;
      }

      results.push({
        productId: slug,
        currentPrice: current?.basePrice ?? null,
        suggestedPrice: sug.price,
        netMargin: sug.netMargin,
        competitionIndex: sug.competitionIndex,
        strategy: sug.strategy,
        floored: sug.floored,
        belowCost: sug.belowCost,
        applied,
      });
    }

    return {
      committed: !!dto.commit,
      total: dto.productIds.length,
      applied: results.filter((r) => r.applied).length,
      skipped: results.filter((r) => r.skipped).length,
      results,
    };
  }

  /**
   * Senaryo (what-if): ürünün baz maliyet girdilerini alır, verilen mutlak
   * override'ları uygular ve baz vs senaryo için directCost/netMargin/öneri
   * fiyatını karşılaştırır. Tüm hesap packages/pricing'te.
   */
  async scenario(dto: ScenarioDto) {
    const overrides = dto.overrides ?? {};
    const { cost: base } = await this.assemble(dto.productId, overrides.halAvg, dto.date);

    const product = await this.prisma.product
      .findUnique({ where: { tenantId_slug: { tenantId: DEV_TENANT_ID, slug: dto.productId } }, select: { basePrice: true } })
      .catch(() => null);
    const targetMargin = dto.targetMargin ?? 0.3;

    // Yalnızca verilen alanları ez (mutlak değerler).
    const scen: CostInput = { ...base };
    for (const k of ['halAvg', 'fireRate', 'labor', 'packaging', 'fuel', 'coldStorage', 'amortization', 'commissionRate'] as const) {
      if (overrides[k] != null) (scen[k] as number) = overrides[k] as number;
    }

    try {
      const basePrice = dto.basePrice ?? product?.basePrice ?? psych(priceForMargin(base, targetMargin));
      const round4 = (n: number) => +n.toFixed(4);
      const baseDC = Math.round(directCost(base));
      const scenDC = Math.round(directCost(scen));
      return {
        productId: dto.productId,
        basePrice,
        targetMargin,
        baseline: {
          directCost: baseDC,
          netMargin: round4(netMargin(base, basePrice)),
          suggestedPrice: psych(priceForMargin(base, targetMargin)),
          inputs: base,
        },
        scenario: {
          directCost: scenDC,
          netMargin: round4(netMargin(scen, basePrice)),
          suggestedPrice: psych(priceForMargin(scen, targetMargin)),
          inputs: scen,
        },
        delta: {
          directCost: scenDC - baseDC,
          directCostPct: baseDC > 0 ? round4((scenDC - baseDC) / baseDC) : null,
          netMarginPts: round4(netMargin(scen, basePrice) - netMargin(base, basePrice)),
        },
      };
    } catch (e) {
      throw new BadRequestException((e as Error).message);
    }
  }

  /** cost-components + günlük hal ort. + rakipleri motor girdisine dönüştürür. */
  private async assemble(
    productId: string,
    halAvgOverride?: number,
    date?: string,
  ): Promise<{ cost: CostInput; competitors: Competitor[]; inputs: AssembledInputs }> {
    // Maliyet bileşeni yoksa costForProduct 404 fırlatır.
    const cost = await this.costs.costForProduct(productId, halAvgOverride);
    if (cost.breakdown == null || cost.halAvg == null || cost.directCost == null) {
      throw new BadRequestException(
        `Ürün için hal fiyatı yok (${productId}); halAvg gönderin ya da önce hal girişi yapın.`,
      );
    }

    const comp = await this.competitors.pricesFor(productId, date);
    const competitors: Competitor[] = comp.entries.map((e) => ({
      name: e.competitor,
      group: e.group,
      price: e.price,
    }));

    return {
      cost: cost.breakdown,
      competitors,
      inputs: {
        halAvg: cost.halAvg,
        costSource: cost.source,
        directCost: cost.directCost,
        competitorCount: comp.count,
        competitorAvg: comp.average,
      },
    };
  }

  /** dto.chain (yoksa DEFAULT_CHAIN) → doğrulanmış strateji zinciri. */
  private buildChain(chain?: { strategy: string; params?: unknown }[]) {
    return (chain ?? DEFAULT_CHAIN).map((s) => {
      if (!STRATEGIES.includes(s.strategy as Strategy)) {
        throw new BadRequestException(`Geçersiz strateji: ${s.strategy}`);
      }
      return { strategy: s.strategy as Strategy, params: s.params as SuggestParams | undefined };
    });
  }
}
