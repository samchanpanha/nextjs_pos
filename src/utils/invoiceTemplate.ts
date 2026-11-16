import type { StaffMember, TenantBusinessType } from '../types/pos';
import { canEditSettings, canManageOwnerGrants, type PermissionKey } from './permissions';

export type InvoiceTemplateStyle =
  | 'thermal_80mm'
  | 'compact_58mm'
  | 'modern_bilingual'
  | 'a4_tax_invoice';

export type InvoiceAccentColor = 'emerald' | 'slate' | 'amber' | 'crimson';

export type InvoiceQrFooterMode = 'loyalty_ebill' | 'bakong_khqr' | 'none';

export type CompanyLogoIcon =
  | 'monogram'
  | 'store'
  | 'coffee'
  | 'utensils'
  | 'sparkles'
  | 'shopping_bag'
  | 'scissors'
  | 'building';

export const COMPANY_LOGO_ICONS: { id: CompanyLogoIcon; label: string }[] = [
  { id: 'monogram', label: 'Monogram' },
  { id: 'store', label: 'Storefront' },
  { id: 'coffee', label: 'Café / Cup' },
  { id: 'utensils', label: 'Dining' },
  { id: 'sparkles', label: 'Spa / Service' },
  { id: 'shopping_bag', label: 'Retail Bag' },
  { id: 'scissors', label: 'Salon' },
  { id: 'building', label: 'Corporate' },
];

export const MAX_COMPANY_LOGO_URL_LENGTH = 45000;

export interface InvoiceTemplateConfig {
  style: InvoiceTemplateStyle;
  accentColor: InvoiceAccentColor;
  headerTitle: string;
  invoicePrefix: string;
  showLogoBadge: boolean;
  logoText: string;
  logoIcon: CompanyLogoIcon;
  logoImageUrl: string;
  showAddress: boolean;
  showPhone: boolean;
  showVattin: boolean;
  showCashier: boolean;
  showKhmerItemNames: boolean;
  showItemNotes: boolean;
  showVatBreakdown: boolean;
  showExchangeRate: boolean;
  qrFooterMode: InvoiceQrFooterMode;
  footerNote: string;
  buyerSignatureLabel: string;
  sellerSignatureLabel: string;
}

export const INVOICE_TEMPLATE_STYLES: {
  id: InvoiceTemplateStyle;
  name: string;
  paperLabel: string;
  description: string;
}[] = [
  {
    id: 'thermal_80mm',
    name: 'Thermal 80mm',
    paperLabel: '80mm Roll',
    description: 'Classic Cambodia POS receipt with monospace totals and dashed dividers.',
  },
  {
    id: 'compact_58mm',
    name: 'Compact 58mm',
    paperLabel: '58mm Roll',
    description: 'Space-saving counter ticket for quick takeaway and beverage stalls.',
  },
  {
    id: 'modern_bilingual',
    name: 'Modern Bilingual',
    paperLabel: '80mm / PDF',
    description: 'Clean accented header band with crisp Khmer + English line items.',
  },
  {
    id: 'a4_tax_invoice',
    name: 'A4 Tax Invoice',
    paperLabel: 'A4 Sheet',
    description: 'Formal GDT-style invoice layout with itemized table and signature blocks.',
  },
];

export const INVOICE_ACCENT_STYLES: Record<
  InvoiceAccentColor,
  { label: string; headerBg: string; headerText: string; border: string; badgeBg: string }
> = {
  emerald: {
    label: 'Emerald',
    headerBg: 'bg-[#08382D]',
    headerText: 'text-white',
    border: 'border-emerald-700',
    badgeBg: 'bg-emerald-50 text-emerald-900',
  },
  slate: {
    label: 'Charcoal',
    headerBg: 'bg-slate-900',
    headerText: 'text-white',
    border: 'border-slate-700',
    badgeBg: 'bg-slate-100 text-slate-900',
  },
  amber: {
    label: 'Gold',
    headerBg: 'bg-amber-700',
    headerText: 'text-white',
    border: 'border-amber-600',
    badgeBg: 'bg-amber-50 text-amber-950',
  },
  crimson: {
    label: 'Bakong Red',
    headerBg: 'bg-[#B91C1C]',
    headerText: 'text-white',
    border: 'border-red-700',
    badgeBg: 'bg-red-50 text-red-900',
  },
};

function sanitizeLogoImageUrl(raw: unknown): string {
  if (typeof raw !== 'string') return '';
  const trimmed = raw.trim();
  if (!trimmed || trimmed.length > MAX_COMPANY_LOGO_URL_LENGTH) return '';
  if (
    trimmed.startsWith('data:image/') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('http://') ||
    trimmed.startsWith('/')
  ) {
    return trimmed;
  }
  return '';
}

export function createDefaultInvoiceTemplate(params?: {
  shopName?: string;
  branchCode?: string;
  businessType?: TenantBusinessType;
}): InvoiceTemplateConfig {
  const cleanCode = (params?.branchCode || 'INV')
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 12) || 'INV';
  const initials = (params?.shopName || 'XW')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || 'XW';

  const defaultStyle: InvoiceTemplateStyle =
    params?.businessType === 'services' || params?.businessType === 'retail'
      ? 'modern_bilingual'
      : 'thermal_80mm';

  const defaultLogoIcon: CompanyLogoIcon =
    params?.businessType === 'cafe'
      ? 'coffee'
      : params?.businessType === 'services'
        ? 'sparkles'
        : params?.businessType === 'retail'
          ? 'shopping_bag'
          : 'monogram';

  return {
    style: defaultStyle,
    accentColor: 'emerald',
    headerTitle:
      params?.businessType === 'services'
        ? 'SERVICE INVOICE / វិក្កយបត្រសេវាកម្ម'
        : 'OFFICIAL RECEIPT / វិក្កយបត្រ',
    invoicePrefix: cleanCode,
    showLogoBadge: true,
    logoText: initials,
    logoIcon: defaultLogoIcon,
    logoImageUrl: '',
    showAddress: true,
    showPhone: true,
    showVattin: true,
    showCashier: true,
    showKhmerItemNames: true,
    showItemNotes: true,
    showVatBreakdown: true,
    showExchangeRate: true,
    qrFooterMode: 'loyalty_ebill',
    footerNote: 'Thank you for visiting! សូមអរគុណ! · Powered by XAIWork POS',
    buyerSignatureLabel: 'Customer / អតិថិជន',
    sellerSignatureLabel: 'Cashier / អ្នកគិតលុយ',
  };
}

export function normalizeInvoiceTemplate(
  raw: Partial<InvoiceTemplateConfig> | undefined,
  defaults?: { shopName?: string; branchCode?: string; businessType?: TenantBusinessType }
): InvoiceTemplateConfig {
  const base = createDefaultInvoiceTemplate(defaults);
  if (!raw || typeof raw !== 'object') return base;

  const validStyle: InvoiceTemplateStyle =
    raw.style === 'thermal_80mm' ||
    raw.style === 'compact_58mm' ||
    raw.style === 'modern_bilingual' ||
    raw.style === 'a4_tax_invoice'
      ? raw.style
      : base.style;

  const validAccent: InvoiceAccentColor =
    raw.accentColor === 'emerald' ||
    raw.accentColor === 'slate' ||
    raw.accentColor === 'amber' ||
    raw.accentColor === 'crimson'
      ? raw.accentColor
      : base.accentColor;

  const validQrMode: InvoiceQrFooterMode =
    raw.qrFooterMode === 'loyalty_ebill' ||
    raw.qrFooterMode === 'bakong_khqr' ||
    raw.qrFooterMode === 'none'
      ? raw.qrFooterMode
      : base.qrFooterMode;

  const validLogoIcon: CompanyLogoIcon =
    raw.logoIcon === 'monogram' ||
    raw.logoIcon === 'store' ||
    raw.logoIcon === 'coffee' ||
    raw.logoIcon === 'utensils' ||
    raw.logoIcon === 'sparkles' ||
    raw.logoIcon === 'shopping_bag' ||
    raw.logoIcon === 'scissors' ||
    raw.logoIcon === 'building'
      ? raw.logoIcon
      : base.logoIcon;

  const cleanPrefix =
    typeof raw.invoicePrefix === 'string' && raw.invoicePrefix.trim()
      ? raw.invoicePrefix.trim().toUpperCase().slice(0, 16)
      : base.invoicePrefix;

  return {
    style: validStyle,
    accentColor: validAccent,
    headerTitle:
      typeof raw.headerTitle === 'string' && raw.headerTitle.trim()
        ? raw.headerTitle.trim().slice(0, 80)
        : base.headerTitle,
    invoicePrefix: cleanPrefix,
    showLogoBadge: typeof raw.showLogoBadge === 'boolean' ? raw.showLogoBadge : base.showLogoBadge,
    logoText:
      typeof raw.logoText === 'string' && raw.logoText.trim()
        ? raw.logoText.trim().slice(0, 12)
        : base.logoText,
    logoIcon: validLogoIcon,
    logoImageUrl: sanitizeLogoImageUrl(raw.logoImageUrl),
    showAddress: typeof raw.showAddress === 'boolean' ? raw.showAddress : base.showAddress,
    showPhone: typeof raw.showPhone === 'boolean' ? raw.showPhone : base.showPhone,
    showVattin: typeof raw.showVattin === 'boolean' ? raw.showVattin : base.showVattin,
    showCashier: typeof raw.showCashier === 'boolean' ? raw.showCashier : base.showCashier,
    showKhmerItemNames:
      typeof raw.showKhmerItemNames === 'boolean'
        ? raw.showKhmerItemNames
        : base.showKhmerItemNames,
    showItemNotes: typeof raw.showItemNotes === 'boolean' ? raw.showItemNotes : base.showItemNotes,
    showVatBreakdown:
      typeof raw.showVatBreakdown === 'boolean' ? raw.showVatBreakdown : base.showVatBreakdown,
    showExchangeRate:
      typeof raw.showExchangeRate === 'boolean' ? raw.showExchangeRate : base.showExchangeRate,
    qrFooterMode: validQrMode,
    footerNote:
      typeof raw.footerNote === 'string'
        ? raw.footerNote.slice(0, 180)
        : base.footerNote,
    buyerSignatureLabel:
      typeof raw.buyerSignatureLabel === 'string' && raw.buyerSignatureLabel.trim()
        ? raw.buyerSignatureLabel.trim().slice(0, 48)
        : base.buyerSignatureLabel,
    sellerSignatureLabel:
      typeof raw.sellerSignatureLabel === 'string' && raw.sellerSignatureLabel.trim()
        ? raw.sellerSignatureLabel.trim().slice(0, 48)
        : base.sellerSignatureLabel,
  };
}

export function formatInvoiceNumber(prefix: string | undefined, orderNumber: number): string {
  const cleanPrefix = (prefix || 'INV').trim().toUpperCase() || 'INV';
  const padded = String(Math.max(1, Math.round(orderNumber))).padStart(5, '0');
  return `${cleanPrefix}-${padded}`;
}

export function canEditTenantBranchSettings(
  actor: StaffMember | undefined,
  targetTenantId: string,
  activeTenantId: string,
  ownerPermissions?: PermissionKey[]
): boolean {
  if (!actor || !actor.active) return false;
  if (canManageOwnerGrants(actor)) return true;
  if (targetTenantId !== activeTenantId) return false;
  return canEditSettings(actor, ownerPermissions);
}
