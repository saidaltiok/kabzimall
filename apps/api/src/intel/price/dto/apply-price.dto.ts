import { IsIn, IsInt, IsNumber, IsOptional, IsString, Max, Min } from 'class-validator';
import type { Strategy } from '../../../pricing-engine';
import { STRATEGIES } from './resolve-price.dto';

/**
 * POST /intel/price/apply gövdesi (Teknik doküman Bölüm 5.5 / 6.3).
 * Önerilen/seçilen fiyatı ürünün mağaza fiyatı (base_price) olarak yayınlar
 * ve izlenebilirlik için price_history'e append-only kayıt düşer.
 */
export class ApplyPriceDto {
  @IsString()
  productId!: string;

  /** Uygulanacak yeni mağaza fiyatı (kuruş). */
  @IsInt() @Min(1)
  price!: number;

  /** Bu fiyatı üreten strateji (price_history.strategy_applied). */
  @IsIn(STRATEGIES)
  strategy!: Strategy;

  /** Fiyatın net marjı — izlenebilirlik için (opsiyonel, fırsat ürününde negatif olabilir). */
  @IsOptional() @IsNumber() @Min(-1) @Max(1)
  netMargin?: number;

  /** Değişiklik nedeni (price_history.reason). */
  @IsOptional() @IsString()
  reason?: string;

  /** Değişikliği yapan kullanıcı (henüz auth yok — gelince token'dan gelecek). */
  @IsOptional() @IsString()
  changedBy?: string;
}
