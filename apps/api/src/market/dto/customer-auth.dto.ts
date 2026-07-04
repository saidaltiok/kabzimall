import { IsEmail, IsString, Length } from 'class-validator';

/** OTP kodu iste (e-postaya gönderilir; log modunda devCode döner). */
export class RequestOtpDto {
  @IsEmail()
  email!: string;
}

/** Kodu doğrula → 30 günlük müşteri oturumu (kind: customer). */
export class VerifyOtpDto {
  @IsEmail()
  email!: string;

  @IsString() @Length(6, 6)
  code!: string;
}
