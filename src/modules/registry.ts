import type { NavSection } from '../types/pos';
import type { SubscriptionPlan } from '../utils/subscription';

export type ModuleGroupId =
  | 'operations'
  | 'catalog_crm'
  | 'finance_compliance'
  | 'saas_platform';

export interface SaasModuleDefinition {
  id: NavSection;
  group: ModuleGroupId;
  title: string;
  subtitle: string;
  simpleModeVisible: boolean;
  optionalFeatureKey?: string;
  coreModule: boolean;
  recommendedPlan: SubscriptionPlan;
  shortcutHint?: string;
  sqliteTables: string[];
  keywords: string[];
}

export const MODULE_GROUP_LABELS: Record<
  ModuleGroupId,
  { en: string; kh: string; vi: string }
> = {
  operations: {
    en: 'Operations',
    kh: 'ប្រតិបត្តិការលក់',
    vi: 'Bán hàng & Ca',
  },
  catalog_crm: {
    en: 'Catalog & CRM',
    kh: 'ទំនិញ និងអតិថិជន',
    vi: 'Thực đơn & Kho',
  },
  finance_compliance: {
    en: 'Finance & VAT',
    kh: 'ហិរញ្ញវត្ថុ និងពន្ធ',
    vi: 'Báo cáo & Thuế',
  },
  saas_platform: {
    en: 'SaaS & System',
    kh: 'ប្រព័ន្ធ និងសាខា',
    vi: 'Hệ thống SaaS',
  },
};

export const SAAS_MODULE_REGISTRY: SaasModuleDefinition[] = [
  {
    id: 'sell',
    group: 'operations',
    title: 'POS Terminal & Floor',
    subtitle: 'Tables, takeaway, dual USD/KHR checkout & Bakong KHQR',
    simpleModeVisible: true,
    coreModule: true,
    recommendedPlan: 'daily',
    shortcutHint: 'Alt+1',
    sqliteTables: ['orders', 'pos_tables', 'menu_items'],
    keywords: ['pos', 'sell', 'checkout', 'cart', 'tables', 'cashier', 'khqr', 'order'],
  },
  {
    id: 'kds',
    group: 'operations',
    title: 'Kitchen & Bar KDS',
    subtitle: 'Live ticket board with SLA timers & station routing',
    simpleModeVisible: false,
    optionalFeatureKey: 'kds',
    coreModule: false,
    recommendedPlan: 'daily',
    shortcutHint: 'Alt+2',
    sqliteTables: ['orders'],
    keywords: ['kitchen', 'bar', 'kds', 'cooking', 'tickets', 'chef'],
  },
  {
    id: 'todays_money',
    group: 'operations',
    title: "Today's Money",
    subtitle: 'Live shift takings, payment split & unpaid active bills',
    simpleModeVisible: true,
    coreModule: true,
    recommendedPlan: 'daily',
    shortcutHint: 'Alt+3',
    sqliteTables: ['orders', 'shifts'],
    keywords: ['money', 'cash', 'today', 'sales', 'takings', 'revenue'],
  },
  {
    id: 'bills',
    group: 'operations',
    title: 'Bills & Receipts',
    subtitle: 'Search open/settled orders, void bills & reprint receipts',
    simpleModeVisible: true,
    coreModule: true,
    recommendedPlan: 'daily',
    shortcutHint: 'Alt+4',
    sqliteTables: ['orders', 'vat_invoices'],
    keywords: ['bills', 'receipts', 'orders', 'history', 'print', 'reprint'],
  },
  {
    id: 'reservations',
    group: 'operations',
    title: 'Reservations & Deposits',
    subtitle: 'Table bookings, clash alerts, online /book link & deposits',
    simpleModeVisible: false,
    optionalFeatureKey: 'reservations',
    coreModule: false,
    recommendedPlan: 'standard',
    sqliteTables: ['reservations', 'pos_tables'],
    keywords: ['booking', 'reservations', 'tables', 'deposit', 'guests'],
  },
  {
    id: 'shift_drawer',
    group: 'operations',
    title: 'Shift & Cash Drawer',
    subtitle: 'USD/KHR float, petty cash, note counter & Z-report close',
    simpleModeVisible: false,
    optionalFeatureKey: 'shift_drawer',
    coreModule: false,
    recommendedPlan: 'standard',
    sqliteTables: ['shifts', 'audit_logs'],
    keywords: ['shift', 'drawer', 'float', 'petty cash', 'z-report', 'reconcile'],
  },
  {
    id: 'menu_prices',
    group: 'catalog_crm',
    title: 'Products, Services & Menu',
    subtitle: 'Trilingual catalog (EN/KH/VI), photos, modifiers & CSV/AI import',
    simpleModeVisible: false,
    coreModule: true,
    recommendedPlan: 'daily',
    sqliteTables: ['menu_items'],
    keywords: ['menu', 'dishes', 'products', 'services', 'prices', 'import', 'catalog'],
  },
  {
    id: 'stock',
    group: 'catalog_crm',
    title: 'Inventory & BOM Recipes',
    subtitle: 'Weighted-average stock, auto recipe deduction, waste & margins',
    simpleModeVisible: false,
    optionalFeatureKey: 'stock',
    coreModule: false,
    recommendedPlan: 'premium',
    sqliteTables: ['ingredients', 'recipes', 'stock_movements'],
    keywords: ['stock', 'inventory', 'ingredients', 'recipes', 'waste', 'margin', 'purchase'],
  },
  {
    id: 'purchase_orders',
    group: 'catalog_crm',
    title: 'Purchase Orders & Suppliers',
    subtitle: 'Auto-draft low-stock POs, partial GRN, moving-avg cost & vendor AP',
    simpleModeVisible: false,
    optionalFeatureKey: 'purchase_orders',
    coreModule: false,
    recommendedPlan: 'standard',
    sqliteTables: ['suppliers', 'purchase_orders', 'ingredients'],
    keywords: ['po', 'purchase order', 'procurement', 'suppliers', 'vendors', 'grn', 'restock', 'ap'],
  },
  {
    id: 'tables_areas',
    group: 'catalog_crm',
    title: 'Floor Plan & QR Tents',
    subtitle: 'Dining zones, seat capacities & printable self-order QR codes',
    simpleModeVisible: false,
    optionalFeatureKey: 'tables_areas',
    coreModule: false,
    recommendedPlan: 'daily',
    sqliteTables: ['pos_tables', 'qr_incoming_orders'],
    keywords: ['tables', 'floor', 'areas', 'qr', 'zones', 'seats'],
  },
  {
    id: 'promotion',
    group: 'catalog_crm',
    title: 'Promotions, Packs & Loyalty',
    subtitle: 'Auto promos, prepaid bundles, member tiers & Telegram campaigns',
    simpleModeVisible: false,
    optionalFeatureKey: 'promotion',
    coreModule: false,
    recommendedPlan: 'premium',
    sqliteTables: ['promotions_loyalty'],
    keywords: ['promo', 'discount', 'loyalty', 'members', 'points', 'packs', 'telegram'],
  },
  {
    id: 'accounting',
    group: 'finance_compliance',
    title: 'Accounting & Financial Reports',
    subtitle: 'Double-entry ledger, P&L, Balance Sheet, Cash Flow, Trial Balance & GDT Tax',
    simpleModeVisible: false,
    optionalFeatureKey: 'accounting',
    coreModule: false,
    recommendedPlan: 'standard',
    sqliteTables: ['chart_of_accounts', 'journal_entries', 'operating_expenses'],
    keywords: ['accounting', 'ledger', 'journal', 'pnl', 'profit', 'balance sheet', 'cash flow', 'trial balance', 'coa', 'expenses', 'wht'],
  },
  {
    id: 'reports',
    group: 'finance_compliance',
    title: 'Analytics & Owner AI',
    subtitle: '7-day sales chart, category mix, 14-day forecast & AI Q&A',
    simpleModeVisible: false,
    optionalFeatureKey: 'reports',
    coreModule: false,
    recommendedPlan: 'standard',
    sqliteTables: ['orders', 'shifts'],
    keywords: ['reports', 'analytics', 'ai', 'forecast', 'chart', 'summary'],
  },
  {
    id: 'sales_book',
    group: 'finance_compliance',
    title: 'VAT Sales Book (GDT)',
    subtitle: 'Commercial & Tax invoices, credit notes, CSV & CamInvoice UBL 2.1',
    simpleModeVisible: false,
    optionalFeatureKey: 'sales_book',
    coreModule: false,
    recommendedPlan: 'standard',
    sqliteTables: ['vat_invoices'],
    keywords: ['vat', 'tax', 'invoice', 'caminvoice', 'ubl', 'gdt', 'credit note', 'csv'],
  },
  {
    id: 'audit_log',
    group: 'finance_compliance',
    title: 'Security & Audit Trail',
    subtitle: 'Immutable append-only log of voids, overrides & tenant actions',
    simpleModeVisible: false,
    coreModule: true,
    recommendedPlan: 'standard',
    sqliteTables: ['audit_logs'],
    keywords: ['audit', 'security', 'logs', 'voids', 'history', 'trail'],
  },
  {
    id: 'staff',
    group: 'saas_platform',
    title: 'Team & RBAC Permissions',
    subtitle: 'Staff PIN accounts, role templates & granular permission matrix',
    simpleModeVisible: false,
    coreModule: true,
    recommendedPlan: 'daily',
    sqliteTables: ['staff_members'],
    keywords: ['staff', 'users', 'team', 'pin', 'roles', 'permissions', 'rbac', 'admin'],
  },
  {
    id: 'chain',
    group: 'saas_platform',
    title: 'Multi-Branch & Tenants',
    subtitle: 'Clone new branches, manage isolated SaaS workspaces & tenant status',
    simpleModeVisible: false,
    coreModule: true,
    recommendedPlan: 'premium',
    sqliteTables: ['tenants', 'branches'],
    keywords: ['branches', 'chain', 'tenants', 'workspaces', 'multi-tenant', 'store'],
  },
  {
    id: 'saas_hub',
    group: 'saas_platform',
    title: 'SQLite DB & SaaS Hub',
    subtitle: 'Live SQLite WAL telemetry, modular feature flags & JSON backups',
    simpleModeVisible: false,
    coreModule: true,
    recommendedPlan: 'daily',
    sqliteTables: ['tenants', 'tenant_feature_flags', 'subscription_payments'],
    keywords: ['sqlite', 'database', 'saas', 'modules', 'backup', 'restore', 'feature flags', 'db'],
  },
  {
    id: 'plan_billing',
    group: 'saas_platform',
    title: 'Plan & KHQR Billing',
    subtitle: 'Daily ($1/day), Standard & Premium subscription checkout',
    simpleModeVisible: false,
    coreModule: true,
    recommendedPlan: 'daily',
    sqliteTables: ['tenants', 'subscription_payments'],
    keywords: ['plan', 'billing', 'subscription', 'daily', 'upgrade', 'khqr'],
  },
  {
    id: 'settings',
    group: 'saas_platform',
    title: 'Store & Receipt Settings',
    subtitle: 'Exchange rate, VAT, Bakong KHQR merchant ID & invoice designer',
    simpleModeVisible: true,
    coreModule: true,
    recommendedPlan: 'daily',
    sqliteTables: ['branches'],
    keywords: ['settings', 'config', 'exchange rate', 'riel', 'receipt', 'template', 'logo'],
  },
];

export interface OptionalFeatureToggleDef {
  key: string;
  moduleId: NavSection;
  label: string;
  description: string;
  defaultEnabled: boolean;
}

export const OPTIONAL_FEATURE_TOGGLES: OptionalFeatureToggleDef[] = [
  {
    key: 'kds',
    moduleId: 'kds',
    label: 'Kitchen & Bar Display (KDS)',
    description: 'Real-time kitchen/bar preparation board with SLA timers.',
    defaultEnabled: true,
  },
  {
    key: 'reservations',
    moduleId: 'reservations',
    label: 'Table Reservations & Online Booking',
    description: 'Accept bookings, deposits, clash checks, and /book guest page.',
    defaultEnabled: true,
  },
  {
    key: 'shift_drawer',
    moduleId: 'shift_drawer',
    label: 'Shift Ledger & Cash Drawer Counter',
    description: 'Dual USD/KHR float, petty cash, denomination counter, and Z-report.',
    defaultEnabled: true,
  },
  {
    key: 'stock',
    moduleId: 'stock',
    label: 'Inventory & BOM Recipe Auto-Deduct',
    description: 'Track ingredient stock, purchases, waste, and dish gross margins.',
    defaultEnabled: true,
  },
  {
    key: 'purchase_orders',
    moduleId: 'purchase_orders',
    label: 'Procurement & Supplier Purchase Orders (PO)',
    description: 'Auto-draft low-stock POs, partial GRN receipts, moving-avg cost & vendor AP.',
    defaultEnabled: true,
  },
  {
    key: 'accounting',
    moduleId: 'accounting',
    label: 'Double-Entry Accounting & Financial Suite',
    description: 'Automated USD/KHR General Ledger, P&L, Balance Sheet, Cash Flow, Trial Balance & GDT Tax.',
    defaultEnabled: true,
  },
  {
    key: 'tables_areas',
    moduleId: 'tables_areas',
    label: 'Floor Zones & Self-Order QR Tents',
    description: 'Manage floor plan tables and printable /qr guest self-ordering.',
    defaultEnabled: true,
  },
  {
    key: 'promotion',
    moduleId: 'promotion',
    label: 'Promotions, Prepaid Packs & Loyalty CRM',
    description: 'Happy-hour rules, prepaid passes, loyalty points, and Telegram drafts.',
    defaultEnabled: true,
  },
  {
    key: 'reports',
    moduleId: 'reports',
    label: 'Analytics, Forecast & AI Assistant',
    description: 'Revenue charts, 14-day Khmer holiday forecast, and Owner AI Q&A.',
    defaultEnabled: true,
  },
  {
    key: 'sales_book',
    moduleId: 'sales_book',
    label: 'Cambodia GDT VAT Sales Book & UBL 2.1',
    description: 'Commercial/Tax invoices, credit notes, CSV & CamInvoice XML export.',
    defaultEnabled: true,
  },
];

export function isModuleEnabledForTenant(
  moduleId: NavSection,
  featureFlags?: Record<string, boolean>,
  reservationsEnabledOnBranch = true
): boolean {
  if (moduleId === 'reservations' && !reservationsEnabledOnBranch) {
    return false;
  }
  const def = SAAS_MODULE_REGISTRY.find((m) => m.id === moduleId);
  if (!def || def.coreModule || !def.optionalFeatureKey) {
    return true;
  }
  if (!featureFlags) return true;
  const flagVal = featureFlags[def.optionalFeatureKey];
  return flagVal !== false;
}
