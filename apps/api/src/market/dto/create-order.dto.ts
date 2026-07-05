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
  Min,
  MinLength,
  ValidateNested,
} from 'class-validator';

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
  @IsString() @MinLength(2)
  name!: string;

  @IsString() @MinLength(7)
  phone!: string;

  @IsString() @MinLength(5)
  address!: string;

  /** Teslimat ilçesi (hizmet bölgesi varsa zorunlu/doğrulanır). */
  @IsOptional() @IsString()
  district?: string;

  /** Sipariş bildirimleri için opsiyonel e-posta (onay, durum, saat değişikliği). */
  @IsOptional() @IsEmail()
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

  /** Faz 1: yalnızca kapıda ödeme. */
  @IsOptional() @IsIn(['COD'])
  paymentMethod?: 'COD';
}
