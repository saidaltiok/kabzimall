import { Injectable, Logger } from '@nestjs/common';
import { AnalyticsService } from '../analytics/analytics.service';
import { DashboardService } from '../dashboard/dashboard.service';

const fmtTL = (kurus: number) => `${(kurus / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 })} ₺`;

interface BriefFacts {
  todayOrders: number;
  todayRevenue: number;
  yesterdayRevenue: number;
  weekRevenue: number;
  avgOrderValue: number;
  totalDiscount: number;
  decisionCount: number;
  worstDecisions: { name: string; currentMargin: number | null; suggestedPrice: number }[];
  priceChangesToday: number;
  topMover: { name: string; changes: number } | null;
}

/**
 * Günlük AI özeti (PRD 8.8 "AI yorum modülü"): mevcut verilerden (ciro,
 * karar kuyruğu, fiyat hareketliliği) sabah brifingi üretir.
 * ANTHROPIC_API_KEY varsa LLM yazar; yoksa kural bazlı Türkçe özet döner —
 * ekranlar değişmeden anahtar takılınca LLM devreye girer.
 */
@Injectable()
export class AiBriefService {
  private readonly logger = new Logger('AiBrief');
  private cache: { day: string; result: { source: string; text: string; generatedAt: string } } | null = null;

  constructor(
    private readonly analytics: AnalyticsService,
    private readonly dashboard: DashboardService,
  ) {}

  async dailyBrief(force = false) {
    const day = new Date().toISOString().slice(0, 10);
    if (!force && this.cache?.day === day) return this.cache.result;

    const facts = await this.collectFacts();
    let result: { source: string; text: string; generatedAt: string };
    const key = process.env.ANTHROPIC_API_KEY;
    if (key) {
      try {
        result = { source: 'llm', text: await this.llmBrief(facts, key), generatedAt: new Date().toISOString() };
      } catch (e) {
        this.logger.warn(`LLM özeti başarısız (${(e as Error).message}) — kural bazlı özete düşüldü.`);
        result = { source: 'rules', text: this.rulesBrief(facts), generatedAt: new Date().toISOString() };
      }
    } else {
      result = { source: 'rules', text: this.rulesBrief(facts), generatedAt: new Date().toISOString() };
    }
    this.cache = { day, result };
    return result;
  }

  private async collectFacts(): Promise<BriefFacts> {
    const [overview, movers, decisions] = await Promise.all([
      this.analytics.overview(7),
      this.analytics.priceMovers(7),
      this.dashboard.decisions(),
    ]);
    const today = overview.series[overview.series.length - 1];
    const yesterday = overview.series[overview.series.length - 2];
    const todayKey = new Date().toISOString().slice(0, 10);
    const changesToday = movers.movers.reduce((s, m) => s + (m.byDay[todayKey] ?? 0), 0);
    return {
      todayOrders: today?.orders ?? 0,
      todayRevenue: today?.revenue ?? 0,
      yesterdayRevenue: yesterday?.revenue ?? 0,
      weekRevenue: overview.summary.totalRevenue,
      avgOrderValue: overview.summary.avgOrderValue,
      totalDiscount: overview.summary.totalDiscount,
      decisionCount: decisions.decisions.length,
      worstDecisions: decisions.decisions.slice(0, 3).map((d) => ({ name: d.name, currentMargin: d.currentMargin, suggestedPrice: d.suggestedPrice })),
      priceChangesToday: changesToday,
      topMover: movers.movers[0] ? { name: movers.movers[0].name, changes: movers.movers[0].changes } : null,
    };
  }

  /** Anahtar yokken: aynı verilerden deterministik Türkçe brifing. */
  private rulesBrief(f: BriefFacts): string {
    const parts: string[] = [];
    const diff = f.yesterdayRevenue > 0 ? Math.round(((f.todayRevenue - f.yesterdayRevenue) / f.yesterdayRevenue) * 100) : null;
    parts.push(
      `Bugün ${f.todayOrders} sipariş, ${fmtTL(f.todayRevenue)} ciro` +
        (diff != null ? ` (düne göre ${diff >= 0 ? '+' : ''}%${diff})` : '') +
        `. Haftalık ciro ${fmtTL(f.weekRevenue)}, ortalama sepet ${fmtTL(f.avgOrderValue)}.`,
    );
    if (f.totalDiscount > 0) parts.push(`Kuponlarla bu hafta ${fmtTL(f.totalDiscount)} indirim verildi.`);
    if (f.decisionCount > 0) {
      const ilk = f.worstDecisions[0];
      parts.push(
        `${f.decisionCount} ürün fiyat kararı bekliyor — en kritik: ${ilk.name}` +
          (ilk.currentMargin != null ? ` (net marj %${Math.round(ilk.currentMargin * 100)})` : '') +
          `, öneri ${fmtTL(ilk.suggestedPrice)}. "Bugün" ekranından tek tıkla uygulanabilir.`,
      );
    } else {
      parts.push('Fiyat kararı bekleyen ürün yok — marjlar taban üstünde. 👍');
    }
    if (f.priceChangesToday > 0) parts.push(`Bugün ${f.priceChangesToday} fiyat güncellendi.`);
    if (f.topMover && f.topMover.changes > 1) parts.push(`Haftanın en hareketli ürünü: ${f.topMover.name} (${f.topMover.changes} değişiklik).`);
    return parts.join(' ');
  }

  /** Anahtar varsa: LLM aynı verilerden patron diliyle kısa brifing yazar. */
  private async llmBrief(f: BriefFacts, apiKey: string): Promise<string> {
    const model = process.env.AI_BRIEF_MODEL ?? 'claude-haiku-4-5-20251001';
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model,
        max_tokens: 400,
        messages: [
          {
            role: 'user',
            content:
              `Manav e-ticaret sitesinin sahibine 3-4 cümlelik samimi bir sabah brifingi yaz (Türkçe, madde işareti yok). ` +
              `Rakamları aynen kullan, yorum kat: neye öncelik vermeli? Veriler: ${JSON.stringify(f)} ` +
              `(tutarlar kuruş cinsinden — ₺'ye çevirerek yaz).`,
          },
        ],
      }),
    });
    if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
    const data = (await res.json()) as { content: { type: string; text?: string }[] };
    const text = data.content.find((c) => c.type === 'text')?.text?.trim();
    if (!text) throw new Error('Boş yanıt');
    return text;
  }
}
