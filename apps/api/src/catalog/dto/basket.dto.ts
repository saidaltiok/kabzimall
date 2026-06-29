import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, Matches, Min, ValidateNested } from 'class-validator';

export class BasketItemInput {
  @IsString()
  productSlug!: string;

  @IsNumber() @Min(0.001)
  qty!: number;
}

export class CreateBasketDto {
  @IsString() @Matches(/^[a-z0-9-]+$/, { message: 'slug yalnızca küçük harf, rakam ve tire' })
  slug!: string;

  @IsString()
  name!: string;

  @IsOptional() @IsString()
  description?: string;

  @IsOptional() @IsString()
  imageUrl?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => BasketItemInput)
  items!: BasketItemInput[];
}
