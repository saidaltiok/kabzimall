import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class RefundItemDto {
  @IsUUID()
  itemId!: string;

  /** İade miktarı — boşsa kalemin tamamı; kg üründe ondalık olabilir. */
  @IsOptional()
  @IsNumber()
  @IsPositive()
  @Max(1000)
  qty?: number;
}

export class RefundOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => RefundItemDto)
  items!: RefundItemDto[];

  /** CASH: kasadan nakit çıkışı · COUPON: tek kullanımlık sabit tutar kuponu. */
  @IsIn(['CASH', 'COUPON'])
  method!: 'CASH' | 'COUPON';

  /** Ürünler stoğa geri alınsın mı (çürük/fire ise false). */
  @IsOptional()
  @IsBoolean()
  restock?: boolean;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  reason?: string;
}
