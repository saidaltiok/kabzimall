import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Matches, Min } from 'class-validator';

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

  /** Mağaza fiyatı (kuruş). */
  @IsOptional() @IsInt() @Min(0)
  basePrice?: number;

  /** Stok (kg/adet). null/boş = takip yok (sınırsız). */
  @IsOptional() @IsNumber() @Min(0)
  stockQty?: number;

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
  @IsOptional() @IsInt() @Min(0) basePrice?: number;
  @IsOptional() @IsNumber() @Min(0) stockQty?: number;
  @IsOptional() @IsString() originRegion?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsBoolean() isFeatured?: boolean;
  @IsOptional() @IsBoolean() isFreshDaily?: boolean;
  @IsOptional() @IsBoolean() isLocal?: boolean;
}

export class CreateCategoryDto {
  @IsString() @Matches(SLUG, { message: 'slug yalnızca küçük harf, rakam ve tire içerebilir' })
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}
