import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentUser, Public } from './decorators';
import type { JwtUser } from './auth.constants';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** POST /api/v1/auth/login — { email, password } → { accessToken, user } */
  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiBody({ schema: { example: { email: 'admin@kabzimall.local', password: 'kabzimall123' } } })
  login(@Body() dto: LoginDto) {
    return this.auth.login(dto.email, dto.password);
  }

  /** GET /api/v1/auth/me — token'daki kullanıcı. */
  @Get('me')
  me(@CurrentUser() user: JwtUser) {
    return { email: user.email, role: user.role, tenantId: user.tenantId };
  }
}
