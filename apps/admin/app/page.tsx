'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import { tl, pct, dt } from '@/lib/format';
import Topbar from '@/components/Topbar';

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
  recentPriceChanges: { productId: string; oldPrice: number | null; newPrice: number; strategy: string; changedAt: string }[];
}

const FLAG_META: Record<string, { label: string; cls: string }> = {
  ZARARINA: { label: 'Zararına', cls: 'zararina' },
  DUSUK_MARJ: { label: 'Düşük marj', cls: 'risk' },
  RAKIPTEN_PAHALI: { label: 'Rakipten pahalı', cls: 'risk' },
  MALIYET_TANIMSIZ: { label: 'Maliyet tanımsız', cls: 'info' },
  HAL_VERISI_YOK: { label: 'Hal verisi yok', cls: 'info' },
};

export default function DashboardPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Dashboard>('/intel/dashboard').then(setData).catch((e) => setError(e.message));
  }, []);

  return (
    <>
      <Topbar title="Dashboard" sub={data ? `Fiyat zekâsı özeti · ${data.date}` : 'Yükleniyor…'} />
      <div className="body">
        {error && (
          <div className="error">
            API'ye ulaşılamadı: {error} — sunucu çalışıyor mu? (apps/api → npm run start:dev, Docker açık)
          </div>
        )}
        {!data && !error && <div className="loading">Yükleniyor…</div>}
        {data && <Content data={data} />}
      </div>
    </>
  );
}

function Content({ data }: { data: Dashboard }) {
  const k = data.kpis;
  return (
    <>
      <div className="kpis">
        <Kpi l="Fiyatlı ürün" v={String(k.pricedProducts)} d={`bugün ${k.productsWithHalToday} hal girişi`} />
        <Kpi l="Ortalama net marj" v={pct(k.avgNetMargin)} d="hedef %30" />
        <Kpi l="Zararına satılan" v={String(k.belowCostCount)} d="maliyet altı" alert={k.belowCostCount > 0} />
        <Kpi l="Riskli ürün" v={String(k.riskyProductCount)} d="aksiyon gerek" alert={k.riskyProductCount > 0} />
      </div>

      <div className="grid2">
        <div className="card">
          <div className="ct">
            Riskli ürünler <span>{data.riskyProducts.length} ürün</span>
          </div>
          {data.riskyProducts.length === 0 ? (
            <p className="muted">Risk işareti olan ürün yok. 👍</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Ürün</th>
                  <th className="num">Fiyat</th>
                  <th className="num">Maliyet</th>
                  <th className="num">Marj</th>
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
                    <td>
                      {p.flags.map((f) => {
                        const m = FLAG_META[f] ?? { label: f, cls: 'info' };
                        return <span key={f} className={`tagp ${m.cls}`}>{m.label}</span>;
                      })}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <div className="ct">
            Son fiyat değişiklikleri <span>price_history</span>
          </div>
          {data.recentPriceChanges.length === 0 ? (
            <p className="muted">Henüz fiyat uygulanmadı.</p>
          ) : (
            data.recentPriceChanges.map((c, i) => (
              <div
                key={i}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 12.5 }}
              >
                <b>{c.productId}</b>
                <span className="muted">{c.strategy}</span>
                <span style={{ marginLeft: 'auto' }}>
                  {c.oldPrice != null && <span className="muted">{tl(c.oldPrice)} → </span>}
                  <b>{tl(c.newPrice)}</b>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <div className="aibox">
        <span className="k">Günlük Özet</span>
        {k.belowCostCount > 0 ? (
          <>
            <b>{k.belowCostCount} ürün maliyetinin altında satılıyor</b> — Fiyat Öneri Motoru'ndan
            yeniden fiyatlamanı öneririm.{' '}
          </>
        ) : (
          <>Maliyet altında satılan ürün yok. </>
        )}
        Ortalama net marj {pct(k.avgNetMargin)} (hedef %30). Toplam {k.priceChangesTotal} fiyat
        değişikliği kayıtlı; bugün {k.priceChangesToday}. Tüm hesaplar packages/pricing ile
        gerçek-zamanlı.
      </div>
    </>
  );
}

function Kpi({ l, v, d, alert }: { l: string; v: string; d: string; alert?: boolean }) {
  return (
    <div className={`kpi${alert ? ' alert' : ''}`}>
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className="d">{d}</div>
    </div>
  );
}
