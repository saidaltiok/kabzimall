/**
 * Jest yapılandırması (apps/api).
 * Testler test/ altında *.e2e-spec.ts olarak yaşar; tam Nest uygulamasını
 * ayağa kaldırıp HTTP yüzeyini supertest ile doğrularlar (entegrasyon testi).
 * Fiyat mantığı packages/pricing'te ayrıca node:test ile test edilir — burada
 * sadece API davranışı (doğrulama, yanıt şekli, durum kodu) test edilir.
 */
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '.*\\.e2e-spec\\.ts$',
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  testEnvironment: 'node',
  setupFiles: ['<rootDir>/test/setup.ts'],
};
