import { IsBoolean, IsIn, IsString, Matches } from 'class-validator';
import { DELIVERY_WINDOWS } from './create-order.dto';

/** Müşterinin teslimat saati değişikliği talebi (yalnız sunulan slotlardan). */
export class SlotChangeRequestDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date!: string;

  @IsIn(DELIVERY_WINDOWS)
  window!: string;
}

/** Admin kararı: onayla (true) ya da reddet (false). */
export class SlotChangeDecisionDto {
  @IsBoolean()
  approve!: boolean;
}
