import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsEmail,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

/**
 * TR cep telefonu: boşluk/tire/parantez toleranslı; +90/0 önekli ya da öneksiz,
 * 5 ile başlayan 10 hane. "0555 123 45 67", "+90 555 123 45 67", "5551234567" geçer.
 */
export const TR_PHONE = /^(\+?90[\s-]?|0)?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/;
/** İsim: en az bir harf içermeli (harf/boşluk/kesme/tire/nokta), rakam/sembol yığını olamaz. */
export const PERSON_NAME = /^(?=.*\p{L})[\p{L}\s'.-]{2,}$/u;

export class OrderItemInput {
  @IsString()
  slug!: string;

  /** Miktar — adet ya da kg (tartılı üründe ondalık). */
  @IsNumber() @Min(0.001)
  qty!: number;

  /** Müşteri ürün notu (ör. "çok olgun olmasın"). */
  @IsOptional() @IsString()
  note?: string;
}

export const DELIVERY_WINDOWS = ['10:00-13:00', '13:00-16:00', '16:00-19:00'] as const;

export class SlotInput {
  /** Teslimat günü YYYY-MM-DD (sunucunun sunduğu slotlardan biri). */
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date!: string;

  /** Pencere formatı HH:MM-HH:MM — geçerli pencereler ayarlardan sunulur, sunucu doğrular. */
  @IsString() @Matches(/^\d{2}:\d{2}-\d{2}:\d{2}$/, { message: 'window HH:MM-HH:MM olmalı' })
  window!: string;
}

export class CustomerInput {
  @IsString() @MinLength(2) @MaxLength(80)
  @Matches(PERSON_NAME, { message: 'Geçerli bir ad soyad girin.' })
  name!: string;

  @IsString() @MaxLength(24)
  @Matches(TR_PHONE, { message: 'Geçerli bir cep telefonu girin (05XX XXX XX XX).' })
  phone!: string;

  @IsString() @MinLength(5) @MaxLength(300)
  address!: string;

  /** Teslimat ilçesi (hizmet bölgesi varsa zorunlu/doğrulanır). */
  @IsOptional() @IsString() @MaxLength(60)
  district?: string;

  /** Sipariş bildirimleri için opsiyonel e-posta (onay, durum, saat değişikliği). */
  @IsOptional() @IsEmail({}, { message: 'Geçerli bir e-posta girin.' })
  email?: string;

  /** Haritadan seçilen teslimat noktası (WGS84). */
  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  lat?: number;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  lng?: number;
}

export class CreateOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OrderItemInput)
  items!: OrderItemInput[];

  @ValidateNested()
  @Type(() => CustomerInput)
  customer!: CustomerInput;

  /** Ertesi gün teslimat slotu (opsiyonel; vitrin seçtirir). */
  @IsOptional()
  @ValidateNested()
  @Type(() => SlotInput)
  slot?: SlotInput;

  @IsOptional() @IsString()
  note?: string;

  /** Ürün eksik/tükenmiş çıkarsa ne yapılsın? Varsayılan CALL (beni ara). */
  @IsOptional() @IsIn(['CALL', 'REMOVE', 'SUBSTITUTE'])
  substitutionPref?: 'CALL' | 'REMOVE' | 'SUBSTITUTE';

  /** Kupon kodu (opsiyonel) — doğrulama ve indirim SUNUCUDA hesaplanır. */
  @IsOptional() @IsString()
  couponCode?: string;

  /**
   * Kapıda ödeme yöntemi (online ödeme henüz yok — hepsi teslimatta tahsil edilir).
   * COD = kapıda nakit (geriye dönük uyum), CARD = kapıda kredi/banka kartı,
   * yemek kartları kuryenin POS cihazından. Komisyon raporlaması buna göre.
   */
  @IsOptional() @IsIn(['COD', 'CASH', 'CARD', 'SETCARD', 'MULTINET', 'TOKENFLEX', 'EDENRED', 'METROPOL'])
  paymentMethod?: 'COD' | 'CASH' | 'CARD' | 'SETCARD' | 'MULTINET' | 'TOKENFLEX' | 'EDENRED' | 'METROPOL';
}
