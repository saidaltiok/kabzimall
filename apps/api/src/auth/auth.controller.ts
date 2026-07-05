import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { ApiBody, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { CurrentUser, Public, Roles } from './decorators';
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

  /* --------------------- Kullanıcı yönetimi (ADMIN) --------------------- */

  /** GET /api/v1/auth/users — personel listesi. */
  @Get('users')
  @Roles('ADMIN')
  async users() {
    const data = await this.auth.listUsers();
    return { data, meta: { total: data.length } };
  }

  /** POST /api/v1/auth/users — { email, password (≥8), name?, role } */
  @Post('users')
  @Roles('ADMIN')
  @ApiBody({ schema: { example: { email: 'paketci@kabzimall.local', password: 'gizli-parola', name: 'Paketleme', role: 'PACKER' } } })
  createUser(@Body() dto: { email: string; password: string; name?: string; role: string }) {
    return this.auth.createUser(dto);
  }

  /** PATCH /api/v1/auth/users/:id — { role?, password?, name? }; son ADMIN korunur. */
  @Patch('users/:id')
  @Roles('ADMIN')
  updateUser(@Param('id') id: string, @Body() dto: { role?: string; password?: string; name?: string }, @CurrentUser() user: JwtUser) {
    return this.auth.updateUser(id, dto, user);
  }

  /** DELETE /api/v1/auth/users/:id — kendini ve son ADMIN'i silmek yasak. */
  @Delete('users/:id')
  @Roles('ADMIN')
  removeUser(@Param('id') id: string, @CurrentUser() user: JwtUser) {
    return this.auth.removeUser(id, user);
  }
}
