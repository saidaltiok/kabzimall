import { Type } from 'class-transformer';
import { IsInt, IsNumber, IsOptional, IsString, Matches, Max, Min, ValidateNested } from 'class-validator';

/** Senaryoda değiştirilebilen maliyet girdileri (hepsi mutlak değer, opsiyonel). */
export class ScenarioOverridesDto {
  @IsOptional() @IsInt() @Min(0)
  halAvg?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.999)
  fireRate?: number;

  @IsOptional() @IsInt() @Min(0)
  labor?: number;

  @IsOptional() @IsInt() @Min(0)
  packaging?: number;

  @IsOptional() @IsInt() @Min(0)
  fuel?: number;

  @IsOptional() @IsInt() @Min(0)
  coldStorage?: number;

  @IsOptional() @IsInt() @Min(0)
  amortization?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.5)
  commissionRate?: number;
}

/** POST /intel/price/scenario — what-if: girdileri değiştir, marj/fiyatı gör. */
export class ScenarioDto {
  @IsString()
  productId!: string;

  /** Baz alınacak satış fiyatı (kuruş). Verilmezse ürünün güncel base_price'ı. */
  @IsOptional() @IsInt() @Min(0)
  basePrice?: number;

  /** Öneri fiyatı için hedef net marj (0..1); varsayılan 0.30. */
  @IsOptional() @IsNumber() @Min(0) @Max(0.95)
  targetMargin?: number;

  @IsOptional() @ValidateNested() @Type(() => ScenarioOverridesDto)
  overrides?: ScenarioOverridesDto;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date?: string;
}
