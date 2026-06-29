import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

export class BasketComponentInput {
  @IsString()
  productSlug!: string;

  @IsNumber() @Min(0.001)
  qty!: number;
}

/**
 * Hazır sepet = AYRI BİR ÜRÜN (kind=BASKET). Kendi fiyatı/indirimi/stoğu var
 * (diğer ürünler gibi); ek olarak içeriği (component ürünler) tanımlanır.
 */
export class CreateBasketDto {
  @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'slug yalnızca küçük harf, rakam ve tire' })
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsString()
  imageUrl?: string;

  /** Sepetin kendi mağaza fiyatı (kuruş). */
  @IsInt() @Min(0)
  basePrice!: number;

  /** İndirimli fiyat (kuruş) — ürünlerdeki gibi. */
  @IsOptional() @IsInt() @Min(0)
  discountedPrice?: number;

  @IsOptional() @IsNumber() @Min(0)
  stockQty?: number;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BasketComponentInput)
  components!: BasketComponentInput[];
}
