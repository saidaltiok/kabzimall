import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsUUID, Min, ValidateNested } from 'class-validator';

export class PackItemInput {
  @IsUUID()
  itemId!: string;

  /** Tartılan gerçek miktar (kg/adet). */
  @IsNumber() @Min(0)
  pickedQty!: number;
}

/** POST /admin/orders/:id/pack — gerçek gramajları gir, tutar kesinleşir. */
export class PackOrderDto {
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => PackItemInput)
  items!: PackItemInput[];
}
