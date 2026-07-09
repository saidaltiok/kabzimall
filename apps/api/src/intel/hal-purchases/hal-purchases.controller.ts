import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBody, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Roles } from '../../auth/decorators';
import { PRICE_WRITERS } from '../../auth/auth.constants';
import { HalPurchasesService } from './hal-purchases.service';
import { CreateHalPurchaseDto } from './dto/create-hal-purchase.dto';
import { InvoiceOcrService } from './invoice-ocr.service';

@ApiTags('intel: hal alımı (mutabakat)')
@Controller('intel/hal-purchases')
export class HalPurchasesController {
  constructor(
    private readonly service: HalPurchasesService,
    private readonly ocr: InvoiceOcrService,
  ) {}

  /** GET /api/v1/intel/hal-purchases/ocr-status — OCR (fatura okuma) açık mı. */
  @Get('ocr-status')
  ocrStatus() {
    return { enabled: this.ocr.enabled };
  }

  /**
   * POST /api/v1/intel/hal-purchases/ocr — fatura fotoğrafını oku (kaydetmez).
   * Kalemleri gözden geçirip toplu POST ile onaylarsınız.
   */
  @Post('ocr')
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { image: 'data:image/jpeg;base64,...', mediaType: 'image/jpeg' } } })
  parseInvoice(@Body() dto: { image: string; mediaType?: string }) {
    return this.ocr.parse(dto.image ?? '', dto.mediaType ?? 'image/jpeg');
  }

  /**
   * POST /api/v1/intel/hal-purchases
   * Hal alımını kaydeder; ±500 g tartı mutabakatını (efektif kg maliyeti)
   * ve tartı hassasiyeti riskini packages/pricing ile hesaplar.
   */
  @Post()
  @Roles(...PRICE_WRITERS)
  @ApiBody({ schema: { example: { productId: 'domates', recordedKg: 50, actualKg: 49.6, totalPaid: 100000 } } })
  create(@Body() dto: CreateHalPurchaseDto) {
    return this.service.create(dto);
  }

  /** GET /api/v1/intel/hal-purchases?productId= */
  @Get()
  @ApiQuery({ name: 'productId', required: false, example: 'domates' })
  async findAll(@Query('productId') productId?: string) {
    const data = await this.service.findAll(productId);
    return { data, meta: { total: data.length } };
  }

  /** GET /api/v1/intel/hal-purchases/:id */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.service.findOne(id);
  }
}
