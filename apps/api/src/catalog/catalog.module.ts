import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CategoriesController, ProductsController, BasketsController } from './catalog.controller';
import { CostComponentsService } from '../intel/cost-components/cost-components.service';
import { PricingRulesService } from '../intel/pricing-rules/pricing-rules.service';

/**
 * Ürün kataloğu — products/categories/baskets CRUD (Teknik doküman Bölüm 3.2 / 5.6).
 * Maliyet servisleri fiyat taban (floor) guard'ı için: katalogdan elle fiyat
 * yazmak da güvenlik ağına tabidir (yalnızca PrismaService'e bağımlılar → burada
 * ayrı instance olmaları sorun değil, stateless).
 */
@Module({
  controllers: [CategoriesController, ProductsController, BasketsController],
  providers: [CatalogService, CostComponentsService, PricingRulesService],
})
export class CatalogModule {}
