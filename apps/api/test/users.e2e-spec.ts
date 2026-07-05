import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { PrismaService } from '../src/prisma/prisma.service';
import { createTestApp, authed, resetDb } from './test-app';

describe('Kullanıcı yönetimi (roller)', () => {
  let app: INestApplication;
  let admin: ReturnType<typeof authed>;
  let server: ReturnType<INestApplication['getHttpServer']>;
  let prisma: PrismaService;
  let packerId = '';

  beforeAll(async () => {
    app = await createTestApp();
    await resetDb(app);
    prisma = app.get(PrismaService);
    // seed dışı kullanıcıları temizle (varsayılan admin kalsın)
    await prisma.user.deleteMany({ where: { email: { not: 'admin@kabzimall.local' } } });
    admin = authed(app);
    server = app.getHttpServer();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: 'test-rol' } } });
    await app.close();
  });

  it('ADMIN kullanıcı ekler; zayıf parola ve geçersiz rol reddedilir', async () => {
    await admin.post('/api/v1/auth/users').send({ email: 'test-rol-paketci@t.local', password: 'kisa', role: 'PACKER' }).expect(400);
    await admin.post('/api/v1/auth/users').send({ email: 'test-rol-paketci@t.local', password: 'parola-12345', role: 'OLMAYANROL' }).expect(400);
    const res = await admin.post('/api/v1/auth/users').send({ email: 'Test-Rol-Paketci@T.LOCAL', password: 'parola-12345', name: 'Paketçi', role: 'PACKER' }).expect(201);
    expect(res.body.email).toBe('test-rol-paketci@t.local'); // normalize
    packerId = res.body.id;
    await admin.post('/api/v1/auth/users').send({ email: 'test-rol-paketci@t.local', password: 'parola-12345', role: 'PACKER' }).expect(409);
  });

  it('yeni kullanıcı girip rolüne göre çalışır: paketleyici katalog yazamaz', async () => {
    const login = await request(server).post('/api/v1/auth/login').send({ email: 'test-rol-paketci@t.local', password: 'parola-12345' }).expect(200);
    expect(login.body.user.role).toBe('PACKER');
    await request(server)
      .post('/api/v1/catalog/products')
      .set('Authorization', `Bearer ${login.body.accessToken}`)
      .send({ slug: 'x', name: 'X', saleType: 'WEIGHT' })
      .expect(403);
  });

  it('rol değiştirilir ve parola sıfırlanır', async () => {
    const upd = await admin.patch(`/api/v1/auth/users/${packerId}`).send({ role: 'SUPPORT', password: 'yeni-parola-99' }).expect(200);
    expect(upd.body.role).toBe('SUPPORT');
    await request(server).post('/api/v1/auth/login').send({ email: 'test-rol-paketci@t.local', password: 'parola-12345' }).expect(401);
    await request(server).post('/api/v1/auth/login').send({ email: 'test-rol-paketci@t.local', password: 'yeni-parola-99' }).expect(200);
  });

  it('son ADMIN korunur: rolü düşürülemez, silinemez', async () => {
    const list = await admin.get('/api/v1/auth/users').expect(200);
    const root = list.body.data.find((u: { email: string }) => u.email === 'admin@kabzimall.local');
    await admin.patch(`/api/v1/auth/users/${root.id}`).send({ role: 'VIEWER' }).expect(400);
    await admin.delete(`/api/v1/auth/users/${root.id}`).expect(400);
  });

  it('ADMIN olmayan kullanıcı yönetim uçlarına giremez', async () => {
    const support = authed(app, 'SUPPORT');
    await support.get('/api/v1/auth/users').expect(403);
    await support.post('/api/v1/auth/users').send({ email: 'x@t.local', password: 'parola-12345', role: 'VIEWER' }).expect(403);
  });

  it('kullanıcı silinir', async () => {
    await admin.delete(`/api/v1/auth/users/${packerId}`).expect(200);
    const list = await admin.get('/api/v1/auth/users').expect(200);
    expect(list.body.data.find((u: { id: string }) => u.id === packerId)).toBeUndefined();
  });
});
