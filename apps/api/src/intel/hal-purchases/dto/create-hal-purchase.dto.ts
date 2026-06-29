import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

/**
 * Bir hal alımının kaydı. Tartı halde ±500 g hassasiyetle görülür;
 * mağazada yeniden tartılınca actualKg girilir (mutabakat — karar #8).
 */
export class CreateHalPurchaseDto {
  @IsOptional() @IsString()
  productId?: string;

  /** Halde tartıda görünen kg. */
  @IsNumber() @Min(0.001)
  recordedKg!: number;

  /** Mağazada gerçekleşen kg (bilinmiyorsa boş). */
  @IsOptional() @IsNumber() @Min(0.001)
  actualKg?: number;

  /** Ödenen toplam (kuruş). */
  @IsInt() @Min(1)
  totalPaid!: number;

  /** Tartı hassasiyeti (kg); varsayılan 0.5 = ±500 g. */
  @IsOptional() @IsNumber() @Min(0)
  precisionKg?: number;
}
