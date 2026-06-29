import { Type } from 'class-transformer';
import { IsArray, IsInt, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';
import { ChainStepDto, SuggestParamsDto } from './resolve-price.dto';

/**
 * POST /intel/price/resolve-product gövdesi.
 * /suggest-product gibi maliyet + rakipleri DB'den toplar, ama hiyerarşik
 * fallback zinciri uygular (rakip yoksa MARGIN → HAL_MARKUP → FLOOR).
 */
export class ResolveProductDto {
  @IsString()
  productId!: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChainStepDto)
  chain?: ChainStepDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestParamsDto)
  baseParams?: SuggestParamsDto;

  @IsOptional() @IsInt() @Min(0)
  halAvg?: number;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date?: string;
}
