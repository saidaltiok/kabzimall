'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiGet, apiSend } from '@/lib/api';
import { tl } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { MARKET_TABS } from '@/components/SectionTabs';
import Icon from '@/components/Icon';
import { ProductPicker } from '@/components/pickers';
import { tlToKurus } from '@/lib/money';

interface Competitor { id: string; name: string; group: { id: string; name: string } }
interface Group { id: string; name: string }
interface CoverageRow { slug: string; name: string; coverage: number; minComp: number; medianComp: number; ourPrice: number | null; isActive: boolean; belowFloor: boolean }
interface Prices {
  productId: string;
  count: number;
  min: number | null;
  max: number | null;
  average: number | null;
  median: number | null;
  stdDev: number | null;
  ourPrice: number | null;
  competitionIndex: number | null;
  byGroup: { group: string; count: number; average: number }[];
  entries: { competitorId: string; competitor: string; group: string; price: number }[];
}

export default function RakipPage() {
  const [productId, setProductId] = useState('');
  const [competitors, setCompetitors] = useState<Competitor[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [prices, setPrices] = useState<Prices | null>(null);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // yeni rakip
  const [newComp, setNewComp] = useState('');
  const [newGroup, setNewGroup] = useState('');
  // tüm ürünler rakip özeti
  const [allOpen, setAllOpen] = useState(false);
  const [coverage, setCoverage] = useState<CoverageRow[] | null>(null);

  const loadMeta = useCallback(async () => {
    try {
      const [c, g] = await Promise.all([
        apiGet<{ data: Competitor[] }>('/intel/competitors'),
        apiGet<{ data: Group[] }>('/intel/competitor-groups'),
      ]);
      setCompetitors(c.data);
      setGroups(g.data);
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  const loadPrices = useCallback(async (pid: string) => {
    try {
      setPrices(await apiGet<Prices>(`/intel/competitor-prices?productId=${encodeURIComponent(pid)}`));
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => { loadMeta(); }, [loadMeta]);
  useEffect(() => { if (productId) loadPrices(productId); }, [productId, loadPrices]);
  async function toggleAll() {
    const next = !allOpen; setAllOpen(next);
    if (next && !coverage) {
      try { const r = await apiGet<{ rows: CoverageRow[] }>('/intel/competitor-prices/coverage'); setCoverage(r.rows ?? []); }
      catch (e) { setError((e as Error).message); setCoverage([]); }
    }
  }

  function currentPrice(competitorId: string): number | null {
    return prices?.entries.find((e) => e.competitorId === competitorId)?.price ?? null;
  }

  async function savePrice(competitorId: string) {
    const raw = inputs[competitorId];
    if (!raw) return;
    setBusy(true);
    setError(null);
    try {
      const kurus = tlToKurus(raw) ?? NaN;
      if (!Number.isFinite(kurus) || kurus < 0) throw new Error('Geçerli fiyat girin (₺).');
      await apiSend('POST', '/intel/competitor-prices/entries', { productId, competitorId, price: kurus });
      setInputs((s) => ({ ...s, [competitorId]: '' }));
      await loadPrices(productId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  /**
   * Tek kapı: TÜM otomatik kaynaklar (resmî marketfiyati 6 zincir + online
   * manavlar) tek tıkla çekilir. Aynı iş her sabah 10:00'da cron'la da çalışır —
   * ayrı ayrı "şu kaynağı çek" butonlarına gerek yok (buton enflasyonu sadeleşti).
   */
  async function refreshAll() {
    if (!confirm('Tüm otomatik kaynaklardan (resmî marketfiyati + online manavlar) güncel rakip fiyatları şimdi çekilecek. Devam?')) return;
    setBusy(true); setError(null); setOk(null);
    try {
      const r = await apiSend<{ marketfiyati: { recorded: number }; manav: { site: string; recorded: number }[] }>('POST', '/intel/competitor-prices/refresh-all', {});
      const manavTotal = r.manav.reduce((s, m) => s + m.recorded, 0);
      setOk(`${r.marketfiyati.recorded + manavTotal} güncel rakip fiyatı kaydedildi (zincir marketler ${r.marketfiyati.recorded} + online manavlar ${manavTotal}).`);
      await loadPrices(productId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function addCompetitor() {
    if (!newComp || !newGroup) return;
    setBusy(true);
    setError(null);
    try {
      let group = groups.find((g) => g.name.toLowerCase() === newGroup.trim().toLowerCase());
      if (!group) group = await apiSend<Group>('POST', '/intel/competitor-groups', { name: newGroup.trim() });
      await apiSend('POST', '/intel/competitors', { name: newComp.trim(), groupId: group.id });
      setNewComp('');
      setNewGroup('');
      await loadMeta();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Topbar title="Rakip Fiyatları" sub="Rakip ve grup karşılaştırması" />
      <div className="body">
        <SectionTabs tabs={MARKET_TABS} />
        <div className="form-row" style={{ marginBottom: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div className="card" style={{ maxWidth: 360, margin: 0, flex: 1 }}>
            <div className="field"><label>Tek ürün rakip fiyatları</label>
              <ProductPicker value={productId} onChange={setProductId} placeholder="Ürün ara ve seç…" />
            </div>
          </div>
          <button className="btn ghost" style={{ marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={toggleAll}>{allOpen ? '▲ Tüm ürünler listesini gizle' : <><Icon name="menu" size={15} /> Tüm ürünler (rakip özeti)</>}</button>
        </div>

        {allOpen && (
          <div className="card">
            <div className="ct">Tüm ürünler — rakip özeti {coverage && <span>{coverage.length} ürün</span>}</div>
            {!coverage ? <p className="muted">Yükleniyor…</p> : coverage.length === 0 ? <p className="muted">Henüz rakip fiyatı girilmemiş.</p> : (
              <table>
                <thead><tr><th>Ürün</th><th className="num">Rakip sayısı</th><th className="num">En düşük</th><th className="num">Medyan</th><th className="num">Bizim fiyat</th><th>Durum</th></tr></thead>
                <tbody>
                  {coverage.map((c) => (
                    <tr key={c.slug} onClick={() => { setProductId(c.slug); setAllOpen(false); }} style={{ cursor: 'pointer' }} title="Bu ürünün rakip detayını aç">
                      <td><b>{c.name}</b> <span className="muted" style={{ fontSize: 10.5 }}>detay ›</span></td>
                      <td className="num">{c.coverage}</td>
                      <td className="num">{tl(c.minComp)}</td>
                      <td className="num savecell">{tl(c.medianComp)}</td>
                      <td className="num">{tl(c.ourPrice)}</td>
                      <td>{!c.isActive ? <span className="tagp info">kapalı</span> : c.belowFloor ? <span className="tagp zararina">medyan taban altı</span> : <span className="tagp ok">yayında</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
        <p className="hint">
          Rakip fiyatları <b>her sabah 10:00'da otomatik</b> çekilir (resmî marketfiyati zincirleri +
          online manavlar). Beklemeden istersen <b>Şimdi güncelle</b>. Otomatik kaynakta olmayan
          rakipler (Getir, Trendyol, yerel zincirler…) için fiyatı aşağıdaki tabloya elle gir —
          <b> min · maks · ortalama · medyan</b> anında güncellenir.
        </p>

        <div className="form-row" style={{ marginBottom: 12, alignItems: 'center' }}>
          <button className="btn" style={{ background: 'var(--persimmon)', display: 'inline-flex', alignItems: 'center', gap: 6 }} onClick={refreshAll} disabled={busy}>
            {busy ? 'Çekiliyor…' : <><Icon name="refresh" size={15} /> Şimdi güncelle (tüm otomatik kaynaklar)</>}
          </button>
          <span className="muted" style={{ fontSize: 12 }}>A101 · BİM · ŞOK · Migros · Carrefour · Tarım Kredi + online manavlar — her sabah 10:00'da kendiliğinden çalışır</span>
        </div>

        {error && <div className="error">{error}</div>}
        {ok && <div className="ok-box">{ok}</div>}

        <div className="card">
          <div className="ct">
            Rakip fiyatları <span>{prices?.count ?? 0} rakip fiyatlı</span>
          </div>
          {!productId ? (
            <p className="muted">Rakip fiyatlarını görmek/girmek için yukarıdan bir ürün seçin.</p>
          ) : competitors.length === 0 ? (
            <p className="muted">Henüz rakip yok. Aşağıdan ekleyebilirsin.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Rakip</th>
                  <th>Grup</th>
                  <th className="num">Güncel</th>
                  <th className="num">Yeni fiyat (₺)</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {competitors.map((c) => (
                  <tr key={c.id}>
                    <td>{c.name}</td>
                    <td><span className="tagp info">{c.group.name}</span></td>
                    <td className="num">{tl(currentPrice(c.id))}</td>
                    <td className="num">
                      <input
                        className="cell"
                        style={{ width: 90 }}
                        value={inputs[c.id] ?? ''}
                        onChange={(e) => setInputs((s) => ({ ...s, [c.id]: e.target.value }))}
                        onKeyDown={(e) => e.key === 'Enter' && savePrice(c.id)}
                        placeholder="—"
                      />
                    </td>
                    <td>
                      <button className="btn ghost" onClick={() => savePrice(c.id)} disabled={busy || !inputs[c.id]}>
                        Kaydet
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {prices && prices.count > 0 && (
            <>
              <div className="miniinfo" style={{ marginTop: 12 }}>
                <span>Min <b>{tl(prices.min)}</b></span>
                <span>Maks <b>{tl(prices.max)}</b></span>
                <span>Ortalama <b>{tl(prices.average)}</b></span>
                <span>Medyan <b>{tl(prices.median)}</b></span>
                <span>Std. sapma <b>{tl(prices.stdDev)}</b></span>
              </div>
              <div className="miniinfo" style={{ marginTop: 8 }}>
                <span>Bizim fiyat <b>{prices.ourPrice != null ? tl(prices.ourPrice) : '—'}</b></span>
                {prices.competitionIndex != null && (
                  <span>
                    Rekabet endeksi{' '}
                    <b className={`tagp ${prices.competitionIndex > 100 ? 'zararina' : 'ok'}`}>
                      {prices.competitionIndex} · {prices.competitionIndex > 100 ? `rakipten %${prices.competitionIndex - 100} pahalı` : prices.competitionIndex < 100 ? `rakipten %${100 - prices.competitionIndex} ucuz` : 'rakiple aynı'}
                    </b>
                  </span>
                )}
              </div>
              {prices.byGroup.length > 1 && (
                <div className="miniinfo" style={{ marginTop: 8 }}>
                  <span className="muted">Grup ort.:</span>
                  {prices.byGroup.map((g) => (
                    <span key={g.group}>{g.group} <b>{tl(g.average)}</b> <span className="muted">({g.count})</span></span>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="card">
          <div className="ct">Yeni rakip ekle</div>
          <div className="form-row">
            <div className="field">
              <label>Rakip adı</label>
              <input value={newComp} onChange={(e) => setNewComp(e.target.value)} placeholder="Migros" />
            </div>
            <div className="field">
              <label>Grup (varsa seç / yeni yaz)</label>
              <input
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value)}
                placeholder="Orta"
                list="groups"
              />
              <datalist id="groups">
                {groups.map((g) => (
                  <option key={g.id} value={g.name} />
                ))}
              </datalist>
            </div>
            <button className="btn" onClick={addCompetitor} disabled={busy || !newComp || !newGroup}>
              Rakip ekle
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
