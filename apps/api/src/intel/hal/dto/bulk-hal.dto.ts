import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsOptional, Matches, ValidateNested } from 'class-validator';
import { CreateHalEntryDto } from './create-hal-entry.dto';

/**
 * Saha Modu toplu kayıt: aynı gün için birçok ürünün hal fiyatı.
 * Üst seviye `date` ortak varsayılan; her entry kendi `date`'ini geçebilir.
 */
export class BulkHalDto {
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateHalEntryDto)
  entries!: CreateHalEntryDto[];
}
