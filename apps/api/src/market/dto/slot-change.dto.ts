import { IsBoolean, IsString, Matches } from 'class-validator';

/** Müşterinin teslimat saati değişikliği talebi (yalnız sunulan slotlardan). */
export class SlotChangeRequestDto {
  @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'date YYYY-MM-DD olmalı' })
  date!: string;

  @IsString() @Matches(/^\d{2}:\d{2}-\d{2}:\d{2}$/, { message: 'window HH:MM-HH:MM olmalı' })
  window!: string;
}

/** Admin kararı: onayla (true) ya da reddet (false). */
export class SlotChangeDecisionDto {
  @IsBoolean()
  approve!: boolean;
}
