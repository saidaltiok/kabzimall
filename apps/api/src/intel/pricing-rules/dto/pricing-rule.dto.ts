import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import { STRATEGIES } from '../../price/dto/resolve-price.dto';

export const RULE_SCOPES = ['GLOBAL', 'CATEGORY', 'PRODUCT'] as const;

export class UpsertPricingRuleDto {
  @IsIn(RULE_SCOPES)
  scope!: (typeof RULE_SCOPES)[number];

  /** GLOBAL için boş; CATEGORY/PRODUCT için kategori/ürün slug'ı. */
  @IsOptional() @IsString()
  refId?: string;

  @IsOptional() @IsIn(STRATEGIES)
  strategy?: string;

  /** Hedef net marj (0..1). */
  @IsOptional() @IsNumber() @Min(0) @Max(0.95)
  targetMargin?: number;

  /** Taban net marj (0..1). Motor bunun altına inmez. */
  @IsOptional() @IsNumber() @Min(0) @Max(0.95)
  floorMargin?: number;

  @IsOptional() @IsBoolean()
  psychological?: boolean;
}
