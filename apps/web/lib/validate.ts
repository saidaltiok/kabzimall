// Vitrin form doğrulaması — backend DTO'suyla (create-order.dto) AYNI kurallar,
// böylece kullanıcı sunucuya gitmeden anında geri bildirim alır.

/** TR cep telefonu: boşluk/tire toleranslı, +90/0 önekli ya da öneksiz, 5 ile başlayan 10 hane. */
export const TR_PHONE = /^(\+?90[\s-]?|0)?5\d{2}[\s-]?\d{3}[\s-]?\d{2}[\s-]?\d{2}$/;
/** İsim: en az bir harf, harf/boşluk/kesme/tire/nokta; rakam/sembol yığını olamaz. */
export const PERSON_NAME = /^(?=.*\p{L})[\p{L}\s'.-]{2,}$/u;

export const isName = (v: string) => PERSON_NAME.test(v.trim());
export const isPhone = (v: string) => TR_PHONE.test(v.trim());
export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());

/** Telefon girişini rakam + ayraçlarla sınırla (harf/uygunsuz karakteri anında engelle). */
export const sanitizePhone = (v: string) => v.replace(/[^\d\s+()-]/g, '').slice(0, 24);

/** "05551234567" / "+90..." → "0555 555 55 55" görünümü (yalnızca 05XX 10 hane ise). */
export function formatPhone(v: string): string {
  const digits = v.replace(/\D/g, '').replace(/^90/, '').replace(/^0/, '');
  if (digits.length !== 10) return v; // henüz tamamlanmadı → dokunma
  return `0${digits.slice(0, 3)} ${digits.slice(3, 6)} ${digits.slice(6, 8)} ${digits.slice(8, 10)}`;
}
