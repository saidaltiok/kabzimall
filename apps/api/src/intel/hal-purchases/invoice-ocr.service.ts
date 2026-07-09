import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';

interface OcrLine { name: string; kg: number | null; totalPaid: number | null; matchedSlug: string | null; unitPrice: number | null }

/**
 * Hal alım faturası fotoğrafı → satır kalemleri (ürün adı, kg, ödenen tutar).
 * Claude vision ile okunur (ANTHROPIC_API_KEY varsa); yoksa 400 döner ve
 * kullanıcı elle girer. Çıkan kalemler kaydedilmez — panelde gözden geçirilip
 * (isim → ürün eşlemesi düzeltilip) toplu hal alımı olarak onaylanır.
 */
@Injectable()
export class InvoiceOcrService {
  private readonly logger = new Logger(InvoiceOcrService.name);
  constructor(private readonly prisma: PrismaService) {}

  get enabled() { return !!process.env.ANTHROPIC_API_KEY; }

  async parse(imageBase64: string, mediaType: string): Promise<{ lines: OcrLine[]; note: string }> {
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) {
      throw new BadRequestException('Fatura okuma (OCR) için ANTHROPIC_API_KEY tanımlı değil. Kalemleri elle girebilirsiniz.');
    }
    const clean = imageBase64.replace(/^data:[^;]+;base64,/, '');
    if (clean.length < 100) throw new BadRequestException('Geçersiz görsel.');
    if (clean.length > 7_000_000) throw new BadRequestException('Görsel çok büyük (en fazla ~5 MB).');

    const model = process.env.AI_OCR_MODEL ?? 'claude-sonnet-5';
    const prompt =
      'Bu bir Türkiye hal (sebze-meyve toptancı) alım faturası/irsaliyesi fotoğrafı. ' +
      'Her satır kalemi için ürün adını, kilogramı ve o satırın ÖDENEN TOPLAM tutarını çıkar. ' +
      'YALNIZ şu JSON formatında yanıt ver, başka metin yok: ' +
      '{"lines":[{"name":"domates","kg":50,"total":100.50}]}. ' +
      'kg ondalıklı olabilir; total TL cinsinden ondalıklı sayı (kuruş değil). Okuyamadığın alanı null bırak. ' +
      'Birim fiyat × kg satırını değil, satırın toplam tutarını al.';

    let parsed: { lines?: { name?: string; kg?: number | null; total?: number | null }[] };
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({
          model,
          max_tokens: 1500,
          messages: [{
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mediaType, data: clean } },
              { type: 'text', text: prompt },
            ],
          }],
        }),
      });
      if (!res.ok) throw new Error(`Anthropic API ${res.status}`);
      const data = (await res.json()) as { content: { type: string; text?: string }[] };
      const text = data.content.find((c) => c.type === 'text')?.text ?? '';
      const json = text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1);
      parsed = JSON.parse(json);
    } catch (e) {
      this.logger.warn(`OCR başarısız: ${(e as Error).message}`);
      throw new BadRequestException('Fatura okunamadı. Görseli netleştirip tekrar deneyin ya da kalemleri elle girin.');
    }

    // Ürün adlarını mevcut kataloğa eşle (kullanıcıya ön-dolu slug gelsin).
    const products = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, kind: 'SIMPLE' },
      select: { slug: true, name: true },
    });
    const norm = (s: string) => s.toLocaleLowerCase('tr').replace(/[^a-zçğıöşü0-9]/gi, '');
    const match = (name: string): string | null => {
      const n = norm(name);
      if (!n) return null;
      let best: { slug: string; score: number } | null = null;
      for (const p of products) {
        const pn = norm(p.name);
        let score = 0;
        if (pn === n) score = 100;
        else if (pn.includes(n) || n.includes(pn)) score = 70;
        else if (norm(p.slug).includes(n) || n.includes(norm(p.slug))) score = 60;
        if (score > (best?.score ?? 0)) best = { slug: p.slug, score };
      }
      return best && best.score >= 60 ? best.slug : null;
    };

    const lines: OcrLine[] = (parsed.lines ?? []).map((l) => {
      const kg = typeof l.kg === 'number' && l.kg > 0 ? l.kg : null;
      const totalPaid = typeof l.total === 'number' && l.total > 0 ? Math.round(l.total * 100) : null;
      return {
        name: (l.name ?? '').trim(),
        kg, totalPaid,
        matchedSlug: l.name ? match(l.name) : null,
        unitPrice: kg && totalPaid ? Math.round(totalPaid / kg) : null,
      };
    }).filter((l) => l.name);

    return { lines, note: `${lines.length} kalem okundu. Eşleşmeleri kontrol edip onaylayın.` };
  }
}
