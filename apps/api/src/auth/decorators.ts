import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { JwtUser, Role } from './auth.constants';

/** Kimlik gerektirmeyen uç (login, health). */
export const IS_PUBLIC = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC, true);

/** Bu uca erişebilecek roller. */
export const ROLES_KEY = 'roles';
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);

/** Doğrulanmış kullanıcı (JWT payload'ı). */
export const CurrentUser = createParamDecorator((_data: unknown, ctx: ExecutionContext): JwtUser => {
  return ctx.switchToHttp().getRequest().user;
});
