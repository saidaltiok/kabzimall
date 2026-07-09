'use client';

import { useEffect, useState } from 'react';
import { apiGet } from '@/lib/api';
import Combo from './Combo';

interface ProductLite { slug: string; name: string; kind: string; category: { name: string } | null }
interface CategoryLite { slug: string; name: string }

// Basit modül-içi önbellek — aynı sayfada birden çok picker tek istekle beslensin.
let productCache: ProductLite[] | null = null;
let categoryCache: CategoryLite[] | null = null;

/** Aranabilir ÜRÜN seçici (slug döner, kullanıcı adı görür). */
export function ProductPicker({ value, onChange, placeholder = 'Ürün seç…', disabled, allowClear, activeOnly, style }: {
  value: string; onChange: (slug: string) => void; placeholder?: string; disabled?: boolean; allowClear?: boolean; activeOnly?: boolean; style?: React.CSSProperties;
}) {
  const [items, setItems] = useState<ProductLite[]>(productCache ?? []);
  useEffect(() => {
    if (productCache) { setItems(productCache); return; }
    apiGet<{ data: ProductLite[] }>('/catalog/products').then((r) => { productCache = r.data; setItems(r.data); }).catch(() => {});
  }, []);
  const opts = items
    .filter((p) => (activeOnly ? true : true))
    .map((p) => ({ value: p.slug, label: p.name, hint: p.category?.name ?? (p.kind === 'BASKET' ? 'sepet' : undefined) }));
  return <Combo options={opts} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} allowClear={allowClear} style={style} />;
}

/** Aranabilir KATEGORİ seçici (slug döner). */
export function CategoryPicker({ value, onChange, placeholder = 'Kategori seç…', disabled, allowClear, style }: {
  value: string; onChange: (slug: string) => void; placeholder?: string; disabled?: boolean; allowClear?: boolean; style?: React.CSSProperties;
}) {
  const [items, setItems] = useState<CategoryLite[]>(categoryCache ?? []);
  useEffect(() => {
    if (categoryCache) { setItems(categoryCache); return; }
    apiGet<{ data: CategoryLite[] }>('/catalog/categories').then((r) => { categoryCache = r.data; setItems(r.data); }).catch(() => {});
  }, []);
  const opts = items.map((c) => ({ value: c.slug, label: c.name }));
  return <Combo options={opts} value={value} onChange={onChange} placeholder={placeholder} disabled={disabled} allowClear={allowClear} style={style} />;
}

/** Picker önbelleğini boşalt (ürün/kategori değişince tazelesin). */
export function invalidatePickerCache() { productCache = null; categoryCache = null; }
