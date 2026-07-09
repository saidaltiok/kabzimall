/**
 * Günlük veritabanı yedeği — veri kaybına karşı güvenlik ağı.
 *
 * Ne yapar:
 *  1. PostgreSQL'i sıkıştırılmış custom-format (.dump) olarak yedekler.
 *  2. backups/ altına tarih damgalı yazar (kabzimall-YYYY-MM-DD.dump).
 *  3. RETENTION_DAYS'ten (varsayılan 14) eski yerel yedekleri siler.
 *  4. rclone kuruluysa ve BACKUP_RCLONE_REMOTE tanımlıysa Drive'a (veya
 *     herhangi bir rclone hedefine) yükler. Değilse yerel yedek yeterlidir.
 *
 * Koşum:   cd apps/api && npm run db:backup
 * Zamanla: OS zamanlayıcısıyla günde bir çağırın (DEPLOY.md'de anlatıldı).
 *
 * Docker'lı yerel kurulumda pg_dump, DB konteyneri içinde çalışır
 * (BACKUP_DOCKER_CONTAINER); yönetilen/uzak Postgres'te doğrudan pg_dump.
 */
import 'dotenv/config';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const OUT_DIR = process.env.BACKUP_DIR || path.resolve(process.cwd(), 'backups');
const RETENTION_DAYS = Number(process.env.BACKUP_RETENTION_DAYS || 14);
const CONTAINER = process.env.BACKUP_DOCKER_CONTAINER || 'kabzimall-db'; // '' → doğrudan pg_dump
const DB_USER = process.env.BACKUP_DB_USER || 'kabzimall';
const DB_NAME = process.env.BACKUP_DB_NAME || 'kabzimall';
const RCLONE_REMOTE = process.env.BACKUP_RCLONE_REMOTE || ''; // ör. "gdrive:kabzimall-yedek"

const stamp = new Date().toISOString().slice(0, 10); // YYYY-MM-DD (OS tarihi)
const fname = `kabzimall-${stamp}.dump`;
const outPath = path.join(OUT_DIR, fname);
fs.mkdirSync(OUT_DIR, { recursive: true });

function run(cmd, args) {
  return execFileSync(cmd, args, { stdio: ['ignore', 'pipe', 'inherit'] });
}

try {
  console.log(`[yedek] ${DB_NAME} → ${outPath}`);
  if (CONTAINER) {
    // Konteyner içinde dump al, sonra host'a kopyala (bind-mount gerektirmez).
    const tmp = `/tmp/${fname}`;
    run('docker', ['exec', CONTAINER, 'pg_dump', '-U', DB_USER, '-Fc', DB_NAME, '-f', tmp]);
    run('docker', ['cp', `${CONTAINER}:${tmp}`, outPath]);
    try { run('docker', ['exec', CONTAINER, 'rm', '-f', tmp]); } catch { /* önemsiz */ }
  } else {
    // Doğrudan pg_dump (DATABASE_URL kullanır).
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL yok (konteyner de tanımlı değil).');
    run('pg_dump', ['-Fc', url, '-f', outPath]);
  }
  const kb = Math.round(fs.statSync(outPath).size / 1024);
  console.log(`[yedek] tamam: ${fname} (${kb} KB)`);
} catch (e) {
  console.error('[yedek] HATA:', e.message);
  process.exit(1);
}

// Eski yerel yedekleri buda.
try {
  const cutoff = Date.now() - RETENTION_DAYS * 86_400_000;
  let pruned = 0;
  for (const f of fs.readdirSync(OUT_DIR)) {
    if (!/^kabzimall-\d{4}-\d{2}-\d{2}\.dump$/.test(f)) continue;
    const p = path.join(OUT_DIR, f);
    if (fs.statSync(p).mtimeMs < cutoff) { fs.unlinkSync(p); pruned++; }
  }
  if (pruned) console.log(`[yedek] ${pruned} eski yedek silindi (>${RETENTION_DAYS} gün).`);
} catch (e) {
  console.warn('[yedek] budama atlandı:', e.message);
}

// Uzak hedefe (Drive vb.) yükle — rclone kuruluysa ve remote tanımlıysa.
if (RCLONE_REMOTE) {
  try {
    console.log(`[yedek] rclone → ${RCLONE_REMOTE}`);
    run('rclone', ['copy', outPath, RCLONE_REMOTE, '--no-traverse']);
    // Uzakta da RETENTION_DAYS'ten eskiyi temizle.
    try { run('rclone', ['delete', RCLONE_REMOTE, '--min-age', `${RETENTION_DAYS}d`]); } catch { /* opsiyonel */ }
    console.log('[yedek] Drive yüklemesi tamam.');
  } catch (e) {
    console.error('[yedek] rclone yüklemesi başarısız (yerel yedek yine de alındı):', e.message);
    process.exit(2); // yerel var; zamanlayıcı bunu "kısmi" olarak görebilir
  }
} else {
  console.log('[yedek] Uzak yükleme atlandı (BACKUP_RCLONE_REMOTE tanımsız). Yalnız yerel yedek.');
}
