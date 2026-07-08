import { IsBoolean, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PERSON_NAME, TR_PHONE } from './create-order.dto';

/**
 * Kayıtlı teslimat adresi. Harita konumu (lat/lng) ZORUNLU — bu ekranın amacı
 * kuryenin adresi kesin bulmasını sağlamak; koordinatsız adres kaydedilmez.
 */
export class CreateAddressDto {
  /** Kısa etiket: "Ev", "İş"… */
  @IsString() @MinLength(1) @MaxLength(40)
  label!: string;

  @IsString() @MinLength(2) @MaxLength(80)
  @Matches(PERSON_NAME, { message: 'Geçerli bir ad soyad girin.' })
  name!: string;

  @IsString() @MaxLength(24)
  @Matches(TR_PHONE, { message: 'Geçerli bir cep telefonu girin (05XX XXX XX XX).' })
  phone!: string;

  @IsString() @MinLength(5) @MaxLength(300)
  addressText!: string;

  @IsOptional() @IsString() @MaxLength(60)
  district?: string;

  @IsNumber() @Min(-90) @Max(90)
  lat!: number;

  @IsNumber() @Min(-180) @Max(180)
  lng!: number;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;
}

/** Güncelleme: tüm alanlar opsiyonel (verilenler değişir). */
export class UpdateAddressDto {
  @IsOptional() @IsString() @MinLength(1) @MaxLength(40)
  label?: string;

  @IsOptional() @IsString() @MinLength(2) @MaxLength(80) @Matches(PERSON_NAME, { message: 'Geçerli bir ad soyad girin.' })
  name?: string;

  @IsOptional() @IsString() @MaxLength(24) @Matches(TR_PHONE, { message: 'Geçerli bir cep telefonu girin (05XX XXX XX XX).' })
  phone?: string;

  @IsOptional() @IsString() @MinLength(5) @MaxLength(300)
  addressText?: string;

  @IsOptional() @IsString() @MaxLength(60)
  district?: string;

  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  lat?: number;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  lng?: number;

  @IsOptional() @IsBoolean()
  isDefault?: boolean;
}
