import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsOptional, Min, ValidateNested } from 'class-validator';

export class DeliveryTierDto {
  /** Bu ara toplam ve üstüne uygulanan ücret (kuruş). */
  @IsInt() @Min(0)
  minSubtotal!: number;

  /** Teslimat ücreti (kuruş). 0 = ücretsiz. */
  @IsInt() @Min(0)
  fee!: number;
}

export class UpdateStoreSettingsDto {
  /** Asgari sipariş ara toplamı (kuruş). 0 = sınır yok. */
  @IsOptional() @IsInt() @Min(0)
  minOrderTotal?: number;

  /** Kademeli teslimat tarifesi: [{minSubtotal, fee}] (kuruş). */
  @IsOptional() @IsArray() @ArrayMaxSize(20) @ValidateNested({ each: true }) @Type(() => DeliveryTierDto)
  deliveryTiers?: DeliveryTierDto[];
}
