'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { tl, pct, dt } from '@/lib/format';
import Topbar from '@/components/Topbar';

interface OpsSummary {
  ordersToday: number;
  revenueToday: number;
  activeCount: number;
  statusCounts: Record<string, number>;
  lowStock: { slug: string; name: string; stockQty: number | null; unitLabel: string | null }[];
}
const OPS_STATUS: [string, string][] = [
  ['CONFIRMED', 'Onaylandı'],
  ['PREPARING', 'Hazırlanıyor'],
  ['READY', 'Hazır'],
  ['OUT_FOR_DELIVERY', 'Yolda'],
];

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
  const [ops, setOps] = useState<OpsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<Dashboard>('/intel/dashboard').then(setData).catch((e) => setError(e.message));
    apiGet<OpsSummary>('/admin/orders/summary').then(setOps).catch(() => {});
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
        {ops && <Ops ops={ops} />}
        {!data && !error && <div className="loading">Yükleniyor…</div>}
        {data && <Content data={data} />}
      </div>
    </>
  );
}

function Ops({ ops }: { ops: OpsSummary }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div className="ct" style={{ fontFamily: "'Fraunces', serif", fontSize: 16, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'baseline' }}>
        Bugünün operasyonu
        <Link href="/pano" style={{ fontSize: 12, color: 'var(--persimmon)', fontWeight: 600 }}>Panoya git →</Link>
      </div>
      <div className="kpis">
        <Kpi l="Bugünkü sipariş" v={String(ops.ordersToday)} d="00:00'dan beri" />
        <Kpi l="Bugünkü ciro" v={tl(ops.revenueToday)} d="iptaller hariç" />
        <Kpi l="Aktif sipariş" v={String(ops.activeCount)} d="işlem bekliyor" alert={ops.activeCount > 0} />
        <Kpi l="Düşük stok" v={String(ops.lowStock.length)} d="≤ 5 birim" alert={ops.lowStock.length > 0} />
      </div>

      <div className="grid2" style={{ marginTop: 14 }}>
        <div className="card">
          <div className="ct">Aktif sipariş durumları</div>
          {ops.activeCount === 0 ? (
            <p className="muted">Aktif sipariş yok. 👍</p>
          ) : (
            <div className="pchips">
              {OPS_STATUS.map(([s, label]) => (
                <div className="pchip" key={s}>{label}<b style={{ marginLeft: 6 }}>{ops.statusCounts[s] ?? 0}</b></div>
              ))}
            </div>
          )}
          <p className="note2" style={{ marginTop: 10 }}>
            Siparişleri <Link href="/siparisler" style={{ color: 'var(--forest)', fontWeight: 600 }}>listeden</Link> ya da <Link href="/pano" style={{ color: 'var(--forest)', fontWeight: 600 }}>panodan</Link> yönet.
          </p>
        </div>

        <div className="card">
          <div className="ct">Düşük stok uyarıları <span>{ops.lowStock.length} ürün</span></div>
          {ops.lowStock.length === 0 ? (
            <p className="muted">Stoğu düşük ürün yok. 👍</p>
          ) : (
            <table>
              <thead><tr><th>Ürün</th><th className="num">Kalan</th></tr></thead>
              <tbody>
                {ops.lowStock.map((p) => (
                  <tr key={p.slug}>
                    <td>{p.name}</td>
                    <td className="num">
                      {p.stockQty != null && p.stockQty <= 0
                        ? <span className="tagp zararina">tükendi</span>
                        : <b>{p.stockQty} {p.unitLabel ?? ''}</b>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
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
