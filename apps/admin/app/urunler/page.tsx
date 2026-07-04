'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { tl, pct } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';

interface Row {
  productId: string;
  basePrice: number;
  halAvg: number | null;
  directCost: number | null;
  netMargin: number | null;
  competitorAvg: number | null;
  competitionIndex: number | null;
  flags: string[];
}

export default function UrunlerPage() {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: Row[] }>('/intel/products')
      .then((r) => setRows(r.data))
      .catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <Topbar title="Ürünler & Marj" sub="Tüm ürünler tek tabloda" />
      <div className="body">
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          Hal → maliyet → mağaza fiyatı → net marj → rekabet endeksi. Endeks 100 altı = rakipten ucuz.
          Bir ürünü yeniden fiyatlamak için <b>Fiyatla →</b>.
        </p>
        {error && <div className="error">{error}</div>}
        {!rows && !error && <div className="loading">Yükleniyor…</div>}
        {rows && (
          <div className="card">
            <div className="ct">
              Fiyatlı ürünler <span>{rows.length} ürün</span>
            </div>
            {rows.length === 0 ? (
              <p className="muted">Henüz fiyat uygulanmış ürün yok. Fiyat Öneri Motoru'ndan başla.</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th className="num">Hal ort.</th>
                    <th className="num">Maliyet</th>
                    <th className="num">Mağaza</th>
                    <th className="num">Rakip ort.</th>
                    <th className="num">Net marj</th>
                    <th className="num">Endeks</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const risk = r.flags.includes('ZARARINA') || r.flags.includes('DUSUK_MARJ');
                    return (
                      <tr key={r.productId}>
                        <td>{r.productId}</td>
                        <td className="num">{tl(r.halAvg)}</td>
                        <td className="num">{tl(r.directCost)}</td>
                        <td className="num savecell">{tl(r.basePrice)}</td>
                        <td className="num">{tl(r.competitorAvg)}</td>
                        <td className="num">
                          {r.netMargin == null ? '—' : <span className={`tagp ${risk ? 'risk' : 'ok'}`}>{pct(r.netMargin)}</span>}
                        </td>
                        <td className="num">
                          {r.competitionIndex == null ? '—' : (
                            <span className={`tagp ${r.competitionIndex < 100 ? 'down' : 'up'}`}>{r.competitionIndex}</span>
                          )}
                        </td>
                        <td className="num">
                          <Link href="/oner" className="btn ghost" style={{ fontSize: 11, padding: '5px 9px' }}>
                            Fiyatla →
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </>
  );
}
