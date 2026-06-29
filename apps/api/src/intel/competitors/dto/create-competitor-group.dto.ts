import { IsInt, IsOptional, IsString, Min } from 'class-validator';

/** Rakip grubu (Premium/Orta/İndirim/Hızlı/Lokal). */
export class CreateCompetitorGroupDto {
  @IsString()
  name!: string;

  /** Görüntüleme sırası. */
  @IsOptional() @IsInt() @Min(0)
  sortOrder?: number;
}
