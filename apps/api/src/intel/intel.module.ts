import { Module } from '@nestjs/common';
import { PriceController } from './price/price.controller';
import { PriceService } from './price/price.service';
import { HalPurchasesController } from './hal-purchases/hal-purchases.controller';
import { HalPurchasesService } from './hal-purchases/hal-purchases.service';
import { CostPoolController } from './cost-pool/cost-pool.controller';
import { CostPoolService } from './cost-pool/cost-pool.service';
import { HalController } from './hal/hal.controller';
import { HalService } from './hal/hal.service';
import { IbbHalService } from './hal/ibb-hal.service';
import { CompetitorsService } from './competitors/competitors.service';
import { MarketFiyatiService } from './competitors/market-fiyati.service';
import { ManavService } from './competitors/manav.service';
import { CompetitorSyncService } from './competitors/competitor-sync.service';
import { CompetitorGroupsController } from './competitors/competitor-groups.controller';
import { CompetitorsController } from './competitors/competitors.controller';
import { CompetitorPricesController } from './competitors/competitor-prices.controller';
import { CostComponentsService } from './cost-components/cost-components.service';
import {
  CostComponentsController,
  CostController,
} from './cost-components/cost-components.controller';
import { DashboardService } from './dashboard/dashboard.service';
import { DashboardController, ProductsTableController } from './dashboard/dashboard.controller';
import { PricingRulesService } from './pricing-rules/pricing-rules.service';
import { PricingRulesController } from './pricing-rules/pricing-rules.controller';
import { AnalyticsService } from './analytics/analytics.service';
import { AnalyticsController } from './analytics/analytics.controller';
import { AiBriefService } from './ai/ai-brief.service';
import { AiBriefController } from './ai/ai-brief.controller';
import { PricingMatrixService } from './pricing-matrix/pricing-matrix.service';
import { PricingMatrixController } from './pricing-matrix/pricing-matrix.controller';
import { FinanceService } from './finance/finance.service';
import { FinanceController } from './finance/finance.controller';

/**
 * Intelligence (fiyat zekâsı) modülü — Teknik doküman Bölüm 5.5.
 * Kalıcılık PrismaService üzerinden (global PrismaModule).
 * Uçlar:
 *   POST /intel/price/resolve   — hiyerarşik fiyat çözümü (resolvePrice)
 *   POST /intel/price/suggest   — tek strateji ile öneri (suggestPrice)
 *   POST /intel/price/apply     — base_price yayınla + price_history (Bölüm 6.3)
 *   GET  /intel/price/history   — uygulanan fiyat geçmişi
 *   POST /intel/hal/entries     — günlük hal fiyatı (append-only)
 *   POST /intel/hal/bulk        — Saha Modu toplu hal kaydı
 *   GET  /intel/hal             — ürün × gün ızgarası + günlük ortalama
 *        /intel/competitor-groups · /intel/competitors — rakip tanımları
 *        /intel/competitor-prices — rakip fiyatı (append-only) + min/max/avg/median
 *   PUT  /intel/cost-components — maliyet bileşeni (scope: GLOBAL/PRODUCT)
 *   GET  /intel/cost/:productId — etkin maliyet + directCost kırılımı
 *   GET  /intel/dashboard       — KPI + riskli ürünler + son değişiklikler
 *        /intel/hal-purchases   — hal alımı + ±500 g tartı mutabakatı
 *        /intel/cost-pool       — havuz/dağıtımlı maliyet → birim (kg) tahsis
 */
@Module({
  controllers: [
    PriceController,
    HalController,
    CompetitorGroupsController,
    CompetitorsController,
    CompetitorPricesController,
    CostComponentsController,
    CostController,
    DashboardController,
    ProductsTableController,
    HalPurchasesController,
    CostPoolController,
    PricingRulesController,
    AnalyticsController,
    AiBriefController,
    PricingMatrixController,
    FinanceController,
  ],
  providers: [
    PriceService,
    HalService,
    IbbHalService,
    CompetitorsService,
    MarketFiyatiService,
    ManavService,
    CompetitorSyncService,
    CostComponentsService,
    DashboardService,
    HalPurchasesService,
    CostPoolService,
    PricingRulesService,
    AnalyticsService,
    AiBriefService,
    PricingMatrixService,
    FinanceService,
  ],
})
export class IntelModule {}
