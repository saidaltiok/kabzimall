'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { apiGet } from '@/lib/api';
import { tl, pct } from '@/lib/format';
import Topbar from '@/components/Topbar';
import SectionTabs, { PRICING_TABS } from '@/components/SectionTabs';
import DataTable, { type Column } from '@/components/DataTable';

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
  const [names, setNames] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiGet<{ data: Row[] }>('/intel/products').then((r) => setRows(r.data)).catch((e) => setError(e.message));
    apiGet<{ data: { slug: string; name: string }[] }>('/catalog/products').then((r) => {
      const m: Record<string, string> = {}; for (const p of r.data) m[p.slug] = p.name; setNames(m);
    }).catch(() => {});
  }, []);

  const nm = (slug: string) => names[slug] ?? slug;

  const columns: Column<Row>[] = [
    { key: 'name', label: 'Ürün', locked: true, sortValue: (r) => nm(r.productId), render: (r) => <b>{nm(r.productId)}</b> },
    { key: 'halAvg', label: 'Hal ort.', align: 'right', sortValue: (r) => r.halAvg, render: (r) => tl(r.halAvg) },
    { key: 'directCost', label: 'Maliyet', align: 'right', sortValue: (r) => r.directCost, render: (r) => tl(r.directCost) },
    { key: 'basePrice', label: 'Mağaza', align: 'right', sortValue: (r) => r.basePrice, render: (r) => <span className="savecell">{tl(r.basePrice)}</span> },
    { key: 'competitorAvg', label: 'Rakip ort.', align: 'right', sortValue: (r) => r.competitorAvg, render: (r) => tl(r.competitorAvg) },
    {
      key: 'netMargin', label: 'Net marj', align: 'right', sortValue: (r) => r.netMargin,
      render: (r) => (r.netMargin == null ? '—' : <span className={`tagp ${r.flags.includes('ZARARINA') || r.flags.includes('DUSUK_MARJ') ? 'risk' : 'ok'}`}>{pct(r.netMargin)}</span>),
    },
    {
      key: 'competitionIndex', label: 'Endeks', align: 'right', sortValue: (r) => r.competitionIndex,
      render: (r) => (r.competitionIndex == null ? '—' : <span className={`tagp ${r.competitionIndex < 100 ? 'down' : 'up'}`}>{r.competitionIndex}</span>),
    },
    { key: 'action', label: '', render: () => <Link href="/oner" className="btn ghost" style={{ fontSize: 11, padding: '5px 9px' }}>Fiyatla →</Link> },
  ];

  return (
    <>
      <Topbar title="Ürünler & Marj" sub="Tüm ürünler tek tabloda" />
      <div className="body">
        <SectionTabs tabs={PRICING_TABS} />
        <p className="hint">
          Hal → maliyet → mağaza fiyatı → net marj → rekabet endeksi. Endeks 100 altı = rakipten ucuz.
          Başlığa tıklayıp sıralayın, <b>⚙ Sütunlar</b> ile düzenleyin. Yeniden fiyatlamak için <b>Fiyatla →</b>.
        </p>
        {error && <div className="error">{error}</div>}
        {!rows && !error && <div className="loading">Yükleniyor…</div>}
        {rows && (
          <div className="card">
            <div className="ct">Fiyatlı ürünler <span>{rows.length} ürün</span></div>
            <DataTable id="urunler-marj" columns={columns} rows={rows} rowKey={(r) => r.productId} emptyText="Henüz fiyat uygulanmış ürün yok. Fiyat Öneri Motoru'ndan başla." />
          </div>
        )}
      </div>
    </>
  );
}
