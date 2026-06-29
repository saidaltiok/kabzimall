'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { tl, pct, dt } from '@/lib/format';

interface RiskyProduct {
  productId: string;
  basePrice: number;
  directCost: number | null;
  netMargin: number | null;
  competitionIndex: number | null;
  flags: string[];
}
interface Dashboard {
  date: string;
  kpis: {
    pricedProducts: number;
    productsWithHalToday: number;
    competitors: number;
    competitorGroups: number;
    priceChangesToday: number;
    priceChangesTotal: number;
    avgNetMargin: number | null;
    belowFloorCount: number;
    belowCostCount: number;
    riskyProductCount: number;
  };
  riskyProducts: RiskyProduct[];
  recentPriceChanges: {
    productId: string;
    oldPrice: number | null;
    newPrice: number;
    strategy: string;
    changedAt: string;
  }[];
}

const FLAG_META: Record<string, { label: string; cls: string }> = {
  ZARARINA: { label: 'Zararına', cls: 'zararina' },
  DUSUK_MARJ: { label: 'Düşük marj', cls: 'dusuk' },
  RAKIPTEN_PAHALI: { label: 'Rakipten pahalı', cls: 'pahali' },
  MALIYET_TANIMSIZ: { label: 'Maliyet tanımsız', cls: 'info' },
  HAL_VERISI_YOK: { label: 'Hal verisi yok', cls: 'info' },
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Dashboard>('/intel/dashboard')
      .then(setData)
      .catch((e) => setError(e.message));
  }, []);

  if (error)
    return (
      <main className="page">
        <h1 className="page-title">Panel</h1>
        <div className="error">API'ye ulaşılamadı: {error}</div>
        <p className="hint">Sunucu çalışıyor mu? (apps/api → npm run start:dev, Docker açık)</p>
      </main>
    );
  if (!data) return <main className="page"><div className="loading">Yükleniyor…</div></main>;

  const k = data.kpis;
  return (
    <main className="page">
      <h1 className="page-title">Panel</h1>
      <p className="page-sub">Fiyat zekâsı özeti · {data.date}</p>

      <div className="kpi-grid">
        <Kpi label="Fiyatlı ürün" value={k.pricedProducts} />
        <Kpi label="Ortalama net marj" value={pct(k.avgNetMargin)} />
        <Kpi label="Zararına satılan" value={k.belowCostCount} warn={k.belowCostCount > 0} />
        <Kpi label="Düşük marj" value={k.belowFloorCount} warn={k.belowFloorCount > 0} />
        <Kpi label="Bugün hal girilen" value={k.productsWithHalToday} />
        <Kpi label="Rakip / grup" value={`${k.competitors} / ${k.competitorGroups}`} />
        <Kpi label="Fiyat değişikliği (bugün)" value={k.priceChangesToday} />
      </div>

      <div className="card">
        <h2>Riskli ürünler ({data.riskyProducts.length})</h2>
        {data.riskyProducts.length === 0 ? (
          <p className="muted">Risk işareti olan ürün yok. 👍</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ürün</th>
                <th className="num">Fiyat</th>
                <th className="num">Maliyet</th>
                <th className="num">Net marj</th>
                <th className="num">Rekabet</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {data.riskyProducts.map((p) => (
                <tr key={p.productId}>
                  <td>{p.productId}</td>
                  <td className="num">{tl(p.basePrice)}</td>
                  <td className="num">{tl(p.directCost)}</td>
                  <td className="num">{pct(p.netMargin)}</td>
                  <td className="num">{p.competitionIndex ?? '—'}</td>
                  <td>
                    {p.flags.map((f) => {
                      const m = FLAG_META[f] ?? { label: f, cls: 'info' };
                      return (
                        <span key={f} className={`badge ${m.cls}`}>
                          {m.label}
                        </span>
                      );
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="card">
        <h2>Son fiyat değişiklikleri</h2>
        {data.recentPriceChanges.length === 0 ? (
          <p className="muted">Henüz fiyat uygulanmadı.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Ürün</th>
                <th className="num">Eski</th>
                <th className="num">Yeni</th>
                <th>Strateji</th>
                <th>Zaman</th>
              </tr>
            </thead>
            <tbody>
              {data.recentPriceChanges.map((c, i) => (
                <tr key={i}>
                  <td>{c.productId}</td>
                  <td className="num">{tl(c.oldPrice)}</td>
                  <td className="num">{tl(c.newPrice)}</td>
                  <td>{c.strategy}</td>
                  <td>{dt(c.changedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}

function Kpi({ label, value, warn }: { label: string; value: React.ReactNode; warn?: boolean }) {
  return (
    <div className={`kpi${warn ? ' warn' : ''}`}>
      <div className="label">{label}</div>
      <div className="value">{value}</div>
    </div>
  );
}
