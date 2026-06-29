import { Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Bir ürünün dağıtımlı maliyetlere EK ürün-bazlı girdileri (karar #9).
 * Havuzdan gelen labor/fuel kg başına tahsis edilirken,
 * packaging gibi ürüne özel kalemler buradan gelir.
 */
export class PoolPreviewProductDto {
  @IsOptional() @IsString()
  productId?: string;

  /** Günlük hal alış (kuruş/kg). */
  @IsInt() @Min(0)
  halAvg!: number;

  /** Fire oranı 0..1. */
  @IsNumber() @Min(0)
  fireRate!: number;

  /** Ürün-bazlı ambalaj (kuruş/kg). */
  @IsInt() @Min(0)
  packaging!: number;

  /** Kart komisyonu 0..1. */
  @IsNumber() @Min(0)
  commissionRate!: number;
}

/**
 * POST /intel/cost-pool gövdesi.
 * Havuza giren toplam dağıtımlı maliyetler (kuruş) ve dönemdeki toplam
 * satılabilir hacim (kg). Servis bunları kg başına maliyete böler.
 */
export class CreateCostPoolDto {
  /** Dönem etiketi, ör. "2026-06" veya "2026-W26". */
  @IsString()
  period!: string;

  /** Toplam işçilik (kuruş). */
  @IsInt() @Min(0)
  totalLabor!: number;

  /** Toplam yakıt/benzin (kuruş). */
  @IsInt() @Min(0)
  totalFuel!: number;

  /** Toplam soğuk zincir (kuruş). */
  @IsOptional() @IsInt() @Min(0)
  totalColdStorage?: number;

  /** Toplam amortisman (kuruş). */
  @IsOptional() @IsInt() @Min(0)
  totalAmortization?: number;

  /** Dönemde dağıtıma esas toplam hacim (kg). */
  @IsNumber() @Min(0.001)
  totalVolumeKg!: number;

  /**
   * Opsiyonel: bir örnek ürünle kg başına tahsisi packages/pricing'in
   * directCost'una bağlayıp tam birim maliyet önizlemesi döndür.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => PoolPreviewProductDto)
  previewProduct?: PoolPreviewProductDto;
}
