import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Public, Roles } from '../auth/decorators';
import { CATALOG_WRITERS } from '../auth/auth.constants';
import { MarketService } from './market.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PackOrderDto } from './dto/pack-order.dto';

@ApiTags('market: vitrin (public)')
@Public()
@Controller('storefront')
export class StorefrontController {
  constructor(private readonly service: MarketService) {}

  @Get('categories')
  async categories() {
    const data = await this.service.listCategories();
    return { data };
  }

  /** GET /storefront/products?search=&category= — yayındaki, fiyatlı ürünler. */
  @Get('products')
  @ApiQuery({ name: 'search', required: false })
  @ApiQuery({ name: 'category', required: false })
  async products(@Query('search') search?: string, @Query('category') category?: string) {
    const data = await this.service.listProducts({ search, category });
    return { data, meta: { total: data.length } };
  }

  @Get('products/:slug')
  product(@Param('slug') slug: string) {
    return this.service.getProduct(slug);
  }

  /** GET /storefront/slots — ertesi gün teslimat slotları. */
  @Get('slots')
  slots() {
    return { data: this.service.availableSlots() };
  }

  /** GET /storefront/baskets — yayındaki hazır sepetler (fiyatlı). */
  @Get('baskets')
  async baskets() {
    const data = await this.service.listBaskets();
    return { data };
  }

  /** POST /storefront/orders — misafir sipariş (fiyatlar sunucuda hesaplanır). */
  @Post('orders')
  @ApiBody({
    schema: {
      example: {
        items: [{ slug: 'domates', qty: 2 }, { slug: 'cilek', qty: 0.5 }],
        customer: { name: 'Ayşe Yılmaz', phone: '0555 555 55 55', address: 'Kadıköy, İstanbul' },
        note: 'Zili çalmayın',
      },
    },
  })
  createOrder(@Body() dto: CreateOrderDto) {
    return this.service.createOrder(dto);
  }

  @Get('orders/:id')
  order(@Param('id') id: string) {
    return this.service.getOrder(id);
  }
}

@ApiTags('market: sipariş (admin)')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly service: MarketService) {}

  /** GET /admin/orders?status= */
  @Get()
  @ApiQuery({ name: 'status', required: false })
  async list(@Query('status') status?: string) {
    const data = await this.service.listOrders(status);
    return { data, meta: { total: data.length } };
  }

  /** PATCH /admin/orders/:id/status { status } */
  @Patch(':id/status')
  @Roles(...CATALOG_WRITERS)
  @ApiBody({ schema: { example: { status: 'PREPARING' } } })
  updateStatus(@Param('id') id: string, @Body('status') status: string) {
    return this.service.updateStatus(id, status);
  }

  /** POST /admin/orders/:id/pack — gerçek gramajları işle, tutarı kesinleştir. */
  @Post(':id/pack')
  @Roles(...CATALOG_WRITERS)
  @ApiBody({ schema: { example: { items: [{ itemId: '<kalem-uuid>', pickedQty: 1.85 }] } } })
  pack(@Param('id') id: string, @Body() dto: PackOrderDto) {
    return this.service.packOrder(id, dto.items);
  }
}
