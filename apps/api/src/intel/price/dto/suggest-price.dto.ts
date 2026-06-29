import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import type { Strategy } from '../../../pricing-engine';
import {
  CostInputDto,
  CompetitorDto,
  SuggestParamsDto,
  STRATEGIES,
} from './resolve-price.dto';

/**
 * POST /intel/price/suggest gövdesi.
 * Tek strateji ile öneri (fallback YOK — onun için /resolve kullanılır).
 * Hesap tamamen packages/pricing.suggestPrice'ta; burada yalnızca doğrulama.
 */
export class SuggestPriceDto {
  @IsOptional() @IsString()
  productId?: string;

  @ValidateNested()
  @Type(() => CostInputDto)
  cost!: CostInputDto;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetitorDto)
  competitors?: CompetitorDto[];

  /** Uygulanacak strateji (rakipsiz stratejide rakip listesi boş olabilir). */
  @IsIn(STRATEGIES)
  strategy!: Strategy;

  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestParamsDto)
  params?: SuggestParamsDto;
}
