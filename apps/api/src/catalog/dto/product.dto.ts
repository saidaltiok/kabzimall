import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, MaxLength, Min } from 'class-validator';

export const SALE_TYPES = ['WEIGHT', 'PIECE', 'BUNCH', 'PACK', 'VARIABLE_WEIGHT_PACK'] as const;
export type SaleType = (typeof SALE_TYPES)[number];

const SLUG = /^[a-z0-9-]+$/;

export class CreateProductDto {
  @IsString() @Matches(SLUG, { message: 'slug yalnızca küçük harf, rakam ve tire içerebilir' })
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsUUID()
  categoryId?: string;

  @IsIn(SALE_TYPES)
  saleType!: SaleType;

  @IsOptional() @IsString()
  unitLabel?: string;

  /** Ürün görseli (URL). */
  @IsOptional() @IsString()
  imageUrl?: string;

  /** Ürün açıklaması (vitrin detay sayfası). */
  @IsOptional() @IsString() @MaxLength(2000)
  description?: string;

  /** Mağaza fiyatı (kuruş). */
  @IsOptional() @IsInt() @Min(0)
  basePrice?: number;

  /** İndirimli fiyat (kuruş). Taban fiyatın altındaysa vitrinde geçerli olur. */
  @IsOptional() @IsInt() @Min(0)
  discountedPrice?: number;

  /** Stok (kg/adet). null/boş = takip yok (sınırsız). */
  @IsOptional() @IsNumber() @Min(0)
  stockQty?: number;

  /** Sipariş başına azami miktar (kg/adet). null/boş = sınır yok. */
  @IsOptional() @IsNumber() @Min(0)
  maxPerOrder?: number;

  @IsOptional() @IsString()
  originRegion?: string;

  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isFreshDaily?: boolean;
  @IsOptional() @IsBoolean() isLocal?: boolean;
}

/** Güncelleme: tüm alanlar opsiyonel (slug değişmez). */
export class UpdateProductDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsIn(SALE_TYPES) saleType?: SaleType;
  @IsOptional() @IsString() unitLabel?: string;
  @IsOptional() @IsString() imageUrl?: string;
  @IsOptional() @IsString() @MaxLength(2000) description?: string;
  @IsOptional() @IsInt() @Min(0) basePrice?: number;
  @IsOptional() @IsInt() @Min(0) discountedPrice?: number;
  @IsOptional() @IsNumber() @Min(0) stockQty?: number;
  @IsOptional() @IsNumber() @Min(0) maxPerOrder?: number;
  @IsOptional() @IsString() originRegion?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isFreshDaily?: boolean;
  @IsOptional() @IsBoolean() isLocal?: boolean;
}

/** Excel (CSV) içe alma gövdesi. */
export class ImportCsvDto {
  @IsString()
  @MaxLength(2_000_000) // ~2MB metin — binlerce ürün satırına yeter
  csv!: string;

  /** false/boş: yalnız önizleme; true: hatasız satırları uygula. */
  @IsOptional() @IsBoolean()
  apply?: boolean;
}

export class CreateCategoryDto {
  @IsString() @Matches(SLUG, { message: 'slug yalnızca küçük harf, rakam ve tire içerebilir' })
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}
