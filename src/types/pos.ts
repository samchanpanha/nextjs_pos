import type { OrderLineItem, PromotionRule } from '../utils/posMath';
import type { PermissionKey } from '../utils/permissions';
import type { SubscriptionPlan, SubscriptionStatus } from '../utils/subscription';
import type { InvoiceTemplateConfig } from '../utils/invoiceTemplate';

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
  | 'tables_areas'
  | 'promotion'
  | 'staff'
  | 'sales_book'
  | 'chain'
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
  totalUsd: number;
  totalKhr: number;
  paidUsd: number;
  paidKhr: number;
  changeUsd: number;
  changeKhr: number;
  paymentMethod?: 'Cash' | 'KHQR' | 'Bank transfer' | 'Card' | 'Split';
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

export interface PosAppState {
  tenantId?: string;
  ownerUid?: string;
  isDemoTenant?: boolean;
  tenantStatus?: TenantStatus;
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
  offlineMode: boolean;
  displayActiveOrderId: string | null;
  displayShowKhqr: boolean;
}
