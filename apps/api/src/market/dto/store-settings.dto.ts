import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

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

  /** Teslimat saat pencereleri (HH:MM-HH:MM); boş gönderilirse varsayılan korunur. */
  @IsOptional() @IsArray() @ArrayMaxSize(8)
  @Matches(/^\d{2}:\d{2}-\d{2}:\d{2}$/, { each: true, message: 'pencere HH:MM-HH:MM olmalı' })
  deliveryWindows?: string[];

  /** Teslimat penceresi başına azami sipariş (null = sınırsız). Dolan pencere satışa kapanır. */
  @IsOptional() @ValidateIf((o: UpdateStoreSettingsDto) => o.slotCapacity !== null) @IsInt() @Min(1) @Max(500)
  slotCapacity?: number | null;

  /** Siparişte haritadan konum seçimi zorunlu mu. */
  @IsOptional() @IsBoolean()
  requireGeo?: boolean;

  /** Dükkân/depo başlangıç noktası (rota optimizasyonu). */
  @IsOptional() @IsNumber() @Min(-90) @Max(90)
  depotLat?: number;

  @IsOptional() @IsNumber() @Min(-180) @Max(180)
  depotLng?: number;

  /** İletişim bilgileri (web İletişim sayfası + alt bilgi). */
  @IsOptional() @IsString() @MaxLength(40)
  contactPhone?: string;

  @IsOptional() @IsString() @MaxLength(40)
  contactWhatsapp?: string;

  @IsOptional() @IsString() @MaxLength(120)
  contactEmail?: string;

  @IsOptional() @IsString() @MaxLength(300)
  contactAddress?: string;

  @IsOptional() @IsString() @MaxLength(80)
  contactInstagram?: string;
}
