import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';

export const COST_SCOPES = ['GLOBAL', 'CATEGORY', 'PRODUCT'] as const;
export type CostScope = (typeof COST_SCOPES)[number];

/**
 * Maliyet bileşeni upsert (PUT /intel/cost-components).
 * GLOBAL'de refId boş bırakılır; PRODUCT'ta ürün slug'ı, CATEGORY'de kategori.
 * Para alanları kuruş; oranlar 0..1.
 */
export class UpsertCostComponentDto {
  @IsIn(COST_SCOPES)
  scope!: CostScope;

  /** GLOBAL için boş; PRODUCT→slug, CATEGORY→kategori. */
  @IsOptional() @IsString()
  refId?: string;

  @IsOptional() @IsNumber() @Min(0) @Max(0.999)
  fireRate?: number;

  @IsOptional() @IsInt() @Min(0)
  packaging?: number;

  @IsOptional() @IsInt() @Min(0)
  labor?: number;

  @IsOptional() @IsInt() @Min(0)
  fuel?: number;

  @IsOptional() @IsInt() @Min(0)
  coldStorage?: number;

  @IsOptional() @IsInt() @Min(0)
  amortization?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.99)
  commissionRate?: number;

  @IsOptional() @IsNumber() @Min(0) @Max(0.99)
  taxRate?: number;
}
