import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  ValidateNested,
} from 'class-validator';
import type { Strategy } from '../../../pricing-engine';
import { SuggestParamsDto, STRATEGIES } from './resolve-price.dto';

/**
 * POST /intel/price/bulk-apply gövdesi.
 * Verilen ürünlere stratejiyi uygular; varsayılan ÖNİZLEME (commit=false).
 * commit=true ise base_price + price_history yazılır. Girdiler DB'den toplanır;
 * maliyet/hal eksik ürünler hata vermez, "skipped" olarak işaretlenir.
 */
export class BulkApplyDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  productIds!: string[];

  @IsIn(STRATEGIES)
  strategy!: Strategy;

  @IsOptional()
  @ValidateNested()
  @Type(() => SuggestParamsDto)
  params?: SuggestParamsDto;

  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date?: string;

  /** true ise gerçekten uygula; aksi halde sadece önizleme. */
  @IsOptional() @IsBoolean()
  commit?: boolean;
}
