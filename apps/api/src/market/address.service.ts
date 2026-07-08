import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { DEV_TENANT_ID } from '../common/tenant';
import { CreateAddressDto, UpdateAddressDto } from './dto/address.dto';

/**
 * "Adreslerim" — müşterinin kayıtlı teslimat adresleri. Kimlik e-posta bazlı
 * (OTP ile doğrulanır); her müşteri yalnız kendi adreslerini görür/yönetir.
 * Harita konumu zorunludur (DTO seviyesinde). E-posta başına en fazla 15 adres.
 */
@Injectable()
export class AddressService {
  private static readonly MAX_PER_EMAIL = 15;

  constructor(private readonly prisma: PrismaService) {}

  private norm(email: string) {
    return email.trim().toLocaleLowerCase('tr');
  }

  list(email: string) {
    return this.prisma.customerAddress.findMany({
      where: { tenantId: DEV_TENANT_ID, email: this.norm(email) },
      orderBy: [{ isDefault: 'desc' }, { updatedAt: 'desc' }],
    });
  }

  async create(email: string, dto: CreateAddressDto) {
    const owner = this.norm(email);
    const count = await this.prisma.customerAddress.count({ where: { tenantId: DEV_TENANT_ID, email: owner } });
    if (count >= AddressService.MAX_PER_EMAIL) {
      throw new BadRequestException(`En fazla ${AddressService.MAX_PER_EMAIL} adres kaydedebilirsiniz. Kullanmadığınız adresleri silin.`);
    }
    // İlk adres kendiliğinden varsayılan olsun.
    const makeDefault = dto.isDefault || count === 0;
    return this.prisma.$transaction(async (tx) => {
      if (makeDefault) {
        await tx.customerAddress.updateMany({ where: { tenantId: DEV_TENANT_ID, email: owner }, data: { isDefault: false } });
      }
      return tx.customerAddress.create({
        data: {
          tenantId: DEV_TENANT_ID, email: owner,
          label: dto.label.trim(), name: dto.name.trim(), phone: dto.phone.trim(),
          addressText: dto.addressText.trim(), district: dto.district?.trim() || null,
          lat: dto.lat, lng: dto.lng, isDefault: makeDefault,
        },
      });
    });
  }

  /** Sahiplik kontrollü getir (başka müşterinin adresi bulunamaz muamelesi görür). */
  private async owned(email: string, id: string) {
    const a = await this.prisma.customerAddress.findFirst({ where: { id, tenantId: DEV_TENANT_ID, email: this.norm(email) } }).catch(() => null);
    if (!a) throw new NotFoundException('Adres bulunamadı.');
    return a;
  }

  async update(email: string, id: string, dto: UpdateAddressDto) {
    const owner = this.norm(email);
    await this.owned(email, id);
    return this.prisma.$transaction(async (tx) => {
      if (dto.isDefault === true) {
        await tx.customerAddress.updateMany({ where: { tenantId: DEV_TENANT_ID, email: owner }, data: { isDefault: false } });
      }
      return tx.customerAddress.update({
        where: { id },
        data: {
          ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
          ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
          ...(dto.phone !== undefined ? { phone: dto.phone.trim() } : {}),
          ...(dto.addressText !== undefined ? { addressText: dto.addressText.trim() } : {}),
          ...(dto.district !== undefined ? { district: dto.district?.trim() || null } : {}),
          ...(dto.lat !== undefined ? { lat: dto.lat } : {}),
          ...(dto.lng !== undefined ? { lng: dto.lng } : {}),
          ...(dto.isDefault !== undefined ? { isDefault: dto.isDefault } : {}),
        },
      });
    });
  }

  async remove(email: string, id: string) {
    const owner = this.norm(email);
    const a = await this.owned(email, id);
    await this.prisma.customerAddress.delete({ where: { id } });
    // Varsayılan silindiyse en yeni adres varsayılan olsun (hiç boşta kalmasın).
    if (a.isDefault) {
      const next = await this.prisma.customerAddress.findFirst({ where: { tenantId: DEV_TENANT_ID, email: owner }, orderBy: { updatedAt: 'desc' } });
      if (next) await this.prisma.customerAddress.update({ where: { id: next.id }, data: { isDefault: true } });
    }
    return { deleted: true };
  }
}
