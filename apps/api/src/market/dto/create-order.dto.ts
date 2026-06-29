import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsOptional,
  IsString,
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
}

export class CustomerInput {
  @IsString() @MinLength(2)
  name!: string;

  @IsString() @MinLength(7)
  phone!: string;

  @IsString() @MinLength(5)
  address!: string;
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

  @IsOptional() @IsString()
  note?: string;

  /** Faz 1: yalnızca kapıda ödeme. */
  @IsOptional() @IsIn(['COD'])
  paymentMethod?: 'COD';
}
