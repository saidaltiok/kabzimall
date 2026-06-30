import { IsInt, IsOptional, Min } from 'class-validator';

export class UpdateStoreSettingsDto {
  /** Asgari sipariş ara toplamı (kuruş). 0 = sınır yok. */
  @IsOptional() @IsInt() @Min(0)
  minOrderTotal?: number;

  /** Temel teslimat ücreti (kuruş). */
  @IsOptional() @IsInt() @Min(0)
  deliveryFee?: number;

  /** Ücretsiz teslimat eşiği (kuruş). 0 = hiç ücretsiz değil. */
  @IsOptional() @IsInt() @Min(0)
  freeDeliveryThreshold?: number;
}
