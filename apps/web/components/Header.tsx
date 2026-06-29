'use client';

import Link from 'next/link';
import { useCart } from '@/lib/cart';

export default function Header() {
  const { items } = useCart();
  return (
    <header className="hdr">
      <div className="in">
        <Link href="/" className="bm serif">
          Kabzı<b>Mall</b>
        </Link>
        <div className="loc">
          📍 Teslimat · <b>Moda, Kadıköy</b>
        </div>
        <div className="spacer" />
        <Link href="/sepet">
          <button className="cartbtn">
            🛒 Sepet
            {items.length > 0 && <span className="dot">{items.length}</span>}
          </button>
        </Link>
      </div>
    </header>
  );
}
