import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CategoriesController, ProductsController, BasketsController } from './catalog.controller';

/** Ürün kataloğu — products/categories/baskets CRUD (Teknik doküman Bölüm 3.2 / 5.6). */
@Module({
  controllers: [CategoriesController, ProductsController, BasketsController],
  providers: [CatalogService],
})
export class CatalogModule {}
