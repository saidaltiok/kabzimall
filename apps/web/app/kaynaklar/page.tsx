import type { Metadata } from 'next';
import { readFileSync } from 'fs';
import { join } from 'path';

export const metadata: Metadata = { title: 'Görsel Kaynakları', robots: { index: false } };

interface Credit { slug: string; license: string; source: string; creator: string }

/**
 * Stok görsel atıfları — CC BY lisanslı görseller için yasal gereklilik,
 * CC0/kamu malı olanlar için şeffaflık. Kaynak: public/urunler/_kaynaklar.json
 * (görsel indirme script'i günceller).
 */
export default function KaynaklarPage() {
  let credits: Credit[] = [];
  try {
    credits = JSON.parse(readFileSync(join(process.cwd(), 'public/urunler/_kaynaklar.json'), 'utf8'));
  } catch { /* dosya yoksa boş liste */ }
  const by = credits.filter((c) => /^by/.test(c.license));
  const free = credits.filter((c) => !/^by/.test(c.license));

  return (
    <div style={{ maxWidth: 720, margin: '0 auto', padding: '30px 0' }}>
      <h1 className="h1">Görsel Kaynakları</h1>
      <p className="muted" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
        Sitedeki bazı ürün görselleri açık lisanslı stok kaynaklardan alınmıştır. Yöresel ürün
        fotoğrafları üretici/tedarikçiye aittir. Aşağıda atıf gerektiren (CC BY) görsellerin
        eser sahipleri ve kaynakları listelenmiştir.
      </p>
      {by.length > 0 && (
        <div className="block" style={{ marginTop: 14 }}>
          <h3 className="serif" style={{ margin: '0 0 10px', fontSize: 15 }}>CC BY lisanslı görseller</h3>
          {by.map((c) => (
            <div key={c.slug} style={{ fontSize: 13, padding: '7px 0', borderBottom: '1px solid var(--line)' }}>
              <b>{c.slug}</b> — {c.creator || 'bilinmeyen eser sahibi'} ·{' '}
              <a href={c.source} target="_blank" rel="noreferrer" style={{ color: 'var(--forest)' }}>kaynak</a> · CC BY
            </div>
          ))}
        </div>
      )}
      <p className="muted" style={{ fontSize: 12.5, marginTop: 12 }}>
        Ayrıca {free.length} görsel CC0/kamu malı lisansıyla kullanılmıştır (atıf gerektirmez).
      </p>
    </div>
  );
}
