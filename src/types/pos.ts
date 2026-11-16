import type { OrderLineItem, PromotionRule } from '../utils/posMath';
import type { PermissionKey } from '../utils/permissions';
import type { SubscriptionPlan, SubscriptionStatus } from '../utils/subscription';
import type { InvoiceTemplateConfig } from '../utils/invoiceTemplate';

export type { OrderLineItem, PromotionRule };

export type LanguageCode = 'en' | 'kh' | 'vi';

export type NavSection =
  | 'sell'
  | 'todays_money'
  | 'reservations'
  | 'kds'
  | 'bills'
  | 'shift_drawer'
  | 'reports'
  | 'menu_prices'
  | 'stock'
  | 'purchase_orders'
  | 'tables_areas'
  | 'promotion'
  | 'accounting'
  | 'staff'
  | 'sales_book'
  | 'chain'
  | 'saas_hub'
  | 'audit_log'
  | 'plan_billing'
  | 'settings';

export type ExternalMode = 'pos' | 'kds' | 'display' | 'qr' | 'group' | 'book';

export type StaffRole = 'admin' | 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen' | 'runner';

export type TenantStatus = 'active' | 'suspended';

export interface PlatformSettings {
  demoUsersDisabled: boolean;
  updatedAt?: string;
  updatedBy?: string;
  maintenanceBanner?: string;
}

export interface SaasUser {
  uid: string;
  email: string;
  displayName: string;
  role: 'admin' | 'owner' | 'staff';
  emailVerified: boolean;
  createdAt?: string;
}

export interface SqliteEngineStats {
  engine: string;
  sqliteVersion: string;
  journalMode: string;
  dbPath: string;
  dbSizeBytes: number;
  tableCounts: Record<string, number>;
  totalTenants: number;
  activeTenants: number;
  suspendedTenants: number;
  demoTenants: number;
  totalOrders: number;
  paidOrdersGmvUsd: number;
  subscriptionRevenueUsd: number;
  recentSubscriptions: {
    id: string;
    tenantId: string;
    tenantName: string;
    plan: SubscriptionPlan;
    daysGranted: number;
    amountUsd: number;
    paymentRef: string;
    createdAt: string;
  }[];
  checkedAt: string;
}

export interface StaffMember {
  id: string;
  name: string;
  username: string;
  roleLabel: string;
  role: StaffRole;
  pin: string;
  active: boolean;
  isDemo?: boolean;
  lastSignIn: string;
  permissions?: PermissionKey[];
}

export type CatalogItemType = 'product' | 'service';

export type TenantBusinessType = 'restaurant' | 'cafe' | 'retail' | 'services';

export interface TenantSummary {
  id: string;
  name: string;
  businessCode: string;
  businessType: TenantBusinessType;
  ownerUid?: string;
  isDemoTenant?: boolean;
  tenantStatus: TenantStatus;
  plan: SubscriptionPlan;
  planDaysLeft: number;
  subscriptionStatus: SubscriptionStatus;
  khqrAccountId: string;
  khqrAccountName: string;
  ownerName: string;
  ownerPermissions?: PermissionKey[];
  branchCode: string;
  createdAt: string;
}

export interface BranchConfig {
  id: string;
  name: string;
  code: string;
  address: string;
  phone: string;
  vattin: string;
  exchangeRate: number;
  rielRounding: number;
  vatPercent: number;
  serviceChargePercent: number;
  simpleMode: boolean;
  reservationsEnabled: boolean;
  defaultDepositUsd: number;
  holdMinutes: number;
  allowOnlineBooking: boolean;
  qrMode: 'review' | 'auto';
  groupOrderEnabled: boolean;
  kdsWarnMinutes: number;
  kdsLateMinutes: number;
  blindClose: boolean;
  varianceLimitUsd: number;
  khqrAccountName: string;
  khqrBakongId: string;
  khqrAccountType?: 'individual' | 'merchant';
  khqrMerchantId?: string;
  khqrAcquiringBank?: string;
  khqrCity?: string;
  khqrDefaultCurrency?: 'USD' | 'KHR';
  khqrMcc?: string;
  bakongConnected: boolean;
  pointsEnabled: boolean;
  pointsPerDollar: number;
  pointsValuePer100: number;
  telegramBotConnected: boolean;
  telegramChannel: string;
  displayPairingCode: string;
  displayFeaturedMode: 'auto' | 'manual' | 'off';
  displayShowNewPage: boolean;
  printerAutoBrowser: boolean;
  invoiceTemplate?: InvoiceTemplateConfig;
}

export interface MenuOptionGroup {
  name: string;
  choices: { label: string; deltaUsd: number; extraIngredientId?: string; extraQty?: number }[];
}

export interface MenuItem {
  id: string;
  branchId: string;
  itemType?: CatalogItemType;
  nameEn: string;
  nameKh: string;
  nameVi: string;
  description?: string;
  category: string;
  priceUsd: number;
  station: 'kitchen' | 'bar';
  imageUrl?: string;
  initials: string;
  options?: MenuOptionGroup[];
  isBestSeller?: boolean;
  isNew?: boolean;
  active: boolean;
  oftenOrderedWith?: string[];
}

export interface PosTable {
  id: string;
  branchId: string;
  name: string;
  area: 'Indoor' | 'Garden' | 'Bar counter' | 'Take-away';
  seats: number;
  status: 'free' | 'occupied' | 'ready';
  guests?: number;
  openedAt?: string;
  currentOrderId?: string;
  pendingTransferAlert?: boolean;
}

export type OrderChannel =
  | 'dine_in'
  | 'take_away'
  | 'grab'
  | 'foodpanda'
  | 'qr_table'
  | 'qr_counter'
  | 'group';

export type OrderStatus = 'open' | 'sent' | 'cooking' | 'ready' | 'served' | 'paid' | 'voided';

export type PaymentMethod = 'Cash' | 'KHQR' | 'Bank transfer' | 'Card' | 'Split';

export interface PosOrder {
  id: string;
  branchId: string;
  orderNumber: number;
  tableId?: string;
  tableName: string;
  channel: OrderChannel;
  status: OrderStatus;
  guests: number;
  items: OrderLineItem[];
  currentRound: number;
  manualDiscountPercent: number;
  manualDiscountUsd: number;
  promoCode?: string;
  promoDiscountUsd: number;
  appliedPromoName?: string;
  pointsRedeemed: number;
  memberId?: string;
  memberPhone?: string;
  prepaidCustomerPackId?: string;
  depositAppliedUsd: number;
  reservationId?: string;
  vatUsd?: number;
  serviceChargeUsd?: number;
  totalUsd: number;
  totalKhr: number;
  paidUsd: number;
  paidKhr: number;
  changeUsd: number;
  changeKhr: number;
  paymentMethod?: PaymentMethod;
  paymentRef?: string;
  cashierName: string;
  createdAt: string;
  updatedAt: string;
  closedAt?: string;
  offlinePendingSync?: boolean;
}

export interface QrIncomingOrder {
  id: string;
  branchId: string;
  tableId?: string;
  tableName: string;
  channel: 'qr_table' | 'qr_counter' | 'group';
  guestName?: string;
  phone?: string;
  note?: string;
  items: {
    menuItemId: string;
    nameEn: string;
    nameKh: string;
    nameVi: string;
    unitPriceUsd: number;
    qty: number;
    station: 'kitchen' | 'bar';
    category: string;
    optionLabel?: string;
    orderedBy?: string;
  }[];
  createdAt: string;
  status: 'pending' | 'accepted' | 'rejected';
}

export interface PettyCashEntry {
  id: string;
  type: 'in' | 'out';
  currency: 'USD' | 'KHR';
  amount: number;
  note: string;
  actorName: string;
  createdAt: string;
}

export interface ShiftRecord {
  id: string;
  branchId: string;
  cashierName: string;
  status: 'open' | 'closed';
  openingUsd: number;
  openingKhr: number;
  countedUsd: number;
  countedKhr: number;
  expectedUsd: number;
  expectedKhr: number;
  varianceUsd: number;
  varianceKhr: number;
  pettyCash: PettyCashEntry[];
  openedAt: string;
  closedAt?: string;
}

export interface Ingredient {
  id: string;
  branchId: string;
  nameEn: string;
  nameKh: string;
  unit: string;
  purchaseUnit: string;
  purchaseUnitSize: number;
  onHand: number;
  minLevel: number;
  used7d: number;
  avgCostUsd: number;
}

export interface Recipe {
  menuItemId: string;
  lines: { ingredientId: string; qtyPerPortion: number }[];
}

export interface StockHistoryEntry {
  id: string;
  ingredientId: string;
  ingredientName: string;
  type: 'purchase' | 'sale_deduct' | 'waste' | 'count_adjust';
  qtyDelta: number;
  costUsd?: number;
  note: string;
  createdAt: string;
}

export interface Reservation {
  id: string;
  branchId: string;
  code: string;
  guestName: string;
  phone: string;
  dateTime: string;
  guests: number;
  tableId?: string;
  tableName?: string;
  depositUsd: number;
  depositPaid: boolean;
  status: 'pending' | 'confirmed' | 'seated' | 'cancelled' | 'no_show';
  note?: string;
  source: 'staff' | 'online';
  createdAt: string;
}

export interface PrepaidPackTemplate {
  id: string;
  name: string;
  totalUses: number;
  priceUsd: number;
  validDays: number;
  categories: string[];
  active: boolean;
}

export interface CustomerPrepaidPack {
  id: string;
  templateId: string;
  packName: string;
  customerName: string;
  phone: string;
  code: string;
  usesLeft: number;
  totalUses: number;
  validUntil: string;
  branchName: string;
  active: boolean;
}

export interface MemberCustomer {
  id: string;
  name: string;
  phone: string;
  points: number;
  totalSpentUsd: number;
  tier: 'Member' | 'Silver' | 'Gold';
  lastVisit: string;
}

export interface VatInvoice {
  id: string;
  branchId: string;
  date: string;
  invoiceNo: string;
  invoiceType: 'commercial' | 'tax' | 'credit_note';
  buyerName: string;
  buyerVattin: string;
  exclVatUsd: number;
  vatUsd: number;
  totalUsd: number;
  totalKhr: number;
  status: 'issued' | 'replaced';
  replacesInvoiceNo?: string;
  orderId?: string;
}

export interface AuditLogEntry {
  id: string;
  branchId: string;
  actorName: string;
  action: string;
  detail: string;
  severity: 'info' | 'warning' | 'alert';
  createdAt: string;
}

export interface GroupOrderParticipantItem {
  id: string;
  participantName: string;
  menuItemId: string;
  nameEn: string;
  unitPriceUsd: number;
  qty: number;
  note?: string;
}

export interface GroupOrderSession {
  id: string;
  branchId: string;
  groupName: string;
  organiserName: string;
  pickupTime: string;
  items: GroupOrderParticipantItem[];
  submitted: boolean;
  orderNumber?: number;
  createdAt: string;
}

export type SupplierPaymentTerms = 'cod' | 'net_7' | 'net_15' | 'net_30';

export interface Supplier {
  id: string;
  branchId: string;
  name: string;
  nameKh?: string;
  category: string;
  contactName: string;
  phone: string;
  email?: string;
  telegram?: string;
  vattin?: string;
  paymentTerms: SupplierPaymentTerms;
  defaultWhtPercent?: number;
  notes?: string;
  active: boolean;
  createdAt: string;
}

export type PurchaseOrderStatus = 'draft' | 'sent' | 'partial' | 'received' | 'cancelled';
export type PurchaseOrderPaymentStatus = 'unpaid' | 'partial' | 'paid';

export interface PurchaseOrderLine {
  id: string;
  ingredientId?: string;
  itemName: string;
  purchaseUnit: string;
  baseUnit: string;
  conversionFactor: number;
  orderedQty: number;
  receivedQty: number;
  unitCostUsd: number;
  lineTotalUsd: number;
}

export interface PurchaseOrderGrnRecord {
  id: string;
  grnNumber: string;
  receivedAt: string;
  receivedBy: string;
  supplierInvoiceRef?: string;
  note?: string;
  lines: {
    lineId: string;
    ingredientId?: string;
    itemName: string;
    qtyReceivedNow: number;
    unitCostUsd: number;
    lineSubtotalUsd: number;
  }[];
  subtotalUsd: number;
  inputVatUsd: number;
  totalUsd: number;
}

export interface PurchaseOrderPaymentRecord {
  id: string;
  paidAt: string;
  paidBy: string;
  method: PaymentMethod;
  grossSettledUsd: number;
  whtDeductedUsd: number;
  cashPaidUsd: number;
  paymentRef: string;
  note?: string;
}

export interface PurchaseOrder {
  id: string;
  poNumber: string;
  branchId: string;
  supplierId: string;
  supplierName: string;
  supplierVattin?: string;
  status: PurchaseOrderStatus;
  paymentStatus: PurchaseOrderPaymentStatus;
  orderDate: string;
  expectedDate: string;
  dueDate: string;
  paymentTerms: SupplierPaymentTerms;
  applyInputVat: boolean;
  whtPercent: number;
  lines: PurchaseOrderLine[];
  subtotalUsd: number;
  inputVatUsd: number;
  totalUsd: number;
  totalKhr: number;
  receivedSubtotalUsd: number;
  receivedVatUsd: number;
  receivedTotalUsd: number;
  paidUsd: number;
  whtWithheldUsd: number;
  balanceDueUsd: number;
  grnHistory: PurchaseOrderGrnRecord[];
  payments: PurchaseOrderPaymentRecord[];
  note?: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'cogs' | 'expense';

export type AccountSubType =
  | 'cash_bank'
  | 'receivable'
  | 'inventory'
  | 'tax_asset'
  | 'fixed_asset'
  | 'payable'
  | 'tax_liability'
  | 'unearned_revenue'
  | 'owner_equity'
  | 'retained_earnings'
  | 'operating_revenue'
  | 'other_revenue'
  | 'direct_cogs'
  | 'waste_cogs'
  | 'payroll_expense'
  | 'occupancy_expense'
  | 'operating_expense';

export interface LedgerAccount {
  id: string;
  code: string;
  nameEn: string;
  nameKh: string;
  type: AccountType;
  subType: AccountSubType;
  normalBalance: 'debit' | 'credit';
  systemAccount: boolean;
  active: boolean;
  description?: string;
}

export type JournalSourceType =
  | 'opening'
  | 'pos_sale'
  | 'pos_refund'
  | 'shift_cash'
  | 'inventory_purchase'
  | 'inventory_waste'
  | 'po_grn'
  | 'po_payment'
  | 'expense_voucher'
  | 'prepaid_pack'
  | 'manual'
  | 'reversal';

export interface JournalLine {
  id: string;
  accountCode: string;
  accountName: string;
  debitUsd: number;
  creditUsd: number;
  memo?: string;
}

export interface JournalEntry {
  id: string;
  entryNo: string;
  branchId: string;
  date: string;
  createdAt: string;
  sourceType: JournalSourceType;
  sourceRef?: string;
  description: string;
  lines: JournalLine[];
  totalDebitUsd: number;
  totalCreditUsd: number;
  exchangeRate: number;
  postedBy: string;
  reversed?: boolean;
  reversesEntryId?: string;
}

export interface OperatingExpense {
  id: string;
  voucherNo: string;
  branchId: string;
  date: string;
  expenseAccountCode: string;
  expenseAccountName: string;
  vendorName: string;
  vendorVattin?: string;
  description: string;
  subtotalUsd: number;
  applyInputVat: boolean;
  inputVatUsd: number;
  whtPercent: number;
  whtAmountUsd: number;
  totalUsd: number;
  cashPaidUsd: number;
  paymentStatus: 'paid' | 'payable';
  paymentMethod?: PaymentMethod;
  paymentRef?: string;
  createdBy: string;
  createdAt: string;
}

export interface PosAppState {
  tenantId?: string;
  ownerUid?: string;
  isDemoTenant?: boolean;
  tenantStatus?: TenantStatus;
  storeDataRedactedForAdmin?: boolean;
  shopName: string;
  businessCode: string;
  businessType?: TenantBusinessType;
  plan: SubscriptionPlan;
  planDaysLeft: number;
  subscriptionStatus?: SubscriptionStatus;
  subscriptionRef?: string;
  subscriptionExpiresAt?: string;
  subscriptionPaidUsd?: number;
  referralCode: string;
  branches: BranchConfig[];
  activeBranchId: string;
  staff: StaffMember[];
  activeStaffId: string;
  ownerPermissions?: PermissionKey[];
  menuItems: MenuItem[];
  tables: PosTable[];
  orders: PosOrder[];
  qrQueue: QrIncomingOrder[];
  shifts: ShiftRecord[];
  ingredients: Ingredient[];
  recipes: Recipe[];
  stockHistory: StockHistoryEntry[];
  suppliers?: Supplier[];
  purchaseOrders?: PurchaseOrder[];
  accounts?: LedgerAccount[];
  journalEntries?: JournalEntry[];
  expenses?: OperatingExpense[];
  reservations: Reservation[];
  promotions: PromotionRule[];
  prepaidTemplates: PrepaidPackTemplate[];
  customerPacks: CustomerPrepaidPack[];
  members: MemberCustomer[];
  invoices: VatInvoice[];
  auditLogs: AuditLogEntry[];
  groupSessions: GroupOrderSession[];
  dailyRevenueHistory: { date: string; netSalesUsd: number; bills: number; guests: number }[];
  nextOrderNumber: number;
  nextInvoiceSeq: number;
  nextPoSeq?: number;
  nextJournalSeq?: number;
  offlineMode: boolean;
  displayActiveOrderId: string | null;
  displayShowKhqr: boolean;
  featureFlags?: Record<string, boolean>;
  version?: number;
}

export type Order = PosOrder;
export type Promotion = PromotionRule;
export type LoyaltyMember = MemberCustomer;
export type CustomerPack = CustomerPrepaidPack;
export type StockMovement = StockHistoryEntry;
export type RecipeLine = { ingredientId: string; qtyPerPortion: number };
export type DailyRevenuePoint = { date: string; netSalesUsd: number; bills: number; guests: number };
