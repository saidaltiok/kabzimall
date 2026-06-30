import { IsInt, Min } from 'class-validator';

export class UpdateStoreSettingsDto {
  /** Asgari sipariş ara toplamı (kuruş). 0 = sınır yok. */
  @IsInt() @Min(0)
  minOrderTotal!: number;
}
