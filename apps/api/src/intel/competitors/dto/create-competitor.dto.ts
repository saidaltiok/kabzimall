import { IsBoolean, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateCompetitorDto {
  @IsString()
  name!: string;

  @IsUUID()
  groupId!: string;

  /** Opsiyonel tip etiketi (zincir/market/pazar vb.). */
  @IsOptional() @IsString()
  type?: string;

  @IsOptional() @IsBoolean()
  isActive?: boolean;
}
