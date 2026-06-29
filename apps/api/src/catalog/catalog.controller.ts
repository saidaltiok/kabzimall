import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../auth/decorators';
import { CATALOG_WRITERS } from '../auth/auth.constants';
import { CatalogService } from './catalog.service';
import { CreateCategoryDto, CreateProductDto, UpdateProductDto } from './dto/product.dto';

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

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }

  @Post()
  @Roles(...CATALOG_WRITERS)
  create(@Body() dto: CreateProductDto) {
    return this.service.createProduct(dto);
  }

  @Patch(':id')
  @Roles(...CATALOG_WRITERS)
  update(@Param('id') id: string, @Body() dto: UpdateProductDto) {
    return this.service.updateProduct(id, dto);
  }

  @Delete(':id')
  @Roles(...CATALOG_WRITERS)
  remove(@Param('id') id: string) {
    return this.service.removeProduct(id);
  }
}
