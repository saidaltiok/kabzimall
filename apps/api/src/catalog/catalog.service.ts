import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { priceForMargin, DEFAULT_FLOOR_MARGIN } from '../pricing-engine';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { CreateCategoryDto, CreateProductDto, UpdateProductDto } from './dto/product.dto';
import { CreateBasketDto } from './dto/basket.dto';
import { CostComponentsService } from '../intel/cost-components/cost-components.service';
import { PricingRulesService } from '../intel/pricing-rules/pricing-rules.service';

const tl = (k: number) => (k / 100).toLocaleString('tr-TR', { minimumFractionDigits: 2 }) + ' ₺';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly costs: CostComponentsService,
    private readonly rules: PricingRulesService,
  ) {}

  /**
   * Fiyat güvenlik ağı (katalog kapısı): maliyet verisi varsa, elle yazılan satış
   * fiyatı (indirimli dâhil) taban marjın altına inemez — zararına satış yalnızca
   * Fiyat Öneri Motoru'ndaki bilinçli fırsat akışıyla yapılabilir. Maliyet/hal
   * verisi yoksa kontrol atlanır (doğrulanamaz — publishPopular ile aynı politika).
   */
  private async assertNotBelowFloor(opts: {
    slug: string;
    parts?: { slug: string; qty: number }[];
    basePrice?: number | null;
    discountedPrice?: number | null;
  }) {
    const prices = [opts.basePrice, opts.discountedPrice].filter((p): p is number => p != null && p > 0);
    if (prices.length === 0) return;
    const cost = opts.parts
      ? await this.costs.basketPartsCost(opts.parts).catch(() => null)
      : await this.costs.costForProduct(opts.slug).catch(() => null);
    if (!cost?.breakdown || cost.directCost == null) return;
    const rule = await this.rules.resolveEffective(opts.slug).catch(() => null);
    const floor = Math.round(priceForMargin(cost.breakdown, rule?.floorMargin ?? DEFAULT_FLOOR_MARGIN));
    const lowest = Math.min(...prices);
    if (lowest < floor) {
      throw new BadRequestException(
        `Fiyat güvenli tabanın altında: ${tl(lowest)} < taban ${tl(floor)} (maliyet ${tl(cost.directCost)}). ` +
        `Zararına satış bilinçli bir kararsa Fiyat Öneri Motoru'ndan fırsat ürünü olarak fiyatlayın.`,
      );
    }
  }

  /* ---------------------------- Kategoriler --------------------------- */

  listCategories() {
    return this.prisma.category.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });
  }

  async createCategory(dto: CreateCategoryDto) {
    try {
      return await this.prisma.category.create({
        data: { tenantId: DEV_TENANT_ID, slug: dto.slug, name: dto.name, sortOrder: dto.sortOrder ?? 0 },
      });
    } catch (e) {
      throw this.mapDbError(e, 'Kategori');
    }
  }

  /* ------------------------------ Ürünler ----------------------------- */

  async listProducts(opts: { search?: string; categoryId?: string; active?: string }) {
    const where: Prisma.ProductWhereInput = { tenantId: DEV_TENANT_ID };
    if (opts.search) where.OR = [
      { name: { contains: opts.search, mode: 'insensitive' } },
      { slug: { contains: opts.search, mode: 'insensitive' } },
    ];
    if (opts.categoryId) where.categoryId = opts.categoryId;
    if (opts.active === 'true') where.isActive = true;
    if (opts.active === 'false') where.isActive = false;

    const rows = await this.prisma.product.findMany({
      where,
      orderBy: { name: 'asc' },
      include: { category: { select: { id: true, name: true } } },
    });
    return rows.map((r) => this.toResponse(r));
  }

  async findOne(id: string) {
    const row = await this.prisma.product
      .findFirst({ where: { id, tenantId: DEV_TENANT_ID }, include: { category: { select: { id: true, name: true } } } })
      .catch(() => null);
    if (!row) throw new NotFoundException(`Ürün bulunamadı: ${id}`);
    return this.toResponse(row);
  }

  async createProduct(dto: CreateProductDto) {
    await this.assertCategory(dto.categoryId);
    await this.assertNotBelowFloor({ slug: dto.slug, basePrice: dto.basePrice, discountedPrice: dto.discountedPrice });
    try {
      const row = await this.prisma.product.create({
        data: {
          tenantId: DEV_TENANT_ID,
          slug: dto.slug,
          name: dto.name,
          categoryId: dto.categoryId ?? null,
          saleType: dto.saleType,
          unitLabel: dto.unitLabel ?? null,
          imageUrl: dto.imageUrl ?? null,
          description: dto.description ?? null,
          basePrice: dto.basePrice ?? null,
          discountedPrice: dto.discountedPrice ?? null,
          stockQty: dto.stockQty ?? null,
          maxPerOrder: dto.maxPerOrder ?? null,
          originRegion: dto.originRegion ?? null,
          isActive: dto.isActive ?? true,
          isFeatured: dto.isFeatured ?? false,
          isFreshDaily: dto.isFreshDaily ?? false,
          isLocal: dto.isLocal ?? false,
        },
        include: { category: { select: { id: true, name: true } } },
      });
      return this.toResponse(row);
    } catch (e) {
      throw this.mapDbError(e, 'Ürün');
    }
  }

  async updateProduct(id: string, dto: UpdateProductDto, actor?: string) {
    const current = await this.findOne(id); // 404 kontrolü
    if (dto.categoryId !== undefined) await this.assertCategory(dto.categoryId);
    // Fiyata dokunuluyorsa taban kontrolü (dokunulmayan taraf mevcut değeriyle birleştirilir).
    if (dto.basePrice !== undefined || dto.discountedPrice !== undefined) {
      await this.assertNotBelowFloor({
        slug: current.slug,
        basePrice: dto.basePrice !== undefined ? dto.basePrice : current.basePrice,
        discountedPrice: dto.discountedPrice !== undefined ? dto.discountedPrice : current.discountedPrice,
      });
    }
    const row = await this.prisma.product.update({
      where: { id },
      data: { ...dto },
      include: { category: { select: { id: true, name: true } } },
    });
    // Elle stok değişimi hareket defterine (fark ≠ 0 ise) — takip yeni açılıyorsa eski değer 0 sayılır.
    if (dto.stockQty !== undefined && dto.stockQty !== current.stockQty) {
      const delta = (dto.stockQty ?? 0) - (current.stockQty ?? 0);
      if (delta !== 0) {
        await this.prisma.stockMovement
          .create({ data: { tenantId: DEV_TENANT_ID, productId: id, delta, reason: 'MANUAL', actor: actor ?? null } })
          .catch(() => {});
      }
    }
    return this.toResponse(row);
  }

  /* --------------------- Excel (CSV) toplu düzenleme --------------------- */

  /**
   * Tüm ürünleri Türkçe Excel'in doğrudan açtığı CSV'ye döker:
   * UTF-8 BOM + noktalı virgül ayraç + virgül ondalık. slug ANAHTARDIR
   * (değiştirme); kategori/birim bilgi amaçlıdır (içe almada yok sayılır).
   */
  async exportCsv() {
    const rows = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID },
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
      include: { category: { select: { name: true } } },
    });
    const esc = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
    const money = (k: number | null) => (k == null ? '' : (k / 100).toFixed(2).replace('.', ','));
    const qty = (q: number | null) => (q == null ? '' : String(q).replace('.', ','));
    const lines = [
      'slug;ad;kategori;birim;fiyat;indirimli;stok;aktif',
      ...rows.map((p) =>
        [
          p.slug, esc(p.name), esc(p.category?.name ?? ''), p.unitLabel ?? '',
          money(p.basePrice), money(p.discountedPrice), qty(p.stockQty), p.isActive ? 'EVET' : 'HAYIR',
        ].join(';'),
      ),
    ];
    return '﻿' + lines.join('\r\n') + '\r\n'; // BOM: TR Excel'in UTF-8'i doğru açması için
  }

  /** TR para metni → kuruş ("1.234,50" → 123450; "12.50" → 1250). Boş → null. */
  private static parseTl(s: string): number | null | 'invalid' {
    const t = (s ?? '').trim().replace(/[\s₺]/g, '');
    if (!t) return null;
    let norm: string;
    if (t.includes(',')) norm = t.replace(/\./g, '').replace(',', '.');
    else {
      const p = t.split('.');
      norm = p.length > 2 || (p.length === 2 && p[1].length === 3) ? p.join('') : t;
    }
    const n = Number(norm);
    if (!Number.isFinite(n) || n < 0) return 'invalid';
    return Math.round(n * 100);
  }

  /** Miktar metni → sayı ("12,5" → 12.5). Boş → null (takip yok). */
  private static parseQty(s: string): number | null | 'invalid' {
    const t = (s ?? '').trim();
    if (!t) return null;
    const n = Number(t.replace(/\./g, (m, i, str) => (str.includes(',') ? '' : m)).replace(',', '.'));
    if (!Number.isFinite(n) || n < 0) return 'invalid';
    return n;
  }

  /** Noktalı virgül ayraçlı, tırnak destekli tek satır ayrıştırma. */
  private static splitCsvLine(line: string): string[] {
    const out: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const c = line[i];
      if (inQ) {
        if (c === '"' && line[i + 1] === '"') { cur += '"'; i++; }
        else if (c === '"') inQ = false;
        else cur += c;
      } else if (c === '"') inQ = true;
      else if (c === ';') { out.push(cur); cur = ''; }
      else cur += c;
    }
    out.push(cur);
    return out;
  }

  /**
   * CSV içe alma. apply=false → yalnız ÖNİZLEME (hiçbir şey yazılmaz):
   * satır satır değişiklik/uyarı/hata listesi. apply=true → yalnız hatasız
   * satırlar uygulanır; fiyatı taban altına çeken satır aynı güvenlik ağıyla
   * (assertNotBelowFloor) REDDEDİLİR — zararına satış motorun fırsat akışında.
   * Fiyat değişimi PriceHistory'ye, stok değişimi StockMovement'a iz bırakır.
   */
  async importCsv(csv: string, apply: boolean, actor?: string) {
    const text = (csv ?? '').replace(/^﻿/, '');
    const lines = text.split(/\r?\n/).filter((l) => l.trim() !== '');
    if (lines.length < 2) throw new BadRequestException('CSV boş — başlık + en az bir ürün satırı gerekli.');
    const header = CatalogService.splitCsvLine(lines[0]).map((h) => h.trim().toLocaleLowerCase('tr'));
    const expected = ['slug', 'ad', 'kategori', 'birim', 'fiyat', 'indirimli', 'stok', 'aktif'];
    if (expected.some((c) => !header.includes(c))) {
      throw new BadRequestException(`CSV başlığı eksik/bozuk. Beklenen sütunlar: ${expected.join(';')} — dosyayı "Excel'e aktar" çıktısından türetin.`);
    }
    const col = (cells: string[], name: string) => cells[header.indexOf(name)] ?? '';

    const products = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID },
      include: { components: { select: { qty: true, component: { select: { slug: true } } } } },
    });
    const bySlug = new Map(products.map((p) => [p.slug, p]));

    interface RowResult { slug: string; name: string; changes: { alan: string; eski: string; yeni: string }[]; errors: string[]; warnings: string[] }
    const results: RowResult[] = [];
    const money = (k: number | null) => (k == null ? '(boş)' : (k / 100).toFixed(2).replace('.', ',') + ' ₺');
    const seen = new Set<string>();

    for (const line of lines.slice(1)) {
      const cells = CatalogService.splitCsvLine(line);
      const slug = col(cells, 'slug').trim();
      const r: RowResult = { slug, name: col(cells, 'ad').trim(), changes: [], errors: [], warnings: [] };
      results.push(r);
      const p = bySlug.get(slug);
      if (!slug) { r.errors.push('slug boş'); continue; }
      if (seen.has(slug)) { r.errors.push('slug dosyada birden çok kez geçiyor'); continue; }
      seen.add(slug);
      if (!p) { r.errors.push('ürün bulunamadı (slug anahtardır, değiştirilemez — yeni ürün panelden eklenir)'); continue; }

      const name = r.name;
      const base = CatalogService.parseTl(col(cells, 'fiyat'));
      const disc = CatalogService.parseTl(col(cells, 'indirimli'));
      const stock = CatalogService.parseQty(col(cells, 'stok'));
      const aktifT = col(cells, 'aktif').trim().toLocaleLowerCase('tr');
      const aktif = ['evet', 'e', 'true', '1'].includes(aktifT) ? true : ['hayır', 'hayir', 'h', 'false', '0'].includes(aktifT) ? false : 'invalid';

      if (base === 'invalid') r.errors.push(`fiyat okunamadı: "${col(cells, 'fiyat')}"`);
      // Fiyat boşaltmak Excel'de tipik kaza (sütun silme) — toplu felaketi kes; kaldırma panelden.
      if (base === null && p.basePrice != null) r.errors.push('fiyat boş olamaz — fiyatı kaldırmak istiyorsan ürünü panelden düzenle');
      if (disc === 'invalid') r.errors.push(`indirimli okunamadı: "${col(cells, 'indirimli')}"`);
      if (stock === 'invalid') r.errors.push(`stok okunamadı: "${col(cells, 'stok')}"`);
      if (aktif === 'invalid') r.errors.push(`aktif EVET/HAYIR olmalı: "${col(cells, 'aktif')}"`);
      if (!name) r.errors.push('ad boş olamaz');
      if (r.errors.length) continue;

      const upd: { name?: string; basePrice?: number | null; discountedPrice?: number | null; stockQty?: number | null; isActive?: boolean } = {};
      if (name !== p.name) { upd.name = name; r.changes.push({ alan: 'ad', eski: p.name, yeni: name }); }
      if ((base as number | null) !== p.basePrice) { upd.basePrice = base as number | null; r.changes.push({ alan: 'fiyat', eski: money(p.basePrice), yeni: money(base as number | null) }); }
      if ((disc as number | null) !== p.discountedPrice) { upd.discountedPrice = disc as number | null; r.changes.push({ alan: 'indirimli', eski: money(p.discountedPrice), yeni: money(disc as number | null) }); }
      if ((stock as number | null) !== p.stockQty) { upd.stockQty = stock as number | null; r.changes.push({ alan: 'stok', eski: p.stockQty == null ? '(takip yok)' : String(p.stockQty), yeni: stock == null ? '(takip yok)' : String(stock) }); }
      if ((aktif as boolean) !== p.isActive) { upd.isActive = aktif as boolean; r.changes.push({ alan: 'aktif', eski: p.isActive ? 'EVET' : 'HAYIR', yeni: aktif ? 'EVET' : 'HAYIR' }); }
      if (!r.changes.length) continue;

      const newBase = upd.basePrice !== undefined ? upd.basePrice : p.basePrice;
      const newDisc = upd.discountedPrice !== undefined ? upd.discountedPrice : p.discountedPrice;
      if (newDisc != null && newBase != null && newDisc >= newBase) {
        r.warnings.push('indirimli fiyat, fiyatın altında değil — vitrinde etkisiz kalır');
      }
      // Maliyet güvenlik ağı: fiyata dokunuluyorsa mevcut katalog kapısından geçmeli.
      if (upd.basePrice !== undefined || upd.discountedPrice !== undefined) {
        try {
          await this.assertNotBelowFloor({
            slug,
            parts: p.kind === 'BASKET' ? p.components.map((c) => ({ slug: c.component.slug, qty: c.qty })) : undefined,
            basePrice: newBase,
            discountedPrice: newDisc,
          });
        } catch (e) {
          r.errors.push((e as Error & { response?: { message?: string } }).response?.message ?? (e as Error).message);
          continue;
        }
      }

      if (apply) {
        await this.prisma.$transaction(async (tx) => {
          // Taze oku: bu sırada başka akış (motor/panel/sipariş) dokunmuş olabilir —
          // PriceHistory.oldPrice ve stok deltası GERÇEK mevcut değere göre yazılır.
          const fresh = await tx.product.findUniqueOrThrow({ where: { id: p.id }, select: { basePrice: true, stockQty: true } });
          await tx.product.update({ where: { id: p.id }, data: upd });
          if (upd.basePrice !== undefined && upd.basePrice != null && upd.basePrice !== fresh.basePrice) {
            await tx.priceHistory.create({
              data: {
                tenantId: DEV_TENANT_ID, productId: p.id, oldPrice: fresh.basePrice, newPrice: upd.basePrice,
                strategyApplied: 'TOPLU_EXCEL', reason: 'Excel içe aktarma', changedBy: actor ?? null,
              },
            });
          }
          if (upd.stockQty !== undefined) {
            const delta = (upd.stockQty ?? 0) - (fresh.stockQty ?? 0);
            if (delta !== 0) {
              await tx.stockMovement.create({
                data: { tenantId: DEV_TENANT_ID, productId: p.id, delta, reason: 'MANUAL', refCode: 'EXCEL', actor: actor ?? null },
              });
            }
          }
        });
      }
    }

    const changed = results.filter((r) => r.changes.length && !r.errors.length);
    const errored = results.filter((r) => r.errors.length);
    // Önizleme yalnız aksiyon gereken satırları gösterir (sade ekran); hatalar önde,
    // devasa dosyada ilk 200 satırla sınırlanır (özet sayılar her zaman tam).
    const actionable = [
      ...results.filter((r) => r.errors.length),
      ...results.filter((r) => !r.errors.length && (r.changes.length || r.warnings.length)),
    ];
    return {
      applied: apply,
      summary: {
        satir: results.length,
        degisen: changed.length,
        hatali: errored.length,
        degismeyen: results.length - changed.length - errored.length,
      },
      rows: actionable.slice(0, 200),
      rowsTruncated: actionable.length > 200,
    };
  }

  /**
   * İkame listesi ata (tümünü değiştirir, sıra = dizideki yer). Kendisi ve
   * bilinmeyen slug reddedilir; en fazla 5 ikame.
   */
  async setSubstitutes(id: string, slugs: string[]) {
    const current = await this.findOne(id);
    const clean = [...new Set((slugs ?? []).map((s) => s?.trim()).filter(Boolean))].slice(0, 5);
    if (clean.includes(current.slug)) throw new BadRequestException('Ürün kendisinin ikamesi olamaz.');
    const subs = await this.prisma.product.findMany({ where: { tenantId: DEV_TENANT_ID, slug: { in: clean } }, select: { id: true, slug: true } });
    const bySlug = new Map(subs.map((p) => [p.slug, p.id]));
    const missing = clean.filter((s) => !bySlug.has(s));
    if (missing.length) throw new BadRequestException(`Ürün bulunamadı: ${missing.join(', ')}`);
    await this.prisma.$transaction([
      this.prisma.productSubstitute.deleteMany({ where: { productId: id } }),
      this.prisma.productSubstitute.createMany({
        data: clean.map((s, i) => ({ tenantId: DEV_TENANT_ID, productId: id, substituteId: bySlug.get(s)!, sortOrder: i })),
      }),
    ]);
    return this.getSubstitutes(id);
  }

  /** Ürünün ikameleri (sıralı, ad/stok/fiyatla). */
  async getSubstitutes(id: string) {
    const rows = await this.prisma.productSubstitute.findMany({
      where: { productId: id, tenantId: DEV_TENANT_ID },
      orderBy: { sortOrder: 'asc' },
      include: { substitute: { select: { slug: true, name: true, unitLabel: true, basePrice: true, discountedPrice: true, stockQty: true, imageUrl: true, isActive: true } } },
    });
    return rows.map((r) => r.substitute);
  }

  /** Stok hareket defteri: son N gün, istenirse tek ürün (slug) için. */
  async stockMovements(opts: { product?: string; days?: number; limit?: number }) {
    const days = Math.min(180, Math.max(1, opts.days ?? 30));
    const since = new Date(Date.now() - days * 86_400_000);
    const where: Prisma.StockMovementWhereInput = { tenantId: DEV_TENANT_ID, createdAt: { gte: since } };
    if (opts.product?.trim()) where.product = { slug: opts.product.trim() };
    const rows = await this.prisma.stockMovement.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(500, Math.max(1, opts.limit ?? 200)),
      include: { product: { select: { slug: true, name: true, unitLabel: true, stockQty: true } } },
    });
    return rows.map((m) => ({
      id: m.id,
      product: m.product,
      delta: m.delta,
      reason: m.reason,
      refCode: m.refCode,
      actor: m.actor,
      createdAt: m.createdAt,
    }));
  }

  /** Geçmişi olan ürün silinemez → pasifleştirme önerilir (409). */
  async removeProduct(id: string) {
    await this.findOne(id);
    try {
      await this.prisma.product.delete({ where: { id } });
      return { deleted: true };
    } catch {
      throw new ConflictException('Bu ürünün fiyat geçmişi var; silmek yerine pasifleştirin (isActive=false).');
    }
  }

  /* ---------------------------- Hazır sepetler ------------------------ */

  /** Hazır sepet = ayrı bir ürün (kind=BASKET) + içerik (component'ler). */
  async createBasket(dto: CreateBasketDto) {
    const slugs = [...new Set(dto.components.map((c) => c.productSlug))];
    const comps = await this.prisma.product.findMany({ where: { tenantId: DEV_TENANT_ID, slug: { in: slugs } } });
    const bySlug = new Map(comps.map((p) => [p.slug, p]));
    const components = dto.components.map((c) => {
      const p = bySlug.get(c.productSlug);
      if (!p) throw new BadRequestException(`Ürün bulunamadı: ${c.productSlug}`);
      return { componentId: p.id, qty: c.qty };
    });
    await this.assertNotBelowFloor({
      slug: dto.slug,
      parts: dto.components.map((c) => ({ slug: c.productSlug, qty: c.qty })),
      basePrice: dto.basePrice,
      discountedPrice: dto.discountedPrice,
    });
    try {
      const row = await this.prisma.product.create({
        data: {
          tenantId: DEV_TENANT_ID,
          kind: 'BASKET',
          slug: dto.slug,
          name: dto.name,
          saleType: 'PACK',
          unitLabel: 'paket',
          basePrice: dto.basePrice,
          discountedPrice: dto.discountedPrice ?? null,
          stockQty: dto.stockQty ?? null,
          imageUrl: dto.imageUrl ?? null,
          components: { create: components },
        },
        include: this.basketInclude,
      });
      return this.toBasket(row);
    } catch (e) {
      throw this.mapDbError(e, 'Sepet');
    }
  }

  async listBaskets() {
    const rows = await this.prisma.product.findMany({
      where: { tenantId: DEV_TENANT_ID, kind: 'BASKET' },
      orderBy: { name: 'asc' },
      include: this.basketInclude,
    });
    return rows.map((r) => this.toBasket(r));
  }

  /** Sepet silme = ürün silme (geçmişi varsa 409; pasifleştir). */
  removeBasket(id: string) {
    return this.removeProduct(id);
  }

  private readonly basketInclude = {
    components: { include: { component: { select: { slug: true, name: true, unitLabel: true } } } },
  } as const;

  private toBasket(r: {
    id: string; slug: string; name: string; basePrice: number | null; discountedPrice: number | null;
    stockQty: number | null; imageUrl: string | null; isActive: boolean;
    components: { qty: number; component: { slug: string; name: string; unitLabel: string | null } }[];
  }) {
    return {
      id: r.id, slug: r.slug, name: r.name,
      basePrice: r.basePrice, discountedPrice: r.discountedPrice, stockQty: r.stockQty,
      imageUrl: r.imageUrl, isActive: r.isActive,
      components: r.components.map((c) => ({ slug: c.component.slug, name: c.component.name, unitLabel: c.component.unitLabel, qty: c.qty })),
    };
  }

  /* ------------------------------ Yardımcı ---------------------------- */

  private async assertCategory(categoryId?: string) {
    if (!categoryId) return;
    const cat = await this.prisma.category
      .findFirst({ where: { id: categoryId, tenantId: DEV_TENANT_ID } })
      .catch(() => null);
    if (!cat) throw new BadRequestException(`Kategori bulunamadı: ${categoryId}`);
  }

  private mapDbError(e: unknown, label: string): Error {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return new ConflictException(`${label} slug zaten kullanımda`);
    }
    return e as Error;
  }

  private toResponse(r: {
    id: string; slug: string; name: string; kind: string; saleType: string; unitLabel: string | null;
    imageUrl: string | null; description: string | null; basePrice: number | null; discountedPrice: number | null;
    stockQty: number | null; maxPerOrder: number | null; originRegion: string | null;
    isActive: boolean; isFeatured: boolean; isFreshDaily: boolean; isLocal: boolean;
    categoryId: string | null; category: { id: string; name: string } | null; updatedAt: Date;
  }) {
    return {
      id: r.id, slug: r.slug, name: r.name, kind: r.kind, saleType: r.saleType, unitLabel: r.unitLabel,
      imageUrl: r.imageUrl, description: r.description, basePrice: r.basePrice, discountedPrice: r.discountedPrice,
      stockQty: r.stockQty, maxPerOrder: r.maxPerOrder, originRegion: r.originRegion,
      isActive: r.isActive, isFeatured: r.isFeatured, isFreshDaily: r.isFreshDaily, isLocal: r.isLocal,
      category: r.category, updatedAt: r.updatedAt.toISOString(),
    };
  }
}
