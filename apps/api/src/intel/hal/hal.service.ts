import { Injectable } from '@nestjs/common';
import { avg } from '../../pricing-engine';
import { PrismaService } from '../../prisma/prisma.service';
import { DEV_TENANT_ID } from '../../common/tenant';
import { CreateHalEntryDto } from './dto/create-hal-entry.dto';
import { BulkHalDto } from './dto/bulk-hal.dto';
import type { HalPriceEntry } from '@prisma/client';

export interface HalEntryResponse {
  id: string;
  productId: string;
  price: number;
  unit: string | null;
  date: string;
  timeSlot: string | null;
  source: string | null;
  capturedBy: string | null;
  capturedAt: string;
}

/** Bir ürünün belirli güne ait fiyatları + günlük ortalama. */
export interface HalGridRow {
  productId: string;
  count: number;
  /** Günlük ortalama (kuruş) — packages/pricing.avg ile, kuruşa yuvarlı. */
  dailyAverage: number;
  entries: HalEntryResponse[];
}

@Injectable()
export class HalService {
  constructor(private readonly prisma: PrismaService) {}

  async create(dto: CreateHalEntryDto): Promise<HalEntryResponse> {
    const row = await this.prisma.halPriceEntry.create({
      data: this.toData(dto),
    });
    return this.toResponse(row);
  }

  async bulk(dto: BulkHalDto): Promise<{ count: number; date: string | null }> {
    const result = await this.prisma.halPriceEntry.createMany({
      data: dto.entries.map((e) => this.toData(e, dto.date)),
    });
    return { count: result.count, date: dto.date ?? null };
  }

  /** Ürün × gün ızgarası: belirli gün (varsayılan bugün) için ürün başına ortalama. */
  async grid(dateStr?: string): Promise<{ date: string; data: HalGridRow[] }> {
    const date = this.dateOnly(dateStr);
    const rows = await this.prisma.halPriceEntry.findMany({
      where: { tenantId: DEV_TENANT_ID, date },
      orderBy: [{ productSlug: 'asc' }, { capturedAt: 'asc' }],
    });

    const byProduct = new Map<string, HalPriceEntry[]>();
    for (const r of rows) {
      const list = byProduct.get(r.productSlug) ?? [];
      list.push(r);
      byProduct.set(r.productSlug, list);
    }

    const data: HalGridRow[] = [...byProduct.entries()].map(([productId, entries]) => ({
      productId,
      count: entries.length,
      dailyAverage: Math.round(avg(entries.map((e) => e.price))),
      entries: entries.map((e) => this.toResponse(e)),
    }));

    return { date: date.toISOString().slice(0, 10), data };
  }

  private toData(dto: CreateHalEntryDto, fallbackDate?: string) {
    return {
      tenantId: DEV_TENANT_ID,
      productSlug: dto.productId,
      price: dto.price,
      unit: dto.unit ?? null,
      date: this.dateOnly(dto.date ?? fallbackDate),
      timeSlot: dto.timeSlot ?? null,
      source: dto.source ?? null,
      capturedBy: dto.capturedBy ?? null,
    };
  }

  /** YYYY-MM-DD (verilmezse bugün) → UTC gün başı; @db.Date kayması olmaz. */
  private dateOnly(s?: string): Date {
    const iso = s ?? new Date().toISOString().slice(0, 10);
    return new Date(`${iso}T00:00:00.000Z`);
  }

  private toResponse(row: HalPriceEntry): HalEntryResponse {
    return {
      id: row.id,
      productId: row.productSlug,
      price: row.price,
      unit: row.unit,
      date: row.date.toISOString().slice(0, 10),
      timeSlot: row.timeSlot,
      source: row.source,
      capturedBy: row.capturedBy,
      capturedAt: row.capturedAt.toISOString(),
    };
  }
}
