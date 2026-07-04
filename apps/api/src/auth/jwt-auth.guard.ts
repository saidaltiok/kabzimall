import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { IS_PUBLIC } from './decorators';
import { JWT_SECRET, type JwtUser } from './auth.constants';

/** Bearer JWT doğrular (stateless). @Public uçlar atlanır. */
@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const auth: string | undefined = req.headers?.authorization;
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null;
    if (!token) throw new UnauthorizedException('Token gerekli');

    try {
      const payload = this.jwt.verify<JwtUser & { kind?: string }>(token, { secret: JWT_SECRET });
      // Müşteri OTP token'ı (kind:'customer') PERSONEL uçlarında geçersizdir —
      // aynı gizle imzalansa da panel/intel uçlarına asla kimlik sağlayamaz.
      if (payload.kind === 'customer') {
        throw new UnauthorizedException('Bu oturum personel paneli için geçerli değil');
      }
      req.user = payload;
      return true;
    } catch (e) {
      if (e instanceof UnauthorizedException) throw e;
      throw new UnauthorizedException('Geçersiz veya süresi dolmuş token');
    }
  }
}
