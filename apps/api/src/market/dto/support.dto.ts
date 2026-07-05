import { IsEmail, IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SupportRequestDto {
  @IsString() @IsNotEmpty() @MaxLength(80)
  name!: string;

  @IsOptional() @IsEmail()
  email?: string;

  @IsOptional() @IsString() @MaxLength(20)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(16)
  orderCode?: string;

  @IsString() @IsNotEmpty() @MaxLength(2000)
  message!: string;
}
