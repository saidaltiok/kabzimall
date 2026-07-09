import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import type { Strategy } from '../../../pricing-engine';

const STRATEGIES: Strategy[] = [
  'MARGIN', 'HAL_MARKUP', 'COMP_AVG', 'COMP_AVG_MINUS',
  'MEDIAN', 'LOWEST', 'GROUP_AVG', 'FLOOR', 'MANUAL',
];

/** packages/pricing → CostInput (tüm para alanları kuruş). */
export class CostInputDto {
  @IsInt() @Min(0)
  halAvg!: number;

  @IsNumber() @Min(0) @Max(0.999)
  fireRate!: number;

  @IsInt() @Min(0)
  labor!: number;

  @IsInt() @Min(0)
  packaging!: number;

  @IsInt() @Min(0)
  fuel!: number;

  @IsOptional() @IsInt() @Min(0)
  coldStorage?: number;

  @IsOptional() @IsInt() @Min(0)
  amortization?: number;

  @IsNumber() @Min(0) @Max(0.99)
  commissionRate!: number;
}

/** packages/pricing → Competitor. */
export class CompetitorDto {
  @IsString()
  name!: string;

  @IsString()
  group!: string;

  @IsInt() @Min(0)
  price!: number;
}

/** packages/pricing → SuggestParams. */
export class SuggestParamsDto {
  @IsOptional() @IsNumber() @Min(0) @Max(0.99)
  targetMargin?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.99)
  floorMargin?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.99)
  minusPct?: number;

  @IsOptional() @IsString()
  group?: string;

  @IsOptional() @IsInt() @Min(0)
  manualPrice?: number;

  @IsOptional() @IsNumber() @Min(0)
  halMarkupPct?: number;

  /** Rakip tabanlı stratejide ± yüzde ayarlama: −0.5..+0.5 (ör. −0.05 = ort. −%5, +0.09 = medyan +%9). */
  @IsOptional() @IsNumber() @Min(-0.5) @Max(0.5)
  offsetPct?: number;

  @IsOptional() @IsBoolean()
  psychological?: boolean;

  @IsOptional() @IsBoolean()
  opportunity?: boolean;
}

/** Fallback zincirinin bir adımı. */
export class ChainStepDto {
  @IsString()
  strategy!: Strategy;

  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestParamsDto)
  params?: SuggestParamsDto;
}

/**
 * POST /intel/price/resolve gövdesi.
 * `chain` verilmezse motorun DEFAULT_CHAIN'i kullanılır
 * (COMP_AVG → MARGIN → HAL_MARKUP → FLOOR).
 */
export class ResolvePriceDto {
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

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChainStepDto)
  chain?: ChainStepDto[];

  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestParamsDto)
  baseParams?: SuggestParamsDto;
}

export { STRATEGIES };
