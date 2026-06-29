import { IsInt, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

/** Bir rakibin bir ürüne dair fiyatı (append-only). */
export class CreateCompetitorPriceDto {
  /** Ürün slug'ı (katalog henüz yok). */
  @IsString()
  productId!: string;

  @IsUUID()
  competitorId!: string;

  /** Fiyat (kuruş). */
  @IsInt() @Min(0)
  price!: number;

  /** YYYY-MM-DD; verilmezse bugün (UTC). */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date?: string;

  @IsOptional() @IsString()
  source?: string;

  @IsOptional() @IsString()
  capturedBy?: string;
}
