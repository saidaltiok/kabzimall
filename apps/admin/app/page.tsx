'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet, apiSend } from '@/lib/api';
import { tl, pct } from '@/lib/format';
import Topbar from '@/components/Topbar';

/* ------------------------------- Tipler ------------------------------- */

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

interface Dashboard {
  date: string;
  kpis: {
    pricedProducts: number;
    productsWithHalToday: number;
    competitorPricesToday: number;
    priceChangesToday: number;
    priceChangesTotal: number;
    avgNetMargin: number | null;
    belowCostCount: number;
    riskyProductCount: number;
  };
  recentPriceChanges: { productId: string; oldPrice: number | null; newPrice: number; strategy: string; changedAt: string }[];
}

interface Decision {
  productId: string;
  name: string;
  flags: string[];
  currentPrice: number;
  currentMargin: number | null;
  suggestedPrice: number;
  suggestedMargin: number;
  strategy: string;
  floored: boolean;
}
interface Decisions {
  date: string;
  decisions: Decision[];
  info: { productId: string; name: string; flags: string[] }[];
}

const FLAG_META: Record<string, { label: string; cls: string }> = {
  ZARARINA: { label: 'Zararına satılıyor', cls: 'zararina' },
  DUSUK_MARJ: { label: 'Marjı düşük', cls: 'risk' },
  RAKIPTEN_PAHALI: { label: 'Rakipten pahalı', cls: 'risk' },
  MALIYET_TANIMSIZ: { label: 'Maliyet tanımsız', cls: 'info' },
  HAL_VERISI_YOK: { label: 'Hal verisi yok', cls: 'info' },
};

/* ------------------------------- Ekran -------------------------------- */

export default function BugunPage() {
  const [data, setData] = useState<Dashboard | null>(null);
  const [dec, setDec] = useState<Decisions | null>(null);
  const [ops, setOps] = useState<OpsSummary | null>(null);
  const [busy, setBusy] = useState<string | null>(null); // productId | '__all__'
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const load = useCallback(() => {
    apiGet<Dashboard>('/intel/dashboard').then(setData).catch((e) => setError(e.message));
    apiGet<Decisions>('/intel/dashboard/decisions').then(setDec).catch(() => {});
    apiGet<OpsSummary>('/admin/orders/summary').then(setOps).catch(() => {});
  }, []);
  useEffect(() => { load(); }, [load]);

  /** Motorun önerisini tek tıkla mağaza fiyatı yap (taban korumalı öneri). */
  async function apply(d: Decision) {
    setBusy(d.productId); setError(null); setOk(null);
    try {
      await apiSend('POST', '/intel/price/apply', {
        productId: d.productId,
        price: d.suggestedPrice,
        strategy: d.strategy,
        netMargin: d.suggestedMargin,
        reason: 'Bugün ekranından tek tık uygulama',
      });
      setOk(`✓ ${d.name}: ${tl(d.suggestedPrice)} uygulandı.`);
      load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function applyAll() {
    if (!dec || dec.decisions.length === 0) return;
    if (!confirm(`${dec.decisions.length} ürünün fiyatı motorun önerisiyle güncellenecek (hepsi maliyet tabanı korumalı). Devam?`)) return;
    setBusy('__all__'); setError(null); setOk(null);
    let done = 0;
    for (const d of dec.decisions) {
      try {
        await apiSend('POST', '/intel/price/apply', {
          productId: d.productId, price: d.suggestedPrice, strategy: d.strategy,
          netMargin: d.suggestedMargin, reason: 'Bugün ekranından toplu uygulama',
        });
        done++;
      } catch { /* tekil hata toplu akışı bozmasın */ }
    }
    setOk(`✓ ${done}/${dec.decisions.length} ürünün fiyatı güncellendi.`);
    setBusy(null);
    load();
  }

  const k = data?.kpis;
  const halOk = (k?.productsWithHalToday ?? 0) > 0;
  const rakipOk = (k?.competitorPricesToday ?? 0) > 0;

  return (
    <>
      <Topbar title="Bugün" sub={data ? `${data.date} · veri → karar → uygula` : 'Yükleniyor…'} />
      <div className="body">
        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}
        {!data && !error && <div className="loading">Yükleniyor…</div>}

        {/* 1 — Bugünün verisi geldi mi? */}
        {k && (
          <div className="miniinfo" style={{ marginBottom: 16, flexWrap: 'wrap' }}>
            <span>
              {halOk ? '🟢' : '🟠'} Hal fiyatları:{' '}
              <b>{halOk ? `${k.productsWithHalToday} ürün geldi` : 'bugün henüz yok'}</b>
              {!halOk && <> · <Link href="/hal" style={{ color: 'var(--forest)', fontWeight: 600 }}>Hal ekranından çek/gir →</Link></>}
            </span>
            <span>
              {rakipOk ? '🟢' : '🟠'} Rakip fiyatları:{' '}
              <b>{rakipOk ? `${k.competitorPricesToday} kayıt geldi` : 'bugün henüz yok'}</b>
              {!rakipOk && <> · <Link href="/rakip" style={{ color: 'var(--forest)', fontWeight: 600 }}>Şimdi güncelle →</Link></>}
            </span>
            <span className="muted" style={{ fontSize: 12 }}>Hal 11:00–15:00, rakip 10:00'da otomatik çekilir.</span>
          </div>
        )}

        {/* 2 — Bugünün fiyat kararları (ekranın kalbi) */}
        {dec && (
          <div className="card" style={{ marginBottom: 16, borderLeft: '3px solid var(--persimmon)' }}>
            <div className="ct" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              🎯 Bugünün fiyat kararları
              <span>{dec.decisions.length} ürün aksiyon bekliyor</span>
              {dec.decisions.length > 1 && (
                <button className="btn" style={{ marginLeft: 'auto', background: 'var(--persimmon)' }} onClick={applyAll} disabled={busy != null}>
                  {busy === '__all__' ? 'Uygulanıyor…' : `⚡ Hepsini uygula (${dec.decisions.length})`}
                </button>
              )}
            </div>
            {dec.decisions.length === 0 ? (
              <p className="muted">Bugün fiyat aksiyonu gerektiren ürün yok. 👍</p>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Ürün</th>
                    <th>Sorun</th>
                    <th className="num">Şu an</th>
                    <th className="num">Öneri</th>
                    <th className="num">Yeni marj</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {dec.decisions.map((d) => (
                    <tr key={d.productId}>
                      <td>{d.name} <span className="muted" style={{ fontSize: 11 }}>{d.productId}</span></td>
                      <td>
                        {d.flags.map((f) => {
                          const m = FLAG_META[f] ?? { label: f, cls: 'info' };
                          return <span key={f} className={`tagp ${m.cls}`}>{m.label}</span>;
                        })}
                      </td>
                      <td className="num">{tl(d.currentPrice)} {d.currentMargin != null && <span className="muted" style={{ fontSize: 11 }}>({pct(d.currentMargin)})</span>}</td>
                      <td className="num savecell">
                        {tl(d.suggestedPrice)}
                        {d.floored && <span className="tagp info" style={{ marginLeft: 5, fontSize: 10 }} title="Maliyet tabanı koruması devrede">taban</span>}
                      </td>
                      <td className="num">{pct(d.suggestedMargin)}</td>
                      <td className="num">
                        <button className="btn" style={{ fontSize: 12, padding: '6px 12px' }} onClick={() => apply(d)} disabled={busy != null}>
                          {busy === d.productId ? '…' : '✓ Uygula'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {dec.info.length > 0 && (
              <p className="note2" style={{ marginTop: 10 }}>
                ℹ️ Fiyatlanamayanlar (veri eksik): {dec.info.map((i) => i.name).join(', ')} —{' '}
                <Link href="/hal" style={{ color: 'var(--forest)', fontWeight: 600 }}>hal fiyatı</Link> ya da{' '}
                <Link href="/maliyet" style={{ color: 'var(--forest)', fontWeight: 600 }}>maliyet</Link> girilince öneri üretilebilir.
              </p>
            )}
            <p className="note2" style={{ marginTop: 6 }}>
              Öneriler fiyat motorundan (rakip ortalaması → hedef marj → hal+%100 → taban zinciri), hepsi maliyet tabanı korumalı.
              İnce ayar için <Link href="/oner" style={{ color: 'var(--forest)', fontWeight: 600 }}>Fiyat Öneri Motoru</Link>.
            </p>
          </div>
        )}

        {/* 3 — KPI şeridi */}
        {k && (
          <div className="kpis">
            <Kpi l="Fiyatlı ürün" v={String(k.pricedProducts)} d="mağazada satışta" />
            <Kpi l="Ortalama net marj" v={pct(k.avgNetMargin)} d="hedef %30" />
            <Kpi l="Zararına satılan" v={String(k.belowCostCount)} d="maliyet altı" alert={k.belowCostCount > 0} />
            <Kpi l="Bugünkü fiyat değişikliği" v={String(k.priceChangesToday)} d={`toplam ${k.priceChangesTotal}`} />
          </div>
        )}

        {/* 4 — Bugünün operasyonu */}
        {ops && <Ops ops={ops} />}

        {/* 5 — Son fiyat değişiklikleri */}
        {data && data.recentPriceChanges.length > 0 && (
          <div className="card" style={{ marginTop: 16 }}>
            <div className="ct">Son fiyat değişiklikleri</div>
            {data.recentPriceChanges.slice(0, 8).map((c, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--line)', fontSize: 12.5 }}>
                <b>{c.productId}</b>
                <span className="muted">{c.strategy}</span>
                <span style={{ marginLeft: 'auto' }}>
                  {c.oldPrice != null && <span className="muted">{tl(c.oldPrice)} → </span>}
                  <b>{tl(c.newPrice)}</b>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

function Ops({ ops }: { ops: OpsSummary }) {
  return (
    <div style={{ marginTop: 16 }}>
      <div className="ct" style={{ fontFamily: "'Fraunces', serif", fontSize: 16, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'baseline' }}>
        Bugünün operasyonu
        <Link href="/siparisler" style={{ fontSize: 12, color: 'var(--persimmon)', fontWeight: 600 }}>Siparişlere git →</Link>
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

function Kpi({ l, v, d, alert }: { l: string; v: string; d: string; alert?: boolean }) {
  return (
    <div className={`kpi${alert ? ' alert' : ''}`}>
      <div className="l">{l}</div>
      <div className="v">{v}</div>
      <div className="d">{d}</div>
    </div>
  );
}
