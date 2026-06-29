import { IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

/**
 * Tek bir günlük hal fiyatı girişi (append-only — Teknik doküman Bölüm 3.3).
 * Client `productId`'yi ürün slug'ı olarak gönderir (katalog henüz yok).
 */
export class CreateHalEntryDto {
  @IsString()
  productId!: string;

  /** Fiyat (kuruş/birim). */
  @IsInt() @Min(0)
  price!: number;

  @IsOptional() @IsString()
  unit?: string;

  /** YYYY-MM-DD; verilmezse bugün (UTC). */
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date?: string;

  /** v1.1 sonrası genelde boş (hal günde 1). */
  @IsOptional() @IsString()
  timeSlot?: string;

  /** MANUAL | AUTO | kaynak adı. */
  @IsOptional() @IsString()
  source?: string;

  @IsOptional() @IsString()
  capturedBy?: string;
}
