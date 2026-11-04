import { i18n } from '../i18n';

const locale = () => (i18n.language === 'en' ? 'en-SN' : 'fr-SN');

export function num(v: number | null | undefined, digits = 0): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: digits, minimumFractionDigits: 0 }).format(v);
}

export function money(v: number | null | undefined, currency = 'XOF'): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat(locale(), { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
}

export function pct(v: number | null | undefined, digits = 1): string {
  if (v === null || v === undefined || Number.isNaN(v)) return '–';
  return new Intl.NumberFormat(locale(), { style: 'percent', maximumFractionDigits: digits }).format(v);
}

export const m2 = (v: number | null | undefined) => `${num(v)} m²`;
export const storeys = (n: number) => (n <= 1 ? 'RDC' : `R+${n - 1}`);
