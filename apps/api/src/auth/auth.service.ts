import { Injectable, Logger, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { JWT_SECRET, type JwtUser, type Role } from './auth.constants';

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('Auth');

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
  ) {}

  /** İlk açılışta hiç kullanıcı yoksa varsayılan admin'i oluşturur (dev kolaylığı). */
  async onModuleInit(): Promise<void> {
    const count = await this.prisma.user.count();
    if (count > 0) return;
    const email = process.env.AUTH_SEED_EMAIL ?? 'admin@kabzimall.local';
    const password = process.env.AUTH_SEED_PASSWORD ?? 'kabzimall123';
    await this.prisma.user.create({
      data: {
        tenantId: DEV_TENANT_ID,
        email,
        passwordHash: await bcrypt.hash(password, 10),
        name: 'Yönetici',
        role: 'ADMIN',
      },
    });
    this.logger.warn(`Varsayılan admin oluşturuldu → ${email} / ${password} (üretimde değiştirin)`);
  }

  async login(email: string, password: string): Promise<{ accessToken: string; user: Omit<JwtUser, 'sub'> & { name: string | null } }> {
    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('E-posta veya parola hatalı');
    }
    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      role: user.role as Role,
      tenantId: user.tenantId,
    };
    const accessToken = this.jwt.sign(payload, { secret: JWT_SECRET, expiresIn: '12h' });
    return { accessToken, user: { email: user.email, role: user.role as Role, tenantId: user.tenantId, name: user.name } };
  }
}
