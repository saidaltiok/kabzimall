import { Module } from '@nestjs/common';
import { CatalogService } from './catalog.service';
import { CategoriesController, ProductsController } from './catalog.controller';

/** Ürün kataloğu — products/categories CRUD (Teknik doküman Bölüm 3.2 / 5.6). */
@Module({
  controllers: [CategoriesController, ProductsController],
  providers: [CatalogService],
})
export class CatalogModule {}
