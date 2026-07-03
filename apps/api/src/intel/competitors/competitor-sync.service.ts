import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { MarketFiyatiService } from './market-fiyati.service';
import { ManavService } from './manav.service';

/**
 * Otomatik rakip fiyat senkronizasyonu — tüm sunucu-taraflı (tarayıcısız)
 * kaynakları günlük çeker: marketfiyati.org.tr (6 zincir) + online manav
 * adaptörleri (SSR). Rakip fiyatları gün boyu erişilebilir olduğundan sabah
 * 10:00'da (İBB penceresinden bağımsız) çalışır. Aynı mantık manuel tetiklenebilir.
 */
@Injectable()
export class CompetitorSyncService {
  private readonly logger = new Logger(CompetitorSyncService.name);
  constructor(
    private readonly marketFiyati: MarketFiyatiService,
    private readonly manav: ManavService,
  ) {}

  @Cron('0 10 * * *', { timeZone: 'Europe/Istanbul' })
  async daily() {
    const r = await this.runAll();
    this.logger.log(`Günlük rakip sync: marketfiyati ${r.marketfiyati.recorded} kayıt, manav ${r.manav.reduce((s, m) => s + m.recorded, 0)} kayıt.`);
  }

  /** marketfiyati toplu + tüm manav siteleri. Bir kaynak hata verirse diğerleri sürer. */
  async runAll() {
    let marketfiyati = { withData: 0, recorded: 0 };
    try {
      const r = await this.marketFiyati.bulkImport();
      marketfiyati = { withData: r.withData, recorded: r.recorded };
    } catch (e) {
      this.logger.warn(`marketfiyati atlandı: ${(e as Error).message}`);
    }

    const manav: { site: string; recorded: number }[] = [];
    for (const s of this.manav.sites()) {
      try {
        const r = await this.manav.importSite(s.key);
        manav.push({ site: s.key, recorded: r.recorded });
      } catch (e) {
        this.logger.warn(`manav ${s.key} atlandı: ${(e as Error).message}`);
        manav.push({ site: s.key, recorded: 0 });
      }
    }
    return { marketfiyati, manav };
  }
}
