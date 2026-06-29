import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import type { Strategy } from '../../../pricing-engine';
import { SuggestParamsDto, STRATEGIES } from './resolve-price.dto';

/**
 * POST /intel/price/suggest-product gövdesi.
 * Maliyet (cost-components + günlük hal ort.) ve rakipler DB'den toplanır;
 * istek sadece productId + strateji içerir.
 */
export class SuggestProductDto {
  @IsString()
  productId!: string;

  @IsIn(STRATEGIES)
  strategy!: Strategy;

  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestParamsDto)
  params?: SuggestParamsDto;

  /** Hal ortalamasını elle ver (yoksa ürünün en güncel günlük ortalaması). */
  @IsOptional() @IsInt() @Min(0)
  halAvg?: number;

  /** Rakip fiyatları için gün (YYYY-MM-DD); verilmezse bugün. */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date?: string;
}
