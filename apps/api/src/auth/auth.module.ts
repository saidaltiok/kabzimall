import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtAuthGuard } from './jwt-auth.guard';
import { RolesGuard } from './roles.guard';
import { JWT_SECRET } from './auth.constants';

/**
 * Auth modülü. Guard'lar global (APP_GUARD): önce JwtAuthGuard (kimlik),
 * sonra RolesGuard (rol). @Public uçlar kimlik istemez.
 */
@Module({
  imports: [JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '12h' } })],
  controllers: [AuthController],
  providers: [
    AuthService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
})
export class AuthModule {}
