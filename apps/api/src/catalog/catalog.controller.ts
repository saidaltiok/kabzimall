import { Body, Controller, Delete, Get, Header, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Roles } from '../auth/decorators';
import { CATALOG_WRITERS, type JwtUser } from '../auth/auth.constants';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto, CreateProductDto, UpdateProductDto, ImportCsvDto } from './dto/product.dto';
import { CreateBasketDto } from './dto/basket.dto';

@ApiTags('katalog')
@Controller('catalog/categories')
export class CategoriesController {
  constructor(private readonly service: CatalogService) {}

  @Get()
  async list() {
    const data = await this.service.listCategories();
    return { data, meta: { total: data.length } };
  }

  @Post()
  @Roles(...CATALOG_WRITERS)
  create(@Body() dto: CreateCategoryDto) {
    return this.service.createCategory(dto);
  }
}

@ApiTags('katalog')
@Controller('catalog/products')
export class ProductsController {
  constructor(private readonly service: CatalogService) {}

  /** GET /catalog/products?search=&categoryId=&active=true|false */
  @Get()
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'active', required: false, enum: ['true', 'false'] })
  async list(
    @Query('search') search?: string,
    @Query('categoryId') categoryId?: string,
    @Query('active') active?: string,
  ) {
    const data = await this.service.listProducts({ search, categoryId, active });
    return { data, meta: { total: data.length } };
  }

  /** GET /catalog/products/export-csv — Excel toplu düzenleme dosyası (":id"den ÖNCE tanımlı olmalı). */
  @Get('export-csv')
  @Header('Content-Type', 'text/csv; charset=utf-8')
  @Header('Content-Disposition', 'attachment; filename="kabzimall-urunler.csv"')
  exportCsv() {
    return this.service.exportCsv();
  }

  /**
   * POST /catalog/products/import-csv { csv, apply } — Excel dosyasını içeri al.
   * apply=false: yalnız önizleme (hiçbir şey yazılmaz); apply=true: hatasız satırlar uygulanır.
   */
  @Post('import-csv')
  @Roles(...CATALOG_WRITERS)
  @ApiBody({ schema: { example: { csv: 'slug;ad;kategori;birim;fiyat;indirimli;stok;aktif\ndomates;Domates;Sebze;kg;74,90;;46;EVET', apply: false } } })
  importCsv(@Body() dto: ImportCsvDto, @CurrentUser() user: JwtUser) {
    return this.service.importCsv(dto.csv, !!dto.apply, user?.email);
  }

  /** GET /catalog/products/stock-movements?product=&days=30 — stok hareket defteri (":id"den ÖNCE tanımlı olmalı). */
  @Get('stock-movements')
  @ApiQuery({ name: 'product', required: false })
  @ApiQuery({ name: 'days', required: false })
  async stockMovements(@Query('product') product?: string, @Query('days') days?: string) {
    const data = await this.service.stockMovements({ product, days: days ? Number(days) : 30 });
    return { data, meta: { total: data.length } };
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  /** GET /catalog/products/:id/substitutes — ikame listesi (sıralı). */
  @Get(':id/substitutes')
  async substitutes(@Param('id') id: string) {
    const data = await this.service.getSubstitutes(id);
    return { data };
  }

  /** PUT /catalog/products/:id/substitutes { slugs: [...] } — ikameleri değiştir (max 5, sıra dizi sırası). */
  @Put(':id/substitutes')
  @Roles(...CATALOG_WRITERS)
  async setSubstitutes(@Param('id') id: string, @Body('slugs') slugs: string[]) {
    const data = await this.service.setSubstitutes(id, Array.isArray(slugs) ? slugs : []);
    return { data };
  }

  @Post()
  @Roles(...CATALOG_WRITERS)
  create(@Body() dto: CreateProductDto) {
    return this.service.createProduct(dto);
  }

  @Patch(':id')
  @Roles(...CATALOG_WRITERS)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto, @CurrentUser() user: JwtUser) {
    return this.service.updateProduct(id, dto, user?.email);
  }

  @Delete(':id')
  @Roles(...CATALOG_WRITERS)
  remove(@Param('id') id: string) {
    return this.service.removeProduct(id);
  }
}

@ApiTags('katalog')
@Controller('catalog/baskets')
export class BasketsController {
  constructor(private readonly service: CatalogService) {}

  @Get()
  async list() {
    const data = await this.service.listBaskets();
    return { data, meta: { total: data.length } };
  }

  @Post()
  @Roles(...CATALOG_WRITERS)
  create(@Body() dto: CreateBasketDto) {
    return this.service.createBasket(dto);
  }

  @Delete(':id')
  @Roles(...CATALOG_WRITERS)
  remove(@Param('id') id: string) {
    return this.service.removeBasket(id);
  }
}
