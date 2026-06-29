import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp, authed } from './test-app';

describe('Auth & roller', () => {
  let app: INestApplication;
  let http: ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    app = await createTestApp(); // onModuleInit varsayılan admin'i seed eder
    http = app.getHttpServer();
  });

  afterAll(async () => {
    await app.close();
  });

  it('doğru kimlikle login → accessToken', async () => {
    const res = await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@kabzimall.local', password: 'kabzimall123' })
      .expect(200);
    expect(res.body.accessToken).toBeDefined();
    expect(res.body.user.role).toBe('ADMIN');
  });

  it('yanlış parola → 401', async () => {
    await request(http)
      .post('/api/v1/auth/login')
      .send({ email: 'admin@kabzimall.local', password: 'yanlis' })
      .expect(401);
  });

  it('token olmadan /intel → 401', async () => {
    await request(http).get('/api/v1/intel/dashboard').expect(401);
  });

  it('health public → token olmadan 200', async () => {
    await request(http).get('/api/v1/health').expect(200);
  });

  it('VIEWER rolü: dashboard okur (200) ama fiyat uygulayamaz (403)', async () => {
    const viewer = authed(app, 'VIEWER');
    await viewer.get('/api/v1/intel/dashboard').expect(200);
    await viewer
      .post('/api/v1/intel/price/apply')
      .send({ productId: 'x', price: 100, strategy: 'MANUAL' })
      .expect(403);
  });

  it('ADMIN rolü: korumalı uca erişebilir (apply 200/4xx ama 403 değil)', async () => {
    const admin = authed(app, 'ADMIN');
    const res = await admin
      .post('/api/v1/intel/price/apply')
      .send({ productId: 'auth-test', price: 1000, strategy: 'MANUAL' });
    expect(res.status).not.toBe(403);
    expect(res.status).not.toBe(401);
  });
});
