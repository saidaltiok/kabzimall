import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsPositive,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export const POS_PAYMENTS = ['CASH', 'CARD', 'SETCARD', 'MULTINET', 'TOKENFLEX', 'EDENRED', 'METROPOL'] as const;

export class PosSaleItemDto {
  @IsString()
  @IsNotEmpty()
  slug!: string;

  /** Miktar — kg ürünlerde ondalıklı olabilir (ör. 0.5). */
  @IsNumber()
  @IsPositive()
  @Max(1000)
  qty!: number;

  /** Satır birim fiyatı (kuruş) — boşsa mağazadaki güncel (indirimli) fiyat kullanılır. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(10_000_00) // birim başına 10.000 ₺ üstü manav gerçeğinde yok; Int32 taşmasını da keser
  unitPrice?: number;
}

export class PosSaleDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => PosSaleItemDto)
  items!: PosSaleItemDto[];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  note?: string;

  /** Ödeme yöntemi (varsayılan NAKİT). Kart/yemek kartı kasadaki nakde eklenmez. */
  @IsOptional()
  @IsIn(POS_PAYMENTS)
  paymentMethod?: (typeof POS_PAYMENTS)[number];
}
