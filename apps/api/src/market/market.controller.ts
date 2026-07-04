import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { CurrentUser, Public, Roles } from '../auth/decorators';
import { CATALOG_WRITERS, ORDER_WRITERS, type JwtUser } from '../auth/auth.constants';
import { MarketService } from './market.service';
import { CreateOrderDto } from './dto/create-order.dto';
import { PackOrderDto } from './dto/pack-order.dto';
import { UpdateStoreSettingsDto } from './dto/store-settings.dto';
import { SlotChangeRequestDto, SlotChangeDecisionDto } from './dto/slot-change.dto';

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

  /** GET /storefront/zones — hizmet verilen ilçeler (boşsa kısıt yok). */
  @Get('zones')
  async zones() {
    const data = await this.service.listActiveZones();
    return { data };
  }

  /** GET /storefront/settings — vitrin için mağaza kuralları (asgari sipariş). */
  @Get('settings')
  settings() {
    return this.service.getStoreSettings();
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

  /** GET /storefront/orders/lookup?code=&phone= — misafir sipariş sorgulama. */
  @Get('orders/lookup')
  @ApiQuery({ name: 'code', required: true })
  @ApiQuery({ name: 'phone', required: true })
  lookup(@Query('code') code: string, @Query('phone') phone: string) {
    return this.service.lookupOrder(code, phone);
  }

  @Get('orders/:id')
  order(@Param('id') id: string) {
    return this.service.getOrder(id);
  }

  /** POST /storefront/orders/:id/cancel — müşteri kendi siparişini iptal eder (erken aşama). */
  @Post('orders/:id/cancel')
  cancel(@Param('id') id: string) {
    return this.service.cancelByCustomer(id);
  }

  /**
   * POST /storefront/orders/:id/slot-change — teslimat saati değişikliği TALEBİ
   * (yalnız sipariş hazırlanmaya başlamadıysa; admin onayıyla kesinleşir).
   */
  @Post('orders/:id/slot-change')
  @ApiBody({ schema: { example: { date: '2026-07-06', window: '13:00-16:00' } } })
  requestSlotChange(@Param('id') id: string, @Body() dto: SlotChangeRequestDto) {
    return this.service.requestSlotChange(id, dto.date, dto.window);
  }
}

@ApiTags('market: sipariş (admin)')
@Controller('admin/orders')
export class AdminOrdersController {
  constructor(private readonly service: MarketService) {}

  /** GET /admin/orders/summary — günün operasyon özeti (dashboard). */
  @Get('summary')
  summary() {
    return this.service.opsSummary();
  }

  /** GET /admin/orders/route?date= — günlük dağıtım rota optimizasyonu. */
  @Get('route')
  @ApiQuery({ name: 'date', required: false })
  route(@Query('date') date?: string) {
    return this.service.optimizeRoute(date);
  }

  /** GET /admin/orders?status=&q= (q: kod / müşteri adı / telefon) */
  @Get()
  @ApiQuery({ name: 'status', required: false })
  @ApiQuery({ name: 'q', required: false })
  async list(@Query('status') status?: string, @Query('q') q?: string) {
    const data = await this.service.listOrders(status, q);
    return { data, meta: { total: data.length } };
  }

  /** PATCH /admin/orders/:id/status { status } */
  @Patch(':id/status')
  @Roles(...ORDER_WRITERS)
  @ApiBody({ schema: { example: { status: 'PREPARING' } } })
  updateStatus(@Param('id') id: string, @Body('status') status: string, @CurrentUser() user: JwtUser) {
    return this.service.updateStatus(id, status, user.email);
  }

  /** POST /admin/orders/:id/pack — gerçek gramajları işle, tutarı kesinleştir. */
  @Post(':id/pack')
  @Roles(...ORDER_WRITERS)
  @ApiBody({ schema: { example: { items: [{ itemId: '<kalem-uuid>', pickedQty: 1.85 }] } } })
  pack(@Param('id') id: string, @Body() dto: PackOrderDto, @CurrentUser() user: JwtUser) {
    return this.service.packOrder(id, dto.items, user.email);
  }

  /** POST /admin/orders/:id/slot-change { approve } — bekleyen saat talebini onayla/reddet; müşteri bilgilendirilir. */
  @Post(':id/slot-change')
  @Roles(...ORDER_WRITERS)
  @ApiBody({ schema: { example: { approve: true } } })
  decideSlotChange(@Param('id') id: string, @Body() dto: SlotChangeDecisionDto, @CurrentUser() user: JwtUser) {
    return this.service.decideSlotChange(id, dto.approve, user.email);
  }
}

@ApiTags('market: ayarlar (admin)')
@Controller('admin/settings')
export class AdminSettingsController {
  constructor(private readonly service: MarketService) {}

  @Get()
  get() {
    return this.service.getStoreSettings();
  }

  /** PUT /admin/settings — asgari tutar + teslimat ücreti/eşiği (kuruş; verilen alanlar güncellenir). */
  @Put()
  @Roles(...CATALOG_WRITERS)
  @ApiBody({ schema: { example: { minOrderTotal: 15000, deliveryTiers: [{ minSubtotal: 0, fee: 8000 }, { minSubtotal: 200000, fee: 0 }] } } })
  update(@Body() dto: UpdateStoreSettingsDto) {
    return this.service.updateStoreSettings(dto);
  }
}

@ApiTags('market: sipariş (admin)')
@Controller('admin/delivery-zones')
export class DeliveryZonesController {
  constructor(private readonly service: MarketService) {}

  @Get()
  async list() {
    const data = await this.service.adminListZones();
    return { data, meta: { total: data.length } };
  }

  @Post()
  @Roles(...CATALOG_WRITERS)
  @ApiBody({ schema: { example: { name: 'Kadıköy' } } })
  create(@Body('name') name: string) {
    if (!name || name.trim().length < 2) throw new BadRequestException('İlçe adı gerekli');
    return this.service.createZone(name);
  }

  @Delete(':id')
  @Roles(...CATALOG_WRITERS)
  remove(@Param('id') id: string) {
    return this.service.removeZone(id);
  }
}
