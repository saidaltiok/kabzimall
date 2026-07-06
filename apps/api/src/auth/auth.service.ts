import { BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, Logger, NotFoundException, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { JWT_SECRET, ROLES, type JwtUser, type Role } from './auth.constants';

/** Login kaba-kuvvet koruması: IP başına kayan pencere. */
const LOGIN_WINDOW_MS = 5 * 60_000;
const LOGIN_MAX_FAILS = 10;

@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger('Auth');
  /** IP → başarısız deneme zaman damgaları (bellek içi; basit koruma). */
  private loginFails = new Map<string, number[]>();

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

  async login(email: string, password: string, ip = 'unknown'): Promise<{ accessToken: string; user: Omit<JwtUser, 'sub'> & { name: string | null } }> {
    // Kaba-kuvvet: IP başına 5 dk'da 10 başarısız denemeden sonra 429.
    const now = Date.now();
    const fails = (this.loginFails.get(ip) ?? []).filter((t) => now - t < LOGIN_WINDOW_MS);
    if (fails.length >= LOGIN_MAX_FAILS) {
      throw new HttpException('Çok fazla başarısız giriş denemesi. Birkaç dakika sonra tekrar deneyin.', HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { email: email.toLowerCase().trim() } });
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      fails.push(now);
      this.loginFails.set(ip, fails);
      throw new UnauthorizedException('E-posta veya parola hatalı');
    }
    this.loginFails.delete(ip); // başarılı giriş → sayacı temizle
    const payload: JwtUser = {
      sub: user.id,
      email: user.email,
      role: user.role as Role,
      tenantId: user.tenantId,
    };
    const accessToken = this.jwt.sign(payload, { secret: JWT_SECRET, expiresIn: '12h' });
    return { accessToken, user: { email: user.email, role: user.role as Role, tenantId: user.tenantId, name: user.name } };
  }

  /* --------------------- Kullanıcı yönetimi (ADMIN) --------------------- */

  listUsers() {
    return this.prisma.user.findMany({
      where: { tenantId: DEV_TENANT_ID },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
  }

  async createUser(dto: { email: string; password: string; name?: string; role: string }) {
    const email = dto.email?.trim().toLowerCase();
    if (!email || !email.includes('@')) throw new BadRequestException('Geçerli bir e-posta girin.');
    if (!dto.password || dto.password.length < 8) throw new BadRequestException('Parola en az 8 karakter olmalı.');
    if (!ROLES.includes(dto.role as Role)) throw new BadRequestException(`Geçersiz rol. Roller: ${ROLES.join(', ')}`);
    try {
      const u = await this.prisma.user.create({
        data: {
          tenantId: DEV_TENANT_ID,
          email,
          passwordHash: await bcrypt.hash(dto.password, 10),
          name: dto.name?.trim() || null,
          role: dto.role,
        },
        select: { id: true, email: true, name: true, role: true, createdAt: true },
      });
      return u;
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Bu e-postayla kullanıcı zaten var.');
      }
      throw e;
    }
  }

  /** Rol değiştir / parola sıfırla. Son ADMIN'in rolü düşürülemez. */
  async updateUser(id: string, dto: { role?: string; password?: string; name?: string }, actor: JwtUser) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId: DEV_TENANT_ID } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (dto.role !== undefined) {
      if (!ROLES.includes(dto.role as Role)) throw new BadRequestException(`Geçersiz rol. Roller: ${ROLES.join(', ')}`);
      if (user.role === 'ADMIN' && dto.role !== 'ADMIN') {
        const adminCount = await this.prisma.user.count({ where: { tenantId: DEV_TENANT_ID, role: 'ADMIN' } });
        if (adminCount <= 1) throw new BadRequestException('Son yöneticinin rolü düşürülemez.');
        if (user.id === actor.sub) throw new BadRequestException('Kendi yönetici rolünüzü buradan düşüremezsiniz — başka bir yönetici yapsın.');
      }
    }
    if (dto.password !== undefined && dto.password.length < 8) throw new BadRequestException('Parola en az 8 karakter olmalı.');
    return this.prisma.user.update({
      where: { id },
      data: {
        ...(dto.role !== undefined ? { role: dto.role } : {}),
        ...(dto.password !== undefined ? { passwordHash: await bcrypt.hash(dto.password, 10) } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() || null } : {}),
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  /** Kullanıcı sil — kendini ve son ADMIN'i silmek yasak. */
  async removeUser(id: string, actor: JwtUser) {
    const user = await this.prisma.user.findFirst({ where: { id, tenantId: DEV_TENANT_ID } });
    if (!user) throw new NotFoundException('Kullanıcı bulunamadı.');
    if (user.id === actor.sub) throw new BadRequestException('Kendi hesabınızı silemezsiniz.');
    if (user.role === 'ADMIN') {
      const adminCount = await this.prisma.user.count({ where: { tenantId: DEV_TENANT_ID, role: 'ADMIN' } });
      if (adminCount <= 1) throw new BadRequestException('Son yönetici silinemez.');
    }
    await this.prisma.user.delete({ where: { id } });
    return { deleted: true };
  }
}
