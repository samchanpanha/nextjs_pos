import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  CLIENT_TAB_ID,
  activateSubscriptionInSqlite,
  createTenantInSqlite,
  deleteTenantFromSqlite,
  fetchCurrentSession,
  fetchTenantFromSqlite,
  loginSaasAccount,
  logoutSaasAccount,
  registerSaasAccount,
  resetSaasAccountPassword,
  savePlatformSettingsToSqlite,
  saveTenantToSqlite,
  subscribeToSqliteRealtime,
  verifyStaffPinOnSqlite,
} from '../lib/sqliteClient';
import {
  cloneBranchResources,
  createSeedState,
  createTenantSeedState,
  type DemoPresetType,
  type RegisterTenantParams,
} from '../data/seedData';
import type {
  AuditLogEntry,
  BranchConfig,
  ExternalMode,
  Ingredient,
  JournalEntry,
  LanguageCode,
  LedgerAccount,
  LoyaltyMember,
  MenuItem,
  NavSection,
  OperatingExpense,
  Order,
  OrderChannel,
  OrderLineItem,
  PaymentMethod,
  PettyCashEntry,
  PlatformSettings,
  PosAppState,
  PosTable,
  PrepaidPackTemplate,
  Promotion,
  PurchaseOrder,
  PurchaseOrderLine,
  PurchaseOrderPaymentRecord,
  QrIncomingOrder,
  Reservation,
  SaasUser,
  ShiftRecord,
  StaffMember,
  Supplier,
  SupplierPaymentTerms,
  TenantStatus,
  TenantSummary,
  VatInvoice,
} from '../types/pos';
import {
  buildInventoryDirectJournal,
  buildOperatingExpenseJournal,
  buildPoGrnJournal,
  buildPoPaymentJournal,
  buildPosOrderSaleJournal,
  buildPosRefundJournal,
  buildPrepaidPackSaleJournal,
  buildReversalJournal,
  buildShiftCashJournal,
  computeDueDateFromTerms,
  computeLowStockAutoDraftPos,
  createDefaultChartOfAccounts,
  finalizeBalancedJournal,
  resolveAccountName,
} from '../utils/accountingEngine';
import {
  calculateDrawerReconciliation,
  calculateOrderTotals,
  roundCurrency,
  usdToKhr,
} from '../utils/posMath';
type PosOrder = Order;
type PromotionRule = Promotion;
import {
  ALL_PERMISSIONS,
  canAccessNavSection,
  canAssignRole,
  canEditSettings,
  canGrantPermission,
  canManageOwnerGrants,
  DEFAULT_OWNER_TENANT_PERMISSIONS,
  DEFAULT_ROLE_PERMISSIONS,
  getEffectivePermissions,
  getFirstAllowedNavSection,
  hasPermission,
  isSuperAdmin,
  normalizePermissions,
  type PermissionKey,
} from '../utils/permissions';
import {
  canEditTenantBranchSettings,
  normalizeInvoiceTemplate,
} from '../utils/invoiceTemplate';
import {
  calculateExtendedDays,
  type SubscriptionPlan,
} from '../utils/subscription';
import {
  canActorAuthenticateInTenant,
  canStartDemoMode,
  canSwitchToTenant,
  countDemoUsersAcrossTenants,
  DEFAULT_PLATFORM_SETTINGS,
  getVisibleTenantsForActor,
  isDemoStaffAccount,
  isDemoTenantWorkspace,
  resolveTenantStaffSignIn,
} from '../utils/tenantAccess';

const STORAGE_KEY = 'xaiwork_pos_state_v1';
const TENANTS_STORAGE_KEY = 'xaiwork_pos_tenants_v1';
const PLATFORM_STORAGE_KEY = 'xaiwork_pos_platform_v1';

interface MultiTenantStorage {
  activeTenantId: string;
  states: Record<string, PosAppState>;
}

interface PosContextValue {
  state: PosAppState;
  activeBranch: BranchConfig;
  activeStaff: StaffMember;
  language: LanguageCode;
  setLanguage: (lang: LanguageCode) => void;
  navSection: NavSection;
  setNavSection: (section: NavSection) => void;
  externalMode: ExternalMode;
  setExternalMode: (mode: ExternalMode) => void;
  isEnteredPos: boolean;
  platformSettings: PlatformSettings;
  demoUsersCount: number;
  setDemoUsersDisabled: (disabled: boolean) => boolean;
  setTenantStatus: (tenantId: string, status: TenantStatus) => boolean;
  deleteTenantWorkspace: (tenantId: string) => boolean;
  startDemoPreset: (preset: DemoPresetType) => void;
  staffSignIn: (
    username: string,
    pinOrPassword: string,
    businessCode?: string
  ) => { ok: boolean; error?: string };
  staffSignInRemote: (
    username: string,
    pinOrPassword: string,
    businessCode?: string
  ) => Promise<{ ok: boolean; error?: string }>;
  exitToWelcome: () => void;
  firebaseUser: SaasUser | null;
  saasUser: SaasUser | null;
  shopId: string | null;
  authLoading: boolean;
  cloudStatus: 'demo' | 'synced' | 'syncing' | 'error';
  sseConnected: boolean;
  loginWithEmailPassword: (email: string, password: string) => Promise<void>;
  registerWithEmailPassword: (
    email: string,
    password: string,
    displayName?: string
  ) => Promise<void>;
  resetSaasPassword: (email: string, newPassword?: string) => Promise<string>;
  signInWithGoogle: () => Promise<void>;
  signOutGoogle: () => Promise<void>;
  toasts: { id: string; message: string; tone: 'success' | 'info' | 'warning' | 'error' }[];
  notify: (message: string, tone?: 'success' | 'info' | 'warning' | 'error') => void;
  dismissToast: (id: string) => void;
  setOrderGuests: (orderId: string, guests: number) => void;
  cancelEmptyOrder: (orderId: string) => boolean;
  voidOrder: (orderId: string, reason: string, managerPin: string) => boolean;
  addLoyaltyMember: (params: { name: string; phone: string; initialPoints?: number }) => LoyaltyMember | null;
  toggleTenantFeatureFlag: (moduleKey: string, enabled: boolean) => void;
  reloadTenantsFromSqlite: () => Promise<void>;
  selectedTableId: string | null;
  setSelectedTableId: (tableId: string | null) => void;
  activeOrderId: string | null;
  setActiveOrderId: (orderId: string | null) => void;
  receiptOrder: PosOrder | null;
  setReceiptOrder: (order: PosOrder | null) => void;
  tenants: TenantSummary[];
  activeTenantId: string;
  registerTenant: (params: RegisterTenantParams) => Promise<string>;
  switchTenant: (tenantId: string) => void;
  switchBranch: (branchId: string) => void;
  openTableOrder: (tableId: string) => string;
  createTakeAwayOrder: (channel: OrderChannel) => string;
  addItemToOrder: (
    orderId: string,
    item: MenuItem,
    optionLabel?: string,
    deltaUsd?: number,
    orderedBy?: string
  ) => void;
  updateOrderItemQty: (orderId: string, lineId: string, delta: number) => void;
  updateOrderItemNote: (orderId: string, lineId: string, note: string) => void;
  clearDraftItems: (orderId: string) => void;
  sendOrderToKitchen: (orderId: string) => void;
  advanceKdsOrder: (orderId: string, nextStatus: 'cooking' | 'ready' | 'served') => void;
  voidOrderItem: (orderId: string, lineId: string, managerPin: string) => boolean;
  moveOrderToTable: (orderId: string, targetTableId: string) => void;
  splitOrderItems: (orderId: string, lineIds: string[]) => string | null;
  applyOrderDiscount: (orderId: string, percent: number, flatUsd: number, managerPin: string) => boolean;
  setOrderPromoCode: (orderId: string, code: string) => void;
  attachMemberToOrder: (orderId: string, phone: string, redeemPoints: number) => void;
  applyPrepaidPack: (orderId: string, customerPackId: string) => void;
  settleOrderPayment: (
    orderId: string,
    params: {
      method: 'Cash' | 'KHQR' | 'Bank transfer' | 'Card' | 'Split';
      paidUsd: number;
      paidKhr: number;
      changeUsd: number;
      changeKhr: number;
      paymentRef?: string;
      promoDiscountUsd?: number;
      appliedPromoName?: string;
      totalUsd?: number;
      totalKhr?: number;
    }
  ) => void;
  submitGuestQrOrder: (payload: Omit<QrIncomingOrder, 'id' | 'createdAt' | 'status'>) => number;
  acceptQrOrder: (qrId: string) => void;
  rejectQrOrder: (qrId: string) => void;
  createGroupSession: (groupName: string, organiserName: string, pickupTime: string) => string;
  addGroupSessionItem: (
    sessionId: string,
    participantName: string,
    item: MenuItem,
    note?: string
  ) => void;
  submitGroupSessionToPos: (sessionId: string) => number | null;
  createReservation: (payload: Omit<Reservation, 'id' | 'code' | 'createdAt'>) => void;
  confirmReservation: (resId: string) => void;
  payReservationDeposit: (resId: string) => void;
  seatReservation: (resId: string, tableId: string) => void;
  cancelReservation: (resId: string, noShow?: boolean) => void;
  openShift: (openingUsd: number, openingKhr: number) => void;
  addPettyCash: (entry: Omit<PettyCashEntry, 'id' | 'createdAt' | 'actorName'>) => void;
  closeShift: (countedUsd: number, countedKhr: number, managerPin?: string) => boolean;
  addIngredient: (ing: Omit<Ingredient, 'id' | 'branchId' | 'used7d'>) => void;
  recordIngredientPurchase: (ingredientId: string, qtyAdded: number, totalCostUsd: number) => void;
  recordIngredientWaste: (ingredientId: string, qtyWasted: number, note: string) => void;
  recordStockCount: (ingredientId: string, actualQty: number) => void;
  saveRecipe: (menuItemId: string, lines: { ingredientId: string; qtyPerPortion: number }[]) => void;
  saveMenuItem: (item: Partial<MenuItem> & { nameEn: string; category: string; priceUsd: number; station: 'kitchen' | 'bar' }) => void;
  deleteMenuItem: (itemId: string) => void;
  importMenuItems: (
    items: { nameEn: string; nameKh: string; nameVi: string; category: string; priceUsd: number; station: 'kitchen' | 'bar' }[]
  ) => void;
  saveTable: (table: { id?: string; name: string; area: PosTable['area']; seats: number }) => void;
  deleteTable: (tableId: string) => void;
  togglePromotion: (promoId: string) => void;
  addPromotion: (promo: Omit<PromotionRule, 'id'>) => void;
  addPrepaidTemplate: (tpl: Omit<PrepaidPackTemplate, 'id'>) => void;
  sellPrepaidPack: (templateId: string, customerName: string, phone: string) => void;
  voidCustomerPack: (packId: string) => void;
  saveStaffMember: (
    member: Omit<StaffMember, 'id' | 'lastSignIn'> & { id?: string },
    targetTenantId?: string
  ) => void;
  switchActiveStaff: (staffId: string, pin: string) => boolean;
  tenantStates: Record<string, PosAppState>;
  isAdminUser: boolean;
  hasCurrentPermission: (perm: PermissionKey) => boolean;
  updateStaffPermissions: (
    staffId: string,
    permissions: PermissionKey[],
    targetTenantId?: string
  ) => boolean;
  updateTenantOwnerPermissions: (
    tenantId: string,
    ownerPermissions: PermissionKey[]
  ) => boolean;
  grantAllStaffInTenant: (targetTenantId?: string) => boolean;
  updateBranchSettingsForTenant: (
    tenantId: string,
    branchId: string,
    partial: Partial<BranchConfig>
  ) => boolean;
  issueTaxInvoice: (invoiceId: string, buyerName: string, buyerVattin: string) => void;
  createCreditNote: (invoiceId: string) => void;
  updateBranchSettings: (partial: Partial<BranchConfig>) => void;
  addBranch: (name: string, code: string, address?: string, cloneFromCurrent?: boolean) => void;
  setPlan: (plan: SubscriptionPlan) => void;
  activateTenantSubscription: (params: {
    plan: SubscriptionPlan;
    days: number;
    amountUsd: number;
    paymentRef: string;
  }) => void;
  toggleOfflineMode: () => void;
  syncOfflineBills: () => void;
  setDisplayOrder: (orderId: string | null, showKhqr: boolean) => void;
  resetDemoData: () => void;

  // Purchase Orders & Suppliers (Procurement)
  saveSupplier: (supplier: Omit<Supplier, 'id' | 'createdAt'> & { id?: string }) => void;
  deleteSupplier: (supplierId: string) => void;
  createPurchaseOrder: (params: {
    supplierId: string;
    orderDate: string;
    expectedDate: string;
    paymentTerms: SupplierPaymentTerms;
    applyInputVat: boolean;
    whtPercent?: number;
    status?: 'draft' | 'sent';
    note?: string;
    lines: Omit<PurchaseOrderLine, 'id' | 'receivedQty' | 'lineTotalUsd'>[];
  }) => PurchaseOrder | null;
  autoDraftLowStockPurchaseOrders: () => number;
  updatePurchaseOrderStatus: (poId: string, status: 'sent' | 'cancelled') => void;
  receivePurchaseOrder: (params: {
    poId: string;
    supplierInvoiceRef?: string;
    note?: string;
    lines: { lineId: string; qtyReceivedNow: number; unitCostUsd: number }[];
  }) => boolean;
  payPurchaseOrder: (params: {
    poId: string;
    method: PaymentMethod;
    grossSettledUsd: number;
    whtPercent?: number;
    paymentRef: string;
    note?: string;
  }) => boolean;

  // Accounting & Double-Entry General Ledger
  saveLedgerAccount: (
    account: Omit<LedgerAccount, 'id' | 'systemAccount'> & { id?: string }
  ) => void;
  recordOperatingExpense: (params: {
    date: string;
    expenseAccountCode: string;
    vendorName: string;
    vendorVattin?: string;
    description: string;
    subtotalUsd: number;
    applyInputVat: boolean;
    whtPercent: number;
    paymentStatus: 'paid' | 'payable';
    paymentMethod?: PaymentMethod;
    paymentRef?: string;
  }) => OperatingExpense | null;
  postManualJournalEntry: (params: {
    date: string;
    sourceRef?: string;
    description: string;
    lines: { accountCode: string; debitUsd: number; creditUsd: number; memo?: string }[];
  }) => boolean;
  reverseJournalEntry: (entryId: string, reason?: string) => boolean;
}

const PosContext = createContext<PosContextValue | null>(null);

function redactClientStoreDataForAdmin(st: PosAppState): PosAppState {
  return {
    ...st,
    storeDataRedactedForAdmin: true,
    menuItems: [],
    tables: [],
    orders: [],
    qrQueue: [],
    shifts: [],
    ingredients: [],
    recipes: [],
    stockHistory: [],
    suppliers: [],
    purchaseOrders: [],
    accounts: [],
    journalEntries: [],
    expenses: [],
    reservations: [],
    promotions: [],
    prepaidTemplates: [],
    customerPacks: [],
    members: [],
    invoices: [],
    groupSessions: [],
    dailyRevenueHistory: [],
    displayActiveOrderId: null,
  };
}

function normalizeTenantRbac(st: PosAppState): PosAppState {
  const ownerPermissions = Array.isArray(st.ownerPermissions)
    ? normalizePermissions(st.ownerPermissions, false)
    : [...DEFAULT_OWNER_TENANT_PERMISSIONS];
  const hasAdmin = st.staff.some((s) => s.role === 'admin');
  const baseStaff: StaffMember[] = hasAdmin
    ? st.staff
    : [
        {
          id: 'staff_admin',
          name: 'System Admin',
          username: 'admin',
          roleLabel: 'Super Admin',
          role: 'admin',
          pin: '0000',
          active: true,
          lastSignIn: new Date().toISOString().slice(0, 16).replace('T', ' '),
          permissions: [...ALL_PERMISSIONS],
        },
        ...st.staff,
      ];
  const isDemoTenant =
    typeof st.isDemoTenant === 'boolean' ? st.isDemoTenant : isDemoTenantWorkspace(st);
  const normalizedStaff: StaffMember[] = baseStaff.map((s) => ({
    ...s,
    isDemo:
      typeof s.isDemo === 'boolean'
        ? s.role === 'admin'
          ? false
          : s.isDemo
        : isDemoStaffAccount(s, { ...st, isDemoTenant }),
    permissions:
      s.role === 'admin'
        ? [...ALL_PERMISSIONS]
        : s.role === 'owner'
          ? [...ownerPermissions]
          : Array.isArray(s.permissions)
            ? normalizePermissions(s.permissions, false)
            : [...(DEFAULT_ROLE_PERMISSIONS[s.role] || [])],
  }));
  const normalizedBranches = st.branches.map((b) => ({
    ...b,
    invoiceTemplate: normalizeInvoiceTemplate(b.invoiceTemplate, {
      shopName: b.name || st.shopName,
      branchCode: b.code,
      businessType: st.businessType,
    }),
  }));
  return {
    ...st,
    isDemoTenant,
    tenantStatus: st.tenantStatus === 'suspended' ? 'suspended' : 'active',
    branches: normalizedBranches,
    ownerPermissions,
    staff: normalizedStaff,
  };
}

function loadInitialPlatformSettings(): PlatformSettings {
  try {
    const raw = localStorage.getItem(PLATFORM_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlatformSettings;
      if (parsed && typeof parsed.demoUsersDisabled === 'boolean') {
        return {
          demoUsersDisabled: parsed.demoUsersDisabled,
          updatedAt: parsed.updatedAt,
          updatedBy: parsed.updatedBy,
        };
      }
    }
  } catch {
    // ignore corrupted storage
  }
  return DEFAULT_PLATFORM_SETTINGS;
}

function loadInitialState(): PosAppState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PosAppState;
      if (parsed && Array.isArray(parsed.branches) && parsed.branches.length > 0) {
        return normalizeTenantRbac(parsed);
      }
    }
  } catch {
    // ignore corrupted storage
  }
  return createSeedState('restaurant');
}

function getInitialUrlFlags(): { autostart: boolean; mode: ExternalMode } {
  const params = new URLSearchParams(window.location.search);
  const path = window.location.pathname.toLowerCase();
  const autostart = params.get('autostart') === '1' || path === '/pos';
  let mode: ExternalMode = 'pos';
  const m = params.get('mode');
  if (m === 'kds' || path === '/kds') mode = 'kds';
  else if (m === 'display' || path === '/display') mode = 'display';
  else if (m === 'qr' || path.startsWith('/qr')) mode = 'qr';
  else if (m === 'group' || path.startsWith('/group')) mode = 'group';
  else if (m === 'book' || path.startsWith('/book')) mode = 'book';
  return { autostart: autostart || mode !== 'pos', mode };
}

function loadMultiTenantInitial(): MultiTenantStorage {
  try {
    const multiRaw = localStorage.getItem(TENANTS_STORAGE_KEY);
    if (multiRaw) {
      const parsed = JSON.parse(multiRaw) as MultiTenantStorage;
      if (
        parsed &&
        parsed.activeTenantId &&
        parsed.states &&
        parsed.states[parsed.activeTenantId]?.branches?.length > 0
      ) {
        const normalizedStates: Record<string, PosAppState> = {};
        for (const [k, v] of Object.entries(parsed.states)) {
          normalizedStates[k] = normalizeTenantRbac(v);
        }
        return {
          activeTenantId: parsed.activeTenantId,
          states: normalizedStates,
        };
      }
    }
  } catch {
    // ignore corrupted multi-tenant storage
  }
  const single = loadInitialState();
  const tid = single.tenantId || 'tenant_lotus_bkk1';
  const normalized: PosAppState = normalizeTenantRbac({ ...single, tenantId: tid });
  return {
    activeTenantId: tid,
    states: { [tid]: normalized },
  };
}

export function PosProvider({ children }: { children: React.ReactNode }) {
  const initialFlags = useMemo(() => getInitialUrlFlags(), []);
  const initialMulti = useMemo(() => loadMultiTenantInitial(), []);
  const initialPlatform = useMemo(() => loadInitialPlatformSettings(), []);
  const [rawTenantStates, setRawTenantStates] = useState<Record<string, PosAppState>>(
    initialMulti.states
  );
  const [activeTenantId, setActiveTenantId] = useState<string>(initialMulti.activeTenantId);
  const [state, setState] = useState<PosAppState>(
    () => initialMulti.states[initialMulti.activeTenantId] || loadInitialState()
  );
  const [platformSettings, setPlatformSettings] = useState<PlatformSettings>(initialPlatform);
  const [language, setLanguage] = useState<LanguageCode>('en');
  const [navSection, setNavSection] = useState<NavSection>('sell');
  const [externalMode, setExternalMode] = useState<ExternalMode>(initialFlags.mode);
  const [isEnteredPos, setIsEnteredPos] = useState<boolean>(() => {
    if (!initialFlags.autostart) return false;
    const initState = initialMulti.states[initialMulti.activeTenantId] || loadInitialState();
    const initActor =
      initState.staff.find((s) => s.id === initState.activeStaffId) || initState.staff[0];
    return canActorAuthenticateInTenant({
      member: initActor,
      tenant: initState,
      platform: initialPlatform,
    }).ok;
  });
  const [selectedTableId, setSelectedTableId] = useState<string | null>(null);
  const [activeOrderId, setActiveOrderId] = useState<string | null>(null);
  const [receiptOrder, setReceiptOrder] = useState<PosOrder | null>(null);

  const [firebaseUser, setFirebaseUser] = useState<SaasUser | null>(null);
  const [isCloudAdmin, setIsCloudAdmin] = useState<boolean>(false);
  const [shopId, setShopId] = useState<string | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [cloudStatus, setCloudStatus] = useState<'demo' | 'synced' | 'syncing' | 'error'>('synced');
  const [sseConnected, setSseConnected] = useState<boolean>(false);
  const [toasts, setToasts] = useState<
    { id: string; message: string; tone: 'success' | 'info' | 'warning' | 'error' }[]
  >([]);

  const skipSqlitePushRef = useRef<boolean>(true);
  const hydratedFromSqliteRef = useRef<boolean>(false);

  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const notify = useCallback(
    (message: string, tone: 'success' | 'info' | 'warning' | 'error' = 'info') => {
      const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setToasts((prev) => [...prev.slice(-3), { id, message, tone }]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 3600);
    },
    []
  );

  useEffect(() => {
    try {
      localStorage.setItem(PLATFORM_STORAGE_KEY, JSON.stringify(platformSettings));
    } catch {
      // ignore storage quota errors
    }
  }, [platformSettings]);

  // Debounced localStorage write (prevents blocking UI thread on large catalog clicks)
  useEffect(() => {
    const tid = state.tenantId || activeTenantId;
    setRawTenantStates((prev) => ({ ...prev, [tid]: state }));

    const timer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        setRawTenantStates((curr) => {
          localStorage.setItem(
            TENANTS_STORAGE_KEY,
            JSON.stringify({ activeTenantId: tid, states: curr })
          );
          return curr;
        });
      } catch {
        // ignore storage quota errors
      }
    }, 180);

    return () => clearTimeout(timer);
  }, [state, activeTenantId]);

  const applyServerSessionPayload = useCallback(
    (payload: {
      user: SaasUser | null;
      isSuperAdmin?: boolean;
      tenants: PosAppState[];
      platformSettings: PlatformSettings;
    }) => {
      setFirebaseUser(payload.user);
      const superFlag = Boolean(payload.isSuperAdmin || payload.user?.role === 'admin');
      setIsCloudAdmin(superFlag);
      if (payload.platformSettings) {
        setPlatformSettings(payload.platformSettings);
      }
      if (Array.isArray(payload.tenants) && payload.tenants.length > 0) {
        const mapped: Record<string, PosAppState> = {};
        for (const t of payload.tenants) {
          const tid = t.tenantId || 'tenant_lotus_bkk1';
          mapped[tid] = normalizeTenantRbac({ ...t, tenantId: tid });
        }
        setRawTenantStates((prev) => ({ ...prev, ...mapped }));

        setState((prev) => {
          const currentTid = prev.tenantId || activeTenantId;
          const matchedServer = mapped[currentTid];
          if (matchedServer) {
            skipSqlitePushRef.current = true;
            setShopId(currentTid);
            return {
              ...matchedServer,
              activeStaffId:
                superFlag
                  ? matchedServer.staff.find((s) => s.role === 'admin')?.id ||
                    matchedServer.activeStaffId
                  : prev.activeStaffId &&
                      matchedServer.staff.some((s) => s.id === prev.activeStaffId)
                    ? prev.activeStaffId
                    : matchedServer.activeStaffId,
            };
          }
          // Prefer user's owned tenant if logged in
          if (payload.user) {
            const owned = Object.values(mapped).find((t) => t.ownerUid === payload.user?.uid);
            if (owned && owned.tenantId) {
              skipSqlitePushRef.current = true;
              setActiveTenantId(owned.tenantId);
              setShopId(owned.tenantId);
              return owned;
            }
          }
          return prev;
        });
      }
      hydratedFromSqliteRef.current = true;
      setCloudStatus('synced');
    },
    [activeTenantId]
  );

  const reloadTenantsFromSqlite = useCallback(async () => {
    try {
      const sessionData = await fetchCurrentSession();
      applyServerSessionPayload(sessionData);
    } catch {
      setCloudStatus('error');
    }
  }, [applyServerSessionPayload]);

  // Initial SQLite session + workspace hydration on boot
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const sessionData = await fetchCurrentSession();
        if (!active) return;
        applyServerSessionPayload(sessionData);
      } catch {
        if (!active) return;
        hydratedFromSqliteRef.current = true;
        setCloudStatus('demo');
      } finally {
        if (active) setAuthLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [applyServerSessionPayload]);

  // Debounced Atomic SQLite Persistence whenever active tenant state mutates
  useEffect(() => {
    if (!hydratedFromSqliteRef.current) return;
    if (skipSqlitePushRef.current) {
      skipSqlitePushRef.current = false;
      return;
    }
    if (state.offlineMode) return;

    const activeStaffMember =
      state.staff.find((s) => s.id === state.activeStaffId) || state.staff[0];
    const timer = setTimeout(() => {
      setCloudStatus('syncing');
      saveTenantToSqlite(state, {
        staffRole: activeStaffMember?.role,
        adminPin: activeStaffMember?.role === 'admin' ? activeStaffMember.pin : undefined,
      })
        .then((saved) => {
          setShopId(saved.tenantId || null);
          setCloudStatus('synced');
          try {
            const bc = new BroadcastChannel('xaiwork_pos_sync_v2');
            bc.postMessage({
              type: 'state_saved',
              tenantId: saved.tenantId,
              tabId: CLIENT_TAB_ID,
            });
            bc.close();
          } catch {
            // BroadcastChannel optional
          }
        })
        .catch(() => {
          setCloudStatus('error');
        });
    }, 260);

    return () => clearTimeout(timer);
  }, [state]);

  // Live Real-Time SSE + Cross-Tab Sync
  useEffect(() => {
    const tidList = Object.keys(rawTenantStates);
    const unsubSse = subscribeToSqliteRealtime(
      tidList,
      (evt) => {
        if (evt.clientTabId && evt.clientTabId === CLIENT_TAB_ID) return;
        if (
          evt.type === 'tenant_updated' ||
          evt.type === 'qr_order_received' ||
          evt.type === 'reservation_received'
        ) {
          if (evt.tenantId) {
            fetchTenantFromSqlite(evt.tenantId)
              .then((fresh) => {
                const normalized = normalizeTenantRbac(fresh);
                setRawTenantStates((prev) => ({ ...prev, [evt.tenantId!]: normalized }));
                setState((prev) => {
                  if ((prev.tenantId || activeTenantId) !== evt.tenantId) return prev;
                  skipSqlitePushRef.current = true;
                  return {
                    ...normalized,
                    activeStaffId: prev.activeStaffId || normalized.activeStaffId,
                  };
                });
                if (evt.type === 'qr_order_received') {
                  notify('New Guest QR order arrived!', 'info');
                } else if (evt.type === 'reservation_received') {
                  notify('New online reservation received!', 'info');
                }
              })
              .catch(() => {});
          }
        } else if (evt.type === 'platform_settings_updated' || evt.type === 'tenant_deleted') {
          void reloadTenantsFromSqlite();
        }
      },
      (connected) => setSseConnected(connected)
    );

    let bc: BroadcastChannel | null = null;
    try {
      bc = new BroadcastChannel('xaiwork_pos_sync_v2');
      bc.onmessage = (e) => {
        if (e.data?.tabId === CLIENT_TAB_ID) return;
        if (e.data?.tenantId) {
          fetchTenantFromSqlite(e.data.tenantId)
            .then((fresh) => {
              const normalized = normalizeTenantRbac(fresh);
              setRawTenantStates((prev) => ({ ...prev, [e.data.tenantId]: normalized }));
              setState((prev) => {
                if ((prev.tenantId || activeTenantId) !== e.data.tenantId) return prev;
                skipSqlitePushRef.current = true;
                return { ...normalized, activeStaffId: prev.activeStaffId };
              });
            })
            .catch(() => {});
        }
      };
    } catch {
      // ignore if unsupported
    }

    return () => {
      unsubSse();
      bc?.close();
    };
  }, [activeTenantId, notify, rawTenantStates, reloadTenantsFromSqlite]);

  const allTenants = useMemo<TenantSummary[]>(() => {
    return Object.entries(rawTenantStates).map(([tid, st]) => {
      const mainBranch = st.branches[0];
      const owner = st.staff.find((s) => s.role === 'owner') || st.staff[0];
      return {
        id: tid,
        name: st.shopName,
        businessCode: st.businessCode,
        businessType: st.businessType || 'restaurant',
        ownerUid: st.ownerUid,
        isDemoTenant: st.isDemoTenant,
        tenantStatus: st.tenantStatus || 'active',
        plan: st.plan,
        planDaysLeft: st.planDaysLeft ?? 0,
        subscriptionStatus:
          st.subscriptionStatus ?? ((st.planDaysLeft ?? 0) > 0 ? 'active' : 'pending'),
        khqrAccountId: mainBranch?.khqrBakongId || '',
        khqrAccountName: mainBranch?.khqrAccountName || st.shopName,
        ownerName: owner?.name || 'Owner',
        ownerPermissions: st.ownerPermissions ?? [...DEFAULT_OWNER_TENANT_PERMISSIONS],
        branchCode: mainBranch?.code || 'MAIN',
        createdAt: st.auditLogs[st.auditLogs.length - 1]?.createdAt || new Date().toISOString(),
      };
    });
  }, [rawTenantStates]);

  const demoUsersCount = useMemo(
    () => countDemoUsersAcrossTenants(rawTenantStates),
    [rawTenantStates]
  );

  const activeBranch = useMemo(
    () => state.branches.find((b) => b.id === state.activeBranchId) || state.branches[0],
    [state.branches, state.activeBranchId]
  );

  const activeStaff = useMemo(
    () => state.staff.find((s) => s.id === state.activeStaffId) || state.staff[0],
    [state.staff, state.activeStaffId]
  );

  // Strict actor-isolated tenant list & state map:
  // Super Admin sees all multi-tenants; non-admin tenants ONLY see their own tenant's data.
  const tenants = useMemo<TenantSummary[]>(
    () =>
      getVisibleTenantsForActor({
        allTenants,
        isEnteredPos,
        actor: isEnteredPos ? activeStaff : null,
        activeTenantId: state.tenantId || activeTenantId,
        firebaseUid: firebaseUser?.uid,
        isCloudAdmin,
        platform: platformSettings,
      }),
    [
      allTenants,
      isEnteredPos,
      activeStaff,
      state.tenantId,
      activeTenantId,
      firebaseUser?.uid,
      isCloudAdmin,
      platformSettings,
    ]
  );

  const tenantStates = useMemo<Record<string, PosAppState>>(() => {
    const currentTid = state.tenantId || activeTenantId;
    if (isEnteredPos && isSuperAdmin(activeStaff)) {
      return { ...rawTenantStates, [currentTid]: state };
    }
    if (!isEnteredPos && firebaseUser && isCloudAdmin) {
      return rawTenantStates;
    }
    return { [currentTid]: state };
  }, [rawTenantStates, state, activeTenantId, isEnteredPos, activeStaff, firebaseUser, isCloudAdmin]);

  // Ensure a disabled demo user or suspended non-admin tenant cannot stay inside POS
  useEffect(() => {
    if (!isEnteredPos) return;
    const check = canActorAuthenticateInTenant({
      member: activeStaff,
      tenant: state,
      platform: platformSettings,
    });
    if (!check.ok) {
      setIsEnteredPos(false);
      setExternalMode('pos');
      return;
    }
    if (!canAccessNavSection(activeStaff, navSection, state.ownerPermissions)) {
      setNavSection(getFirstAllowedNavSection(activeStaff, state.ownerPermissions));
    }
  }, [isEnteredPos, activeStaff, state, platformSettings, navSection]);

  const appendAudit = (
    prev: PosAppState,
    action: string,
    detail: string,
    severity: AuditLogEntry['severity'] = 'info'
  ): AuditLogEntry => {
    return {
      id: `al_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
      branchId: prev.activeBranchId,
      actorName: prev.staff.find((s) => s.id === prev.activeStaffId)?.name || 'Staff',
      action,
      detail,
      severity,
      createdAt: new Date().toISOString(),
    };
  };

  const syncOrderCloud = (_order: PosOrder, _offline: boolean) => {};

  const syncTableCloud = (_table: PosTable, _offline: boolean) => {};

  const loginWithEmailPassword = async (email: string, password: string) => {
    setCloudStatus('syncing');
    const data = await loginSaasAccount({ email, password });
    applyServerSessionPayload(data);
    setIsEnteredPos(true);
    notify(`Signed in to SQLite SaaS as ${data.user?.displayName || email}`, 'success');
  };

  const registerWithEmailPassword = async (
    email: string,
    password: string,
    displayName?: string
  ) => {
    setCloudStatus('syncing');
    const data = await registerSaasAccount({ email, password, displayName });
    applyServerSessionPayload(data);
    notify(`Created SQLite SaaS account for ${data.user?.email}`, 'success');
  };

  const resetSaasPassword = async (email: string, newPassword?: string): Promise<string> => {
    const res = await resetSaasAccountPassword({ email, newPassword });
    return res.message;
  };

  const signInWithGoogle = async () => {
    await loginWithEmailPassword('owner@lotuscafe.kh', 'lotus1234');
  };

  const signOutGoogle = async () => {
    await logoutSaasAccount();
    setFirebaseUser(null);
    setIsCloudAdmin(false);
    setShopId(null);
    setCloudStatus('synced');
    notify('Signed out of SaaS account.', 'info');
  };

  const startDemoPreset = (preset: DemoPresetType) => {
    if (!canStartDemoMode(platformSettings)) return;
    const fresh = createSeedState(preset);
    setState(fresh);
    setActiveTenantId(fresh.tenantId || 'tenant_lotus_bkk1');
    setSelectedTableId(null);
    setActiveOrderId(null);
    setNavSection('sell');
    setExternalMode('pos');
    setIsEnteredPos(true);
  };

  const staffSignIn = (username: string, pinOrPassword: string, businessCode?: string) => {
    const currentTid = state.tenantId || activeTenantId;
    const mergedMap = { ...rawTenantStates, [currentTid]: state };
    const resolved = resolveTenantStaffSignIn({
      tenantStates: mergedMap,
      activeTenantId: currentTid,
      username,
      pinOrPassword,
      businessCode,
      platform: platformSettings,
    });
    if (!resolved.ok || !resolved.tenantId || !resolved.staff) {
      return {
        ok: false,
        error: resolved.error || 'Sign-in failed.',
      };
    }

    const targetTenant = normalizeTenantRbac(mergedMap[resolved.tenantId]);
    const baseState =
      resolved.staff.role === 'admin'
        ? redactClientStoreDataForAdmin(targetTenant)
        : targetTenant;
    const nextState = { ...baseState, activeStaffId: resolved.staff.id };
    if (resolved.staff.role === 'admin') {
      skipSqlitePushRef.current = true;
    }
    setActiveTenantId(resolved.tenantId);
    setState(nextState);
    setShopId(resolved.tenantId);
    setSelectedTableId(null);
    setActiveOrderId(null);
    if (!canAccessNavSection(resolved.staff, navSection, nextState.ownerPermissions)) {
      setNavSection(getFirstAllowedNavSection(resolved.staff, nextState.ownerPermissions));
    }
    setExternalMode('pos');
    setIsEnteredPos(true);
    return { ok: true };
  };

  const staffSignInRemote = async (
    username: string,
    pinOrPassword: string,
    businessCode?: string
  ): Promise<{ ok: boolean; error?: string }> => {
    try {
      const remote = await verifyStaffPinOnSqlite({
        businessCode,
        username,
        pin: pinOrPassword,
      });
      if (remote.ok && remote.tenant) {
        const tid = remote.tenant.tenantId || 'tenant_lotus_bkk1';
        const normalized = normalizeTenantRbac({ ...remote.tenant, tenantId: tid });
        const staffId = remote.staffId || normalized.activeStaffId;
        const staffMember =
          normalized.staff.find((s) => s.id === staffId) || normalized.staff[0];
        const nextState = {
          ...(staffMember.role === 'admin'
            ? redactClientStoreDataForAdmin(normalized)
            : normalized),
          activeStaffId: staffMember.id,
        };
        skipSqlitePushRef.current = true;
        setRawTenantStates((prev) => ({ ...prev, [tid]: nextState }));
        setActiveTenantId(tid);
        setState(nextState);
        setShopId(tid);
        setSelectedTableId(null);
        setActiveOrderId(null);
        if (!canAccessNavSection(staffMember, navSection, nextState.ownerPermissions)) {
          setNavSection(getFirstAllowedNavSection(staffMember, nextState.ownerPermissions));
        }
        setExternalMode('pos');
        setIsEnteredPos(true);
        notify(
          staffMember.role === 'admin'
            ? 'Signed in as SaaS Platform Super Admin (Store Data Disabled)'
            : `Connected to ${nextState.shopName} via SQLite`,
          'success'
        );
        return { ok: true };
      }
    } catch {
      // Fallback to local state when offline
    }

    const localResult = staffSignIn(username, pinOrPassword, businessCode);
    if (localResult.ok) {
      notify(`Signed in as ${username}`, 'success');
    }
    return localResult;
  };

  const exitToWelcome = () => {
    setExternalMode('pos');
    setIsEnteredPos(false);
  };

  const registerTenant = async (params: RegisterTenantParams): Promise<string> => {
    const fresh = createTenantSeedState({
      ...params,
      ownerUid: firebaseUser?.uid || params.ownerUid,
    });
    const tid = fresh.tenantId!;
    skipSqlitePushRef.current = true;
    setRawTenantStates((prev) => ({ ...prev, [tid]: fresh }));
    setActiveTenantId(tid);
    setState(fresh);
    setShopId(tid);
    setSelectedTableId(null);
    setActiveOrderId(null);
    setNavSection('sell');
    setExternalMode('pos');
    setIsEnteredPos(true);

    setCloudStatus('syncing');
    try {
      const saved = await createTenantInSqlite(fresh, {
        staffRole: activeStaff?.role,
        adminPin: activeStaff?.role === 'admin' ? activeStaff.pin : undefined,
      });
      skipSqlitePushRef.current = true;
      const normalized = normalizeTenantRbac(saved);
      setRawTenantStates((prev) => ({ ...prev, [tid]: normalized }));
      setState(normalized);
      setCloudStatus('synced');
      notify(`Workspace "${saved.shopName}" created in SQLite!`, 'success');
    } catch (err) {
      console.error('SQLite tenant registration error:', err);
      setCloudStatus('error');
    }
    return tid;
  };

  const switchTenant = (tenantId: string) => {
    const currentTid = state.tenantId || activeTenantId;
    const target = rawTenantStates[tenantId];
    if (
      !canSwitchToTenant({
        actor: isEnteredPos ? activeStaff : null,
        targetTenantId: tenantId,
        activeTenantId: currentTid,
        targetTenant: target,
        firebaseUid: firebaseUser?.uid,
        isCloudAdmin,
      })
    ) {
      return;
    }
    if (!target) return;
    const normalized = normalizeTenantRbac(target);
    // Preserve Admin persona when Super Admin switches across tenants
    const preserveAdmin = activeStaff.role === 'admin' || isCloudAdmin;
    const adminInTarget = normalized.staff.find((s) => s.role === 'admin');
    const nextState =
      preserveAdmin && adminInTarget
        ? { ...normalized, activeStaffId: adminInTarget.id }
        : normalized;
    const nextActor =
      nextState.staff.find((s) => s.id === nextState.activeStaffId) || nextState.staff[0];
    skipSqlitePushRef.current = true;
    setActiveTenantId(tenantId);
    setState(nextState);
    setShopId(tenantId);
    setSelectedTableId(null);
    setActiveOrderId(null);
    if (!hasPermission(nextActor, navSection, nextState.ownerPermissions)) {
      setNavSection(getFirstAllowedNavSection(nextActor, nextState.ownerPermissions));
    }
    setExternalMode('pos');
    setIsEnteredPos(true);
    notify(`Switched workspace to ${nextState.shopName}`, 'info');
  };

  const setDemoUsersDisabled = (disabled: boolean): boolean => {
    if (!isSuperAdmin(activeStaff) && !isCloudAdmin) return false;
    const nextSettings: PlatformSettings = {
      demoUsersDisabled: disabled,
      updatedAt: new Date().toISOString(),
      updatedBy: activeStaff.name,
    };
    setPlatformSettings(nextSettings);
    setState((prev) => {
      const log = appendAudit(
        prev,
        disabled ? 'Demo users disabled' : 'Demo users enabled',
        `${activeStaff.name} ${disabled ? 'disabled' : 're-enabled'} all demo user accounts and 24h sample shops globally`,
        'warning'
      );
      return { ...prev, auditLogs: [log, ...prev.auditLogs] };
    });
    void savePlatformSettingsToSqlite(nextSettings, {
      staffRole: activeStaff.role,
      adminPin: activeStaff.pin,
    }).catch(() => {});
    return true;
  };

  const setTenantStatus = (tenantId: string, status: TenantStatus): boolean => {
    if (!isSuperAdmin(activeStaff) && !isCloudAdmin) return false;
    const currentTid = state.tenantId || activeTenantId;
    const target = tenantId === currentTid ? state : rawTenantStates[tenantId];
    if (!target) return false;

    const applyStatus = (prev: PosAppState): PosAppState => {
      const log = appendAudit(
        prev,
        status === 'suspended' ? 'Tenant suspended' : 'Tenant activated',
        `${activeStaff.name} set workspace ${prev.shopName} status to ${status}`,
        status === 'suspended' ? 'alert' : 'info'
      );
      return {
        ...prev,
        tenantStatus: status,
        auditLogs: [log, ...prev.auditLogs],
      };
    };

    const nextTargetState = applyStatus(target);

    if (tenantId === currentTid) {
      setState(nextTargetState);
    } else {
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tenantId]: nextTargetState,
      }));
      void saveTenantToSqlite(nextTargetState, {
        staffRole: activeStaff.role,
        adminPin: activeStaff.pin,
      }).catch(() => {});
    }
    return true;
  };

  const deleteTenantWorkspace = (tenantId: string): boolean => {
    if (!isSuperAdmin(activeStaff) && !isCloudAdmin) return false;
    const currentTid = state.tenantId || activeTenantId;
    if (tenantId === currentTid) return false;
    if (tenantId === 'tenant_lotus_bkk1') return false;
    if (Object.keys(rawTenantStates).length <= 1) return false;
    if (!rawTenantStates[tenantId]) return false;
    setRawTenantStates((prevMap) => {
      const copy = { ...prevMap };
      delete copy[tenantId];
      try {
        localStorage.setItem(
          TENANTS_STORAGE_KEY,
          JSON.stringify({ activeTenantId: currentTid, states: copy })
        );
      } catch {
        // ignore
      }
      return copy;
    });
    void deleteTenantFromSqlite(tenantId, {
      staffRole: activeStaff.role,
      adminPin: activeStaff.pin,
    }).catch(() => {});
    notify('Workspace deleted from SQLite.', 'warning');
    return true;
  };

  const switchBranch = (branchId: string) => {
    setState((prev) => ({ ...prev, activeBranchId: branchId }));
    setSelectedTableId(null);
    setActiveOrderId(null);
  };

  const recomputeOrderTotals = (order: PosOrder, branch: BranchConfig): PosOrder => {
    const totals = calculateOrderTotals({
      items: order.items,
      exchangeRate: branch.exchangeRate,
      rielRounding: branch.rielRounding,
      vatPercent: branch.vatPercent,
      serviceChargePercent: branch.serviceChargePercent,
      manualDiscountPercent: order.manualDiscountPercent,
      manualDiscountUsd: order.manualDiscountUsd,
      promoDiscountUsd: order.promoDiscountUsd,
      pointsRedeemed: order.pointsRedeemed,
      pointsValuePer100: branch.pointsValuePer100,
      depositAppliedUsd: order.depositAppliedUsd,
    });
    return {
      ...order,
      totalUsd: totals.totalUsd,
      totalKhr: totals.totalKhr,
      updatedAt: new Date().toISOString(),
    };
  };

  const openTableOrder = (tableId: string): string => {
    const existingTable = state.tables.find((t) => t.id === tableId);
    if (existingTable?.currentOrderId) {
      const existingOrder = state.orders.find(
        (o) => o.id === existingTable.currentOrderId && o.status !== 'paid' && o.status !== 'voided'
      );
      if (existingOrder) {
        setSelectedTableId(tableId);
        setActiveOrderId(existingOrder.id);
        return existingOrder.id;
      }
    }

    const newOrderId = `ord_${Date.now()}`;
    const orderNum = state.nextOrderNumber;
    const newOrder: PosOrder = {
      id: newOrderId,
      branchId: state.activeBranchId,
      orderNumber: orderNum,
      tableId,
      tableName: existingTable?.name || 'Table',
      channel: 'dine_in',
      status: 'open',
      guests: existingTable?.seats || 2,
      items: [],
      currentRound: 1,
      manualDiscountPercent: 0,
      manualDiscountUsd: 0,
      promoDiscountUsd: 0,
      pointsRedeemed: 0,
      depositAppliedUsd: 0,
      totalUsd: 0,
      totalKhr: 0,
      paidUsd: 0,
      paidKhr: 0,
      changeUsd: 0,
      changeKhr: 0,
      cashierName: activeStaff.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setState((prev) => {
      const updatedTables = prev.tables.map((t) =>
        t.id === tableId
          ? {
              ...t,
              status: 'occupied' as const,
              guests: t.seats,
              openedAt: new Date().toISOString(),
              currentOrderId: newOrderId,
            }
          : t
      );
      const updatedTable = updatedTables.find((t) => t.id === tableId);
      if (updatedTable) syncTableCloud(updatedTable, prev.offlineMode);
      syncOrderCloud(newOrder, prev.offlineMode);

      return {
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        orders: [newOrder, ...prev.orders],
        tables: updatedTables,
        displayActiveOrderId: newOrderId,
      };
    });

    setSelectedTableId(tableId);
    setActiveOrderId(newOrderId);
    return newOrderId;
  };

  const createTakeAwayOrder = (channel: OrderChannel): string => {
    const newOrderId = `ord_${Date.now()}`;
    const orderNum = state.nextOrderNumber;
    const labelMap: Record<string, string> = {
      take_away: `Take-away #${orderNum}`,
      grab: `Grab #${orderNum}`,
      foodpanda: `foodpanda #${orderNum}`,
    };
    const newOrder: PosOrder = {
      id: newOrderId,
      branchId: state.activeBranchId,
      orderNumber: orderNum,
      tableName: labelMap[channel] || `Take-away #${orderNum}`,
      channel,
      status: 'open',
      guests: 1,
      items: [],
      currentRound: 1,
      manualDiscountPercent: 0,
      manualDiscountUsd: 0,
      promoDiscountUsd: 0,
      pointsRedeemed: 0,
      depositAppliedUsd: 0,
      totalUsd: 0,
      totalKhr: 0,
      paidUsd: 0,
      paidKhr: 0,
      changeUsd: 0,
      changeKhr: 0,
      cashierName: activeStaff.name,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setState((prev) => {
      syncOrderCloud(newOrder, prev.offlineMode);
      return {
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        orders: [newOrder, ...prev.orders],
        displayActiveOrderId: newOrderId,
      };
    });
    setSelectedTableId(null);
    setActiveOrderId(newOrderId);
    return newOrderId;
  };

  const addItemToOrder = (
    orderId: string,
    item: MenuItem,
    optionLabel?: string,
    deltaUsd = 0,
    orderedBy?: string
  ) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const unitPriceUsd = roundCurrency(item.priceUsd + deltaUsd);
        const existingDraft = ord.items.find(
          (l) =>
            !l.sentToKitchen &&
            !l.voided &&
            l.menuItemId === item.id &&
            (l.optionLabel || '') === (optionLabel || '') &&
            (l.orderedBy || '') === (orderedBy || '')
        );
        let nextItems: OrderLineItem[];
        if (existingDraft) {
          nextItems = ord.items.map((l) =>
            l.id === existingDraft.id ? { ...l, qty: l.qty + 1 } : l
          );
        } else {
          const newLine: OrderLineItem = {
            id: `oi_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
            menuItemId: item.id,
            nameEn: item.nameEn,
            nameKh: item.nameKh,
            nameVi: item.nameVi,
            unitPriceUsd,
            qty: 1,
            station: item.station,
            category: item.category,
            optionLabel,
            orderedBy,
            round: ord.currentRound,
            sentToKitchen: false,
            kdsStatus: 'draft',
          };
          nextItems = [...ord.items, newLine];
        }
        const updated = recomputeOrderTotals({ ...ord, items: nextItems }, branch);
        syncOrderCloud(updated, prev.offlineMode);
        return updated;
      });
      return { ...prev, orders, displayActiveOrderId: orderId };
    });
  };

  const updateOrderItemQty = (orderId: string, lineId: string, delta: number) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextItems = ord.items
          .map((l) => (l.id === lineId ? { ...l, qty: l.qty + delta } : l))
          .filter((l) => l.qty > 0);
        const updated = recomputeOrderTotals({ ...ord, items: nextItems }, branch);
        syncOrderCloud(updated, prev.offlineMode);
        return updated;
      });
      return { ...prev, orders };
    });
  };

  const updateOrderItemNote = (orderId: string, lineId: string, note: string) => {
    setState((prev) => ({
      ...prev,
      orders: prev.orders.map((ord) =>
        ord.id !== orderId
          ? ord
          : {
              ...ord,
              items: ord.items.map((l) => (l.id === lineId ? { ...l, note } : l)),
              updatedAt: new Date().toISOString(),
            }
      ),
    }));
  };

  const clearDraftItems = (orderId: string) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextItems = ord.items.filter((l) => l.sentToKitchen);
        return recomputeOrderTotals({ ...ord, items: nextItems }, branch);
      });
      return { ...prev, orders };
    });
  };

  const setOrderGuests = (orderId: string, guests: number) => {
    const safeGuests = Math.max(1, Math.min(99, Math.round(guests || 1)));
    setState((prev) => {
      const target = prev.orders.find((o) => o.id === orderId);
      const orders = prev.orders.map((o) =>
        o.id === orderId
          ? { ...o, guests: safeGuests, updatedAt: new Date().toISOString() }
          : o
      );
      const tables = prev.tables.map((t) =>
        target?.tableId && t.id === target.tableId ? { ...t, guests: safeGuests } : t
      );
      return { ...prev, orders, tables };
    });
  };

  const cancelEmptyOrder = (orderId: string): boolean => {
    const target = state.orders.find((o) => o.id === orderId);
    if (!target || target.status === 'paid') return false;
    const hasSentItems = target.items.some((i) => i.sentToKitchen && !i.voided);
    if (hasSentItems) return false;

    setState((prev) => {
      const tables = prev.tables.map((t) =>
        target.tableId && t.id === target.tableId
          ? {
              ...t,
              status: 'free' as const,
              activeOrderId: undefined,
              guests: undefined,
              occupiedSince: undefined,
            }
          : t
      );
      const orders = prev.orders.filter((o) => o.id !== orderId);
      return {
        ...prev,
        orders,
        tables,
        displayActiveOrderId:
          prev.displayActiveOrderId === orderId ? null : prev.displayActiveOrderId,
      };
    });
    if (activeOrderId === orderId) setActiveOrderId(null);
    if (target.tableId && selectedTableId === target.tableId) setSelectedTableId(null);
    notify('Empty draft order cancelled & table released.', 'info');
    return true;
  };

  const voidOrder = (orderId: string, reason: string, managerPin: string): boolean => {
    if (!verifyManagerPin(managerPin)) return false;
    const target = state.orders.find((o) => o.id === orderId);
    if (!target || target.status === 'paid' || target.status === 'voided') return false;

    setState((prev) => {
      const nowIso = new Date().toISOString();
      const orders = prev.orders.map((o) =>
        o.id === orderId
          ? {
              ...o,
              status: 'voided' as const,
              items: o.items.map((l) => ({ ...l, voided: true })),
              totalUsd: 0,
              totalKhr: 0,
              updatedAt: nowIso,
              closedAt: nowIso,
            }
          : o
      );
      const tables = prev.tables.map((t) =>
        target.tableId && t.id === target.tableId
          ? {
              ...t,
              status: 'free' as const,
              activeOrderId: undefined,
              guests: undefined,
              occupiedSince: undefined,
            }
          : t
      );
      const log = appendAudit(
        prev,
        'Order voided',
        `Bill #${target.orderNumber} (${target.tableName || target.channel}) voided · Reason: ${reason || 'Manager override'}`,
        'alert'
      );
      return {
        ...prev,
        orders,
        tables,
        auditLogs: [log, ...prev.auditLogs],
        displayActiveOrderId:
          prev.displayActiveOrderId === orderId ? null : prev.displayActiveOrderId,
      };
    });
    if (activeOrderId === orderId) setActiveOrderId(null);
    if (target.tableId && selectedTableId === target.tableId) setSelectedTableId(null);
    notify(`Bill #${target.orderNumber} voided.`, 'warning');
    return true;
  };

  const sendOrderToKitchen = (orderId: string) => {
    setState((prev) => {
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const hasDraft = ord.items.some((l) => !l.sentToKitchen && !l.voided);
        if (!hasDraft) return ord;
        const nextItems = ord.items.map((l) =>
          !l.sentToKitchen && !l.voided
            ? { ...l, sentToKitchen: true, kdsStatus: 'new' as const }
            : l
        );
        const updated: PosOrder = {
          ...ord,
          status: ord.status === 'open' ? 'sent' : ord.status,
          currentRound: ord.currentRound + 1,
          items: nextItems,
          updatedAt: new Date().toISOString(),
        };
        syncOrderCloud(updated, prev.offlineMode);
        return updated;
      });
      return { ...prev, orders };
    });
  };

  const advanceKdsOrder = (orderId: string, nextStatus: 'cooking' | 'ready' | 'served') => {
    setState((prev) => {
      const targetOrder = prev.orders.find((o) => o.id === orderId);
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextItems = ord.items.map((l) => {
          if (!l.sentToKitchen || l.voided) return l;
          return { ...l, kdsStatus: nextStatus };
        });
        const updated: PosOrder = {
          ...ord,
          status: ord.status === 'paid' ? 'paid' : nextStatus,
          items: nextItems,
          updatedAt: new Date().toISOString(),
        };
        syncOrderCloud(updated, prev.offlineMode);
        return updated;
      });

      const tables = prev.tables.map((t) => {
        if (targetOrder?.tableId && t.id === targetOrder.tableId) {
          const tableStatus =
            nextStatus === 'ready' ? 'ready' : nextStatus === 'served' ? 'occupied' : t.status;
          const updatedTable: PosTable = { ...t, status: tableStatus };
          syncTableCloud(updatedTable, prev.offlineMode);
          return updatedTable;
        }
        return t;
      });

      return { ...prev, orders, tables };
    });
  };

  const verifyManagerPin = (pin: string) =>
    state.staff.some(
      (s) =>
        s.active &&
        s.pin === pin &&
        (hasPermission(s, 'void_discount_override', state.ownerPermissions) ||
          s.role === 'admin')
    );

  const voidOrderItem = (orderId: string, lineId: string, managerPin: string): boolean => {
    if (!verifyManagerPin(managerPin)) return false;
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      let voidedLabel = '';
      const orders = prev.orders.map((ord) => {
        if (ord.id !== orderId) return ord;
        const nextItems = ord.items.map((l) => {
          if (l.id === lineId) {
            voidedLabel = `${l.qty}× ${l.nameEn}`;
            return { ...l, voided: true };
          }
          return l;
        });
        return recomputeOrderTotals({ ...ord, items: nextItems }, branch);
      });
      const log = appendAudit(prev, 'Void item', `Voided ${voidedLabel} on order ${orderId}`, 'alert');
      return { ...prev, orders, auditLogs: [log, ...prev.auditLogs] };
    });
    return true;
  };

  const moveOrderToTable = (orderId: string, targetTableId: string) => {
    setState((prev) => {
      const ord = prev.orders.find((o) => o.id === orderId);
      const targetTable = prev.tables.find((t) => t.id === targetTableId);
      if (!ord || !targetTable || targetTable.status !== 'free') return prev;
      const oldTableId = ord.tableId;
      const tables = prev.tables.map((t) => {
        if (t.id === oldTableId) {
          const freeTable: PosTable = { ...t, status: 'free', currentOrderId: undefined, guests: undefined, openedAt: undefined };
          syncTableCloud(freeTable, prev.offlineMode);
          return freeTable;
        }
        if (t.id === targetTableId) {
          const busyTable: PosTable = {
            ...t,
            status: 'occupied',
            currentOrderId: orderId,
            guests: ord.guests,
            openedAt: ord.createdAt,
          };
          syncTableCloud(busyTable, prev.offlineMode);
          return busyTable;
        }
        return t;
      });
      const orders = prev.orders.map((o) =>
        o.id === orderId ? { ...o, tableId: targetTableId, tableName: targetTable.name } : o
      );
      return { ...prev, tables, orders };
    });
    setSelectedTableId(targetTableId);
  };

  const splitOrderItems = (orderId: string, lineIds: string[]): string | null => {
    const src = state.orders.find((o) => o.id === orderId);
    if (!src || lineIds.length === 0) return null;
    const movedLines = src.items.filter((l) => lineIds.includes(l.id));
    const remainingLines = src.items.filter((l) => !lineIds.includes(l.id));
    if (movedLines.length === 0 || remainingLines.length === 0) return null;

    const newOrderId = `ord_split_${Date.now()}`;
    const branch = activeBranch;
    const splitOrder: PosOrder = recomputeOrderTotals(
      {
        ...src,
        id: newOrderId,
        orderNumber: state.nextOrderNumber,
        tableName: `${src.tableName} (Split)`,
        tableId: undefined,
        items: movedLines,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      branch
    );

    setState((prev) => {
      const orders = prev.orders.map((o) =>
        o.id === orderId ? recomputeOrderTotals({ ...o, items: remainingLines }, branch) : o
      );
      return {
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        orders: [splitOrder, ...orders],
      };
    });
    setActiveOrderId(newOrderId);
    return newOrderId;
  };

  const applyOrderDiscount = (
    orderId: string,
    percent: number,
    flatUsd: number,
    managerPin: string
  ): boolean => {
    if (percent > 10 || flatUsd > 5) {
      if (!verifyManagerPin(managerPin)) return false;
    }
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const orders = prev.orders.map((o) =>
        o.id === orderId
          ? recomputeOrderTotals(
              { ...o, manualDiscountPercent: percent, manualDiscountUsd: flatUsd },
              branch
            )
          : o
      );
      const log = appendAudit(
        prev,
        'Manual discount',
        `Applied ${percent > 0 ? `${percent}%` : `$${flatUsd}`} discount`,
        'warning'
      );
      return { ...prev, orders, auditLogs: [log, ...prev.auditLogs] };
    });
    return true;
  };

  const setOrderPromoCode = (orderId: string, code: string) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const promo = prev.promotions.find(
        (p) => p.active && p.code && p.code.toUpperCase() === code.trim().toUpperCase()
      );
      const orders = prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        const discountUsd = promo ? promo.discountUsd ?? 1.5 : 0;
        return recomputeOrderTotals(
          {
            ...o,
            promoCode: code.trim().toUpperCase(),
            promoDiscountUsd: discountUsd,
            appliedPromoName: promo?.nameEn,
          },
          branch
        );
      });
      return { ...prev, orders };
    });
  };

  const attachMemberToOrder = (orderId: string, phone: string, redeemPoints: number) => {
    const cleanPhone = phone.replace(/\s+/g, '');
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const member = prev.members.find((m) => m.phone.replace(/\s+/g, '') === cleanPhone);
      const safeRedeem = member ? Math.min(member.points, Math.max(0, redeemPoints)) : 0;
      const orders = prev.orders.map((o) =>
        o.id === orderId
          ? recomputeOrderTotals(
              {
                ...o,
                memberId: member?.id,
                memberPhone: cleanPhone,
                pointsRedeemed: safeRedeem,
              },
              branch
            )
          : o
      );
      return { ...prev, orders };
    });
  };

  const applyPrepaidPack = (orderId: string, customerPackId: string) => {
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const pack = prev.customerPacks.find((p) => p.id === customerPackId && p.usesLeft > 0 && p.active);
      if (!pack) return prev;
      const tpl = prev.prepaidTemplates.find((t) => t.id === pack.templateId);
      const orders = prev.orders.map((o) => {
        if (o.id !== orderId) return o;
        let usedOne = false;
        const nextItems = o.items.map((item) => {
          if (!usedOne && !item.voided && tpl?.categories.includes(item.category)) {
            usedOne = true;
            return { ...item, coveredByPack: true };
          }
          return item;
        });
        return recomputeOrderTotals({ ...o, prepaidCustomerPackId: pack.id, items: nextItems }, branch);
      });
      return { ...prev, orders };
    });
  };

  const settleOrderPayment: PosContextValue['settleOrderPayment'] = (orderId, params) => {
    const currentOrder = state.orders.find((o) => o.id === orderId);
    if (!currentOrder) return;
    const nowIso = new Date().toISOString();
    const updatedOrder: PosOrder = {
      ...currentOrder,
      status: 'paid',
      paymentMethod: params.method,
      paymentRef: params.paymentRef,
      promoDiscountUsd:
        typeof params.promoDiscountUsd === 'number'
          ? params.promoDiscountUsd
          : currentOrder.promoDiscountUsd,
      appliedPromoName: params.appliedPromoName ?? currentOrder.appliedPromoName,
      totalUsd: typeof params.totalUsd === 'number' ? params.totalUsd : currentOrder.totalUsd,
      totalKhr: typeof params.totalKhr === 'number' ? params.totalKhr : currentOrder.totalKhr,
      paidUsd: params.paidUsd,
      paidKhr: params.paidKhr,
      changeUsd: params.changeUsd,
      changeKhr: params.changeKhr,
      closedAt: nowIso,
      updatedAt: nowIso,
      offlinePendingSync: state.offlineMode,
      items: currentOrder.items.map((l) => ({
        ...l,
        sentToKitchen: true,
        kdsStatus: l.kdsStatus === 'draft' ? 'new' : l.kdsStatus,
      })),
    };
    syncOrderCloud(updatedOrder, state.offlineMode);

    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const ord = prev.orders.find((o) => o.id === orderId);
      if (!ord) return prev;

      // Free table if dine-in
      const tables = prev.tables.map((t) => {
        if (ord.tableId && t.id === ord.tableId) {
          const freeT: PosTable = {
            ...t,
            status: 'free',
            guests: undefined,
            openedAt: undefined,
            currentOrderId: undefined,
          };
          syncTableCloud(freeT, prev.offlineMode);
          return freeT;
        }
        return t;
      });

      // Deduct inventory by recipes
      const stockLogs = [...prev.stockHistory];
      const ingredients = prev.ingredients.map((ing) => ({ ...ing }));
      for (const line of ord.items.filter((l) => !l.voided)) {
        const recipe = prev.recipes.find((r) => r.menuItemId === line.menuItemId);
        if (!recipe) continue;
        for (const rLine of recipe.lines) {
          const targetIng = ingredients.find((i) => i.id === rLine.ingredientId);
          if (targetIng) {
            const deduct = rLine.qtyPerPortion * line.qty;
            targetIng.onHand = Math.max(0, roundCurrency(targetIng.onHand - deduct));
            targetIng.used7d = roundCurrency(targetIng.used7d + deduct);
            stockLogs.unshift({
              id: `sh_${Date.now()}_${Math.random()}`,
              ingredientId: targetIng.id,
              ingredientName: targetIng.nameEn,
              type: 'sale_deduct',
              qtyDelta: -deduct,
              note: `Bill #${ord.orderNumber}`,
              createdAt: nowIso,
            });
          }
        }
      }

      // Deduct prepaid pack use if used
      const customerPacks = prev.customerPacks.map((p) =>
        p.id === ord.prepaidCustomerPackId ? { ...p, usesLeft: Math.max(0, p.usesLeft - 1) } : p
      );

      // Update member points (no points if offline)
      const members = prev.members.map((m) => {
        if (prev.offlineMode || !ord.memberPhone || m.phone !== ord.memberPhone) return m;
        const earned = Math.floor(updatedOrder.totalUsd * branch.pointsPerDollar);
        const nextPoints = Math.max(0, m.points - ord.pointsRedeemed + earned);
        const nextSpent = roundCurrency(m.totalSpentUsd + updatedOrder.totalUsd);
        const tier: 'Member' | 'Silver' | 'Gold' =
          nextSpent >= 500 ? 'Gold' : nextSpent >= 100 ? 'Silver' : 'Member';
        return { ...m, points: nextPoints, totalSpentUsd: nextSpent, tier, lastVisit: nowIso.slice(0, 10) };
      });

      // Issue VAT invoice
      const seqStr = String(prev.nextInvoiceSeq).padStart(6, '0');
      const invoiceNo = `${branch.code}XX-2026-${seqStr}`;
      const exclVat = roundCurrency(updatedOrder.totalUsd / (1 + branch.vatPercent / 100));
      const vatAmt = roundCurrency(updatedOrder.totalUsd - exclVat);
      const newInv: VatInvoice = {
        id: `inv_${Date.now()}`,
        branchId: branch.id,
        date: nowIso.slice(0, 10),
        invoiceNo,
        invoiceType: 'commercial',
        buyerName: '—',
        buyerVattin: '',
        exclVatUsd: exclVat,
        vatUsd: vatAmt,
        totalUsd: updatedOrder.totalUsd,
        totalKhr: updatedOrder.totalKhr,
        status: 'issued',
        orderId: ord.id,
      };

      // Update daily revenue history last bucket
      const dailyRevenueHistory = prev.dailyRevenueHistory.map((d, idx) =>
        idx === prev.dailyRevenueHistory.length - 1
          ? {
              ...d,
              netSalesUsd: roundCurrency(d.netSalesUsd + exclVat),
              bills: d.bills + 1,
              guests: d.guests + ord.guests,
            }
          : d
      );

      // Update active shift expected cash
      const shifts = prev.shifts.map((s) => {
        if (s.status !== 'open' || s.branchId !== branch.id) return s;
        if (params.method !== 'Cash' && params.method !== 'Split') return s;
        return {
          ...s,
          expectedUsd: roundCurrency(s.expectedUsd + params.paidUsd - params.changeUsd),
          expectedKhr: Math.round(s.expectedKhr + params.paidKhr - params.changeKhr),
        };
      });

      // Automated Double-Entry General Ledger posting (Sales + Output VAT + Recipe COGS)
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const orderWithTax: PosOrder = {
        ...updatedOrder,
        vatUsd: vatAmt,
      };
      let nextJournalEntries = prev.journalEntries || [];
      let nextJournalSeq = jeSeq;
      try {
        const saleJe = buildPosOrderSaleJournal({
          entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
          order: orderWithTax,
          accounts: coa,
          recipes: prev.recipes,
          ingredients: prev.ingredients,
          exchangeRate: branch.exchangeRate,
          postedBy: activeStaff.name,
          date: nowIso.slice(0, 10),
        });
        if (saleJe) {
          nextJournalEntries = [saleJe, ...nextJournalEntries];
          nextJournalSeq = jeSeq + 1;
        }
      } catch {
        // Keep POS settlement non-blocking
      }

      return {
        ...prev,
        orders: prev.orders.map((o) => (o.id === orderId ? updatedOrder : o)),
        tables,
        ingredients,
        stockHistory: stockLogs.slice(0, 50),
        customerPacks,
        members,
        invoices: [newInv, ...prev.invoices],
        nextInvoiceSeq: prev.nextInvoiceSeq + 1,
        accounts: coa,
        journalEntries: nextJournalEntries,
        nextJournalSeq,
        dailyRevenueHistory,
        shifts,
        displayActiveOrderId: null,
        displayShowKhqr: false,
      };
    });

    setSelectedTableId(null);
    setActiveOrderId(null);
    setReceiptOrder(updatedOrder);
  };

  const submitGuestQrOrder: PosContextValue['submitGuestQrOrder'] = (payload) => {
    const num = state.nextOrderNumber;
    const qrItem: QrIncomingOrder = {
      ...payload,
      id: `qr_${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: activeBranch.qrMode === 'auto' ? 'accepted' : 'pending',
    };

    if (activeBranch.qrMode === 'auto') {
      const ordId = `ord_qr_${Date.now()}`;
      const lines: OrderLineItem[] = payload.items.map((it, idx) => ({
        id: `oi_qr_${Date.now()}_${idx}`,
        menuItemId: it.menuItemId,
        nameEn: it.nameEn,
        nameKh: it.nameKh,
        nameVi: it.nameVi,
        unitPriceUsd: it.unitPriceUsd,
        qty: it.qty,
        station: it.station,
        category: it.category,
        optionLabel: it.optionLabel,
        orderedBy: it.orderedBy,
        round: 1,
        sentToKitchen: true,
        kdsStatus: 'new',
      }));
      const ord = recomputeOrderTotals(
        {
          id: ordId,
          branchId: payload.branchId,
          orderNumber: num,
          tableId: payload.tableId,
          tableName: payload.tableName,
          channel: payload.channel,
          status: 'sent',
          guests: 1,
          items: lines,
          currentRound: 1,
          manualDiscountPercent: 0,
          manualDiscountUsd: 0,
          promoDiscountUsd: 0,
          pointsRedeemed: 0,
          memberPhone: payload.phone,
          depositAppliedUsd: 0,
          totalUsd: 0,
          totalKhr: 0,
          paidUsd: 0,
          paidKhr: 0,
          changeUsd: 0,
          changeKhr: 0,
          cashierName: 'QR Self-Order',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        activeBranch
      );
      setState((prev) => ({
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        orders: [ord, ...prev.orders],
        qrQueue: [qrItem, ...prev.qrQueue],
      }));
    } else {
      setState((prev) => ({
        ...prev,
        nextOrderNumber: prev.nextOrderNumber + 1,
        qrQueue: [qrItem, ...prev.qrQueue],
      }));
    }
    return num;
  };

  const acceptQrOrder = (qrId: string) => {
    setState((prev) => {
      const qr = prev.qrQueue.find((q) => q.id === qrId);
      if (!qr || qr.status !== 'pending') return prev;
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const existingTableOrder = qr.tableId
        ? prev.orders.find((o) => o.tableId === qr.tableId && o.status !== 'paid' && o.status !== 'voided')
        : null;

      const newLines: OrderLineItem[] = qr.items.map((it, idx) => ({
        id: `oi_qr_${Date.now()}_${idx}`,
        menuItemId: it.menuItemId,
        nameEn: it.nameEn,
        nameKh: it.nameKh,
        nameVi: it.nameVi,
        unitPriceUsd: it.unitPriceUsd,
        qty: it.qty,
        station: it.station,
        category: it.category,
        optionLabel: it.optionLabel,
        orderedBy: it.orderedBy,
        note: qr.note,
        round: existingTableOrder ? existingTableOrder.currentRound : 1,
        sentToKitchen: true,
        kdsStatus: 'new',
      }));

      let nextOrders: PosOrder[];
      let nextTables = prev.tables;
      let nextOrderNum = prev.nextOrderNumber;

      if (existingTableOrder) {
        nextOrders = prev.orders.map((o) =>
          o.id === existingTableOrder.id
            ? recomputeOrderTotals(
                { ...o, items: [...o.items, ...newLines], status: 'sent' },
                branch
              )
            : o
        );
      } else {
        const newId = `ord_qr_${Date.now()}`;
        const created = recomputeOrderTotals(
          {
            id: newId,
            branchId: qr.branchId,
            orderNumber: prev.nextOrderNumber,
            tableId: qr.tableId,
            tableName: qr.tableName,
            channel: qr.channel,
            status: 'sent',
            guests: 2,
            items: newLines,
            currentRound: 1,
            manualDiscountPercent: 0,
            manualDiscountUsd: 0,
            promoDiscountUsd: 0,
            pointsRedeemed: 0,
            memberPhone: qr.phone,
            depositAppliedUsd: 0,
            totalUsd: 0,
            totalKhr: 0,
            paidUsd: 0,
            paidKhr: 0,
            changeUsd: 0,
            changeKhr: 0,
            cashierName: 'QR Approved',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          branch
        );
        nextOrders = [created, ...prev.orders];
        nextOrderNum += 1;
        if (qr.tableId) {
          nextTables = prev.tables.map((t) =>
            t.id === qr.tableId
              ? { ...t, status: 'occupied' as const, currentOrderId: newId, openedAt: new Date().toISOString() }
              : t
          );
        }
      }

      return {
        ...prev,
        nextOrderNumber: nextOrderNum,
        orders: nextOrders,
        tables: nextTables,
        qrQueue: prev.qrQueue.map((q) => (q.id === qrId ? { ...q, status: 'accepted' } : q)),
      };
    });
  };

  const rejectQrOrder = (qrId: string) => {
    setState((prev) => ({
      ...prev,
      qrQueue: prev.qrQueue.map((q) => (q.id === qrId ? { ...q, status: 'rejected' } : q)),
    }));
  };

  const createGroupSession = (groupName: string, organiserName: string, pickupTime: string) => {
    const id = `grp_${Date.now().toString(36)}`;
    setState((prev) => ({
      ...prev,
      groupSessions: [
        {
          id,
          branchId: prev.activeBranchId,
          groupName,
          organiserName,
          pickupTime,
          items: [],
          submitted: false,
          createdAt: new Date().toISOString(),
        },
        ...prev.groupSessions,
      ],
    }));
    return id;
  };

  const addGroupSessionItem = (
    sessionId: string,
    participantName: string,
    item: MenuItem,
    note?: string
  ) => {
    setState((prev) => ({
      ...prev,
      groupSessions: prev.groupSessions.map((g) => {
        if (g.id !== sessionId || g.submitted) return g;
        return {
          ...g,
          items: [
            ...g.items,
            {
              id: `gi_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
              participantName,
              menuItemId: item.id,
              nameEn: item.nameEn,
              unitPriceUsd: item.priceUsd,
              qty: 1,
              note,
            },
          ],
        };
      }),
    }));
  };

  const submitGroupSessionToPos = (sessionId: string): number | null => {
    const session = state.groupSessions.find((g) => g.id === sessionId);
    if (!session || session.submitted || session.items.length === 0) return null;
    const ordNum = state.nextOrderNumber;
    const ordId = `ord_grp_${Date.now()}`;
    const lines: OrderLineItem[] = session.items.map((gi) => {
      const m = state.menuItems.find((mi) => mi.id === gi.menuItemId);
      return {
        id: `oi_${gi.id}`,
        menuItemId: gi.menuItemId,
        nameEn: gi.nameEn,
        nameKh: m?.nameKh || gi.nameEn,
        nameVi: m?.nameVi || gi.nameEn,
        unitPriceUsd: gi.unitPriceUsd,
        qty: gi.qty,
        station: m?.station || 'kitchen',
        category: m?.category || 'Main dishes',
        note: gi.note,
        orderedBy: gi.participantName,
        round: 1,
        sentToKitchen: true,
        kdsStatus: 'new',
      };
    });

    const newOrd = recomputeOrderTotals(
      {
        id: ordId,
        branchId: session.branchId,
        orderNumber: ordNum,
        tableName: `Group · ${session.groupName} (${session.pickupTime})`,
        channel: 'group',
        status: 'sent',
        guests: session.items.length,
        items: lines,
        currentRound: 1,
        manualDiscountPercent: 0,
        manualDiscountUsd: 0,
        promoDiscountUsd: 0,
        pointsRedeemed: 0,
        depositAppliedUsd: 0,
        totalUsd: 0,
        totalKhr: 0,
        paidUsd: 0,
        paidKhr: 0,
        changeUsd: 0,
        changeKhr: 0,
        cashierName: 'Group Link',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      activeBranch
    );

    setState((prev) => ({
      ...prev,
      nextOrderNumber: prev.nextOrderNumber + 1,
      orders: [newOrd, ...prev.orders],
      groupSessions: prev.groupSessions.map((g) =>
        g.id === sessionId ? { ...g, submitted: true, orderNumber: ordNum } : g
      ),
    }));
    return ordNum;
  };

  const createReservation: PosContextValue['createReservation'] = (payload) => {
    const code = Math.random().toString(36).substring(2, 8).toUpperCase();
    const res: Reservation = {
      ...payload,
      id: `res_${Date.now()}`,
      code,
      createdAt: new Date().toISOString(),
    };
    setState((prev) => ({ ...prev, reservations: [res, ...prev.reservations] }));
  };

  const confirmReservation = (resId: string) => {
    setState((prev) => ({
      ...prev,
      reservations: prev.reservations.map((r) => (r.id === resId ? { ...r, status: 'confirmed' } : r)),
    }));
  };

  const payReservationDeposit = (resId: string) => {
    setState((prev) => ({
      ...prev,
      reservations: prev.reservations.map((r) => (r.id === resId ? { ...r, depositPaid: true } : r)),
    }));
  };

  const seatReservation = (resId: string, tableId: string) => {
    const res = state.reservations.find((r) => r.id === resId);
    if (!res) return;
    const ordId = openTableOrder(tableId);
    setState((prev) => {
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      return {
        ...prev,
        reservations: prev.reservations.map((r) =>
          r.id === resId ? { ...r, status: 'seated', tableId } : r
        ),
        orders: prev.orders.map((o) =>
          o.id === ordId
            ? recomputeOrderTotals(
                {
                  ...o,
                  guests: res.guests,
                  depositAppliedUsd: res.depositPaid ? res.depositUsd : 0,
                  reservationId: res.id,
                },
                branch
              )
            : o
        ),
      };
    });
    setNavSection('sell');
  };

  const cancelReservation = (resId: string, noShow = false) => {
    setState((prev) => ({
      ...prev,
      reservations: prev.reservations.map((r) =>
        r.id === resId ? { ...r, status: noShow ? 'no_show' : 'cancelled' } : r
      ),
    }));
  };

  const openShift = (openingUsd: number, openingKhr: number) => {
    const newShift: ShiftRecord = {
      id: `shift_${Date.now()}`,
      branchId: state.activeBranchId,
      cashierName: activeStaff.name,
      status: 'open',
      openingUsd,
      openingKhr,
      countedUsd: 0,
      countedKhr: 0,
      expectedUsd: openingUsd,
      expectedKhr: openingKhr,
      varianceUsd: 0,
      varianceKhr: 0,
      pettyCash: [],
      openedAt: new Date().toISOString(),
    };
    setState((prev) => {
      const log = appendAudit(
        prev,
        'Shift opened',
        `Opening float $${openingUsd.toFixed(2)} + ${openingKhr.toLocaleString()} ៛`
      );
      return {
        ...prev,
        shifts: [newShift, ...prev.shifts],
        auditLogs: [log, ...prev.auditLogs],
      };
    });
  };

  const addPettyCash: PosContextValue['addPettyCash'] = (entry) => {
    setState((prev) => {
      const fullEntry: PettyCashEntry = {
        ...entry,
        id: `pc_${Date.now()}`,
        actorName: activeStaff.name,
        createdAt: new Date().toISOString(),
      };
      const shifts = prev.shifts.map((s) => {
        if (s.status !== 'open' || s.branchId !== prev.activeBranchId) return s;
        const deltaUsd = entry.currency === 'USD' ? (entry.type === 'in' ? entry.amount : -entry.amount) : 0;
        const deltaKhr = entry.currency === 'KHR' ? (entry.type === 'in' ? entry.amount : -entry.amount) : 0;
        return {
          ...s,
          expectedUsd: roundCurrency(s.expectedUsd + deltaUsd),
          expectedKhr: Math.round(s.expectedKhr + deltaKhr),
          pettyCash: [fullEntry, ...s.pettyCash],
        };
      });
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const amtInUsd =
        entry.currency === 'USD'
          ? entry.amount
          : roundCurrency(entry.amount / Math.max(1000, branch?.exchangeRate || 4100));
      const cashJe = buildShiftCashJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        branchId: prev.activeBranchId,
        kind: entry.type === 'in' ? 'cash_in' : 'cash_out',
        amountUsd: amtInUsd,
        reason: entry.note || 'Petty cash adjustment',
        accounts: coa,
        exchangeRate: branch?.exchangeRate || 4100,
        postedBy: activeStaff.name,
      });

      return {
        ...prev,
        shifts,
        accounts: coa,
        journalEntries: cashJe
          ? [cashJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: cashJe ? jeSeq + 1 : jeSeq,
      };
    });
  };

  const closeShift = (countedUsd: number, countedKhr: number, managerPin?: string): boolean => {
    const current = state.shifts.find((s) => s.status === 'open' && s.branchId === state.activeBranchId);
    if (!current) return false;

    // Exact variance against tracked current.expectedUsd / current.expectedKhr (fixes clamping bug when petty cash out > cash sales)
    const varianceUsd = roundCurrency(countedUsd - current.expectedUsd);
    const varianceKhr = Math.round(countedKhr - current.expectedKhr);
    const varianceTotalInUsd = roundCurrency(
      varianceUsd + varianceKhr / Math.max(1000, activeBranch.exchangeRate)
    );

    if (Math.abs(varianceTotalInUsd) > activeBranch.varianceLimitUsd) {
      if (!managerPin || !verifyManagerPin(managerPin)) {
        return false;
      }
    }

    setState((prev) => {
      const closed: ShiftRecord = {
        ...current,
        status: 'closed',
        countedUsd,
        countedKhr,
        varianceUsd,
        varianceKhr,
        closedAt: new Date().toISOString(),
      };
      const log = appendAudit(
        prev,
        'Shift closed',
        `Counted $${countedUsd.toFixed(2)} & ${countedKhr.toLocaleString()} ៛ (variance $${varianceUsd.toFixed(2)} / ${varianceKhr.toLocaleString()} ៛)`,
        Math.abs(varianceTotalInUsd) > 0.01 ? 'warning' : 'info'
      );
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const varJe = buildShiftCashJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        branchId: prev.activeBranchId,
        kind: 'variance',
        amountUsd: varianceTotalInUsd,
        reason: `Shift #${current.id.slice(-4)} reconciliation`,
        accounts: coa,
        exchangeRate: activeBranch.exchangeRate,
        postedBy: activeStaff.name,
      });
      return {
        ...prev,
        shifts: prev.shifts.map((s) => (s.id === current.id ? closed : s)),
        auditLogs: [log, ...prev.auditLogs],
        accounts: coa,
        journalEntries: varJe
          ? [varJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: varJe ? jeSeq + 1 : jeSeq,
      };
    });
    notify('Shift closed & Z-report logged to SQLite.', 'success');
    return true;
  };

  const addIngredient: PosContextValue['addIngredient'] = (ing) => {
    const newIng: Ingredient = {
      ...ing,
      id: `ing_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      branchId: state.activeBranchId,
      used7d: 0,
    };
    setState((prev) => ({ ...prev, ingredients: [newIng, ...prev.ingredients] }));
  };

  const recordIngredientPurchase = (ingredientId: string, qtyAdded: number, totalCostUsd: number) => {
    setState((prev) => {
      const ing = prev.ingredients.find((i) => i.id === ingredientId);
      if (!ing || qtyAdded <= 0) return prev;
      const oldValue = ing.onHand * ing.avgCostUsd;
      const nextOnHand = ing.onHand + qtyAdded;
      const nextAvgCost = (oldValue + totalCostUsd) / nextOnHand;
      const updated = { ...ing, onHand: nextOnHand, avgCostUsd: Number(nextAvgCost.toFixed(5)) };
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const invJe = buildInventoryDirectJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        branchId: ing.branchId,
        mode: 'purchase',
        ingredientName: ing.nameEn,
        amountUsd: totalCostUsd,
        accounts: coa,
        exchangeRate: branch?.exchangeRate || 4100,
        postedBy: activeStaff.name,
      });
      return {
        ...prev,
        ingredients: prev.ingredients.map((i) => (i.id === ingredientId ? updated : i)),
        accounts: coa,
        journalEntries: invJe
          ? [invJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: invJe ? jeSeq + 1 : jeSeq,
        stockHistory: [
          {
            id: `sh_${Date.now()}`,
            ingredientId,
            ingredientName: ing.nameEn,
            type: 'purchase',
            qtyDelta: qtyAdded,
            costUsd: totalCostUsd,
            note: 'Goods in purchase',
            createdAt: new Date().toISOString(),
          },
          ...prev.stockHistory,
        ],
      };
    });
  };

  const recordIngredientWaste = (ingredientId: string, qtyWasted: number, note: string) => {
    setState((prev) => {
      const ing = prev.ingredients.find((i) => i.id === ingredientId);
      if (!ing || qtyWasted <= 0) return prev;
      const updated = { ...ing, onHand: Math.max(0, ing.onHand - qtyWasted) };
      const wasteValueUsd = roundCurrency(qtyWasted * ing.avgCostUsd);
      const branch = prev.branches.find((b) => b.id === prev.activeBranchId) || prev.branches[0];
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const wasteJe = buildInventoryDirectJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        branchId: ing.branchId,
        mode: 'waste',
        ingredientName: ing.nameEn,
        amountUsd: wasteValueUsd,
        reason: note || 'Kitchen waste',
        accounts: coa,
        exchangeRate: branch?.exchangeRate || 4100,
        postedBy: activeStaff.name,
      });
      return {
        ...prev,
        ingredients: prev.ingredients.map((i) => (i.id === ingredientId ? updated : i)),
        accounts: coa,
        journalEntries: wasteJe
          ? [wasteJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: wasteJe ? jeSeq + 1 : jeSeq,
        stockHistory: [
          {
            id: `sh_${Date.now()}`,
            ingredientId,
            ingredientName: ing.nameEn,
            type: 'waste',
            qtyDelta: -qtyWasted,
            note: note || 'Kitchen waste',
            createdAt: new Date().toISOString(),
          },
          ...prev.stockHistory,
        ],
      };
    });
  };

  const recordStockCount = (ingredientId: string, actualQty: number) => {
    setState((prev) => {
      const ing = prev.ingredients.find((i) => i.id === ingredientId);
      if (!ing) return prev;
      const delta = actualQty - ing.onHand;
      const updated = { ...ing, onHand: Math.max(0, actualQty) };
      return {
        ...prev,
        ingredients: prev.ingredients.map((i) => (i.id === ingredientId ? updated : i)),
        stockHistory: [
          {
            id: `sh_${Date.now()}`,
            ingredientId,
            ingredientName: ing.nameEn,
            type: 'count_adjust',
            qtyDelta: delta,
            note: 'Physical stock count',
            createdAt: new Date().toISOString(),
          },
          ...prev.stockHistory,
        ],
      };
    });
  };

  const saveRecipe = (menuItemId: string, lines: { ingredientId: string; qtyPerPortion: number }[]) => {
    setState((prev) => {
      const exists = prev.recipes.some((r) => r.menuItemId === menuItemId);
      const recipes = exists
        ? prev.recipes.map((r) => (r.menuItemId === menuItemId ? { menuItemId, lines } : r))
        : [...prev.recipes, { menuItemId, lines }];
      return { ...prev, recipes };
    });
  };

  const saveMenuItem: PosContextValue['saveMenuItem'] = (item) => {
    setState((prev) => {
      const id = item.id || `m_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const initials = item.nameEn
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0]?.toUpperCase() || '')
        .join('');
      const full: MenuItem = {
        id,
        branchId: prev.activeBranchId,
        itemType: item.itemType === 'service' ? 'service' : 'product',
        nameEn: item.nameEn,
        nameKh: item.nameKh || item.nameEn,
        nameVi: item.nameVi || item.nameEn,
        description: item.description,
        category: item.category,
        priceUsd: item.priceUsd,
        station: item.station,
        imageUrl: item.imageUrl,
        initials: initials || 'MN',
        isBestSeller: item.isBestSeller ?? false,
        isNew: item.isNew ?? false,
        active: item.active ?? true,
        options: item.options,
        oftenOrderedWith: item.oftenOrderedWith,
      };
      const exists = prev.menuItems.some((m) => m.id === id);
      return {
        ...prev,
        menuItems: exists
          ? prev.menuItems.map((m) => (m.id === id ? full : m))
          : [full, ...prev.menuItems],
      };
    });
  };

  const deleteMenuItem = (itemId: string) => {
    setState((prev) => ({
      ...prev,
      menuItems: prev.menuItems.filter((m) => m.id !== itemId),
    }));
  };

  const importMenuItems: PosContextValue['importMenuItems'] = (items) => {
    setState((prev) => {
      const baseTs = Date.now();
      const created: MenuItem[] = items.map((it, idx) => {
        const initials = it.nameEn
          .split(' ')
          .slice(0, 2)
          .map((w) => w[0]?.toUpperCase() || '')
          .join('');
        return {
          id: `m_${baseTs}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
          branchId: prev.activeBranchId,
          itemType: 'product',
          nameEn: it.nameEn,
          nameKh: it.nameKh || it.nameEn,
          nameVi: it.nameVi || it.nameEn,
          category: it.category,
          priceUsd: it.priceUsd,
          station: it.station,
          initials: initials || 'MN',
          isBestSeller: false,
          isNew: true,
          active: true,
        };
      });
      return {
        ...prev,
        menuItems: [...created, ...prev.menuItems],
      };
    });
    notify(`Imported ${items.length} menu item(s) into SQLite!`, 'success');
  };

  const saveTable: PosContextValue['saveTable'] = (table) => {
    setState((prev) => {
      const id = table.id || `t_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const full: PosTable = {
        id,
        branchId: prev.activeBranchId,
        name: table.name,
        area: table.area,
        seats: table.seats,
        status: 'free',
      };
      const exists = prev.tables.some((t) => t.id === id);
      return {
        ...prev,
        tables: exists
          ? prev.tables.map((t) => (t.id === id ? { ...t, ...table } : t))
          : [...prev.tables, full],
      };
    });
  };

  const deleteTable = (tableId: string) => {
    const target = state.tables.find((t) => t.id === tableId);
    if (target && target.status !== 'free') {
      notify(`Cannot delete table ${target.name} while occupied.`, 'warning');
      return;
    }
    setState((prev) => ({
      ...prev,
      tables: prev.tables.filter((t) => t.id !== tableId),
    }));
  };

  const addLoyaltyMember: PosContextValue['addLoyaltyMember'] = ({
    name,
    phone,
    initialPoints = 0,
  }) => {
    const cleanPhone = phone.replace(/\s+/g, '').trim();
    const cleanName = name.trim();
    if (!cleanPhone || !cleanName) return null;
    const existing = state.members.find((m) => m.phone === cleanPhone);
    if (existing) {
      notify(`Member ${existing.name} (${cleanPhone}) is already enrolled.`, 'info');
      return existing;
    }
    const newMember: LoyaltyMember = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: cleanName,
      phone: cleanPhone,
      points: Math.max(0, Math.round(initialPoints)),
      totalSpentUsd: 0,
      tier: 'Member',
      lastVisit: new Date().toISOString().slice(0, 10),
    };
    setState((prev) => ({
      ...prev,
      members: [newMember, ...prev.members],
    }));
    notify(`Enrolled loyalty member ${cleanName}!`, 'success');
    return newMember;
  };

  const toggleTenantFeatureFlag = (moduleKey: string, enabled: boolean) => {
    setState((prev) => ({
      ...prev,
      featureFlags: {
        ...(prev.featureFlags || {}),
        [moduleKey]: enabled,
      },
    }));
  };

  const togglePromotion = (promoId: string) => {
    setState((prev) => ({
      ...prev,
      promotions: prev.promotions.map((p) => (p.id === promoId ? { ...p, active: !p.active } : p)),
    }));
  };

  const addPromotion = (promo: Omit<PromotionRule, 'id'>) => {
    const newPromo: PromotionRule = { ...promo, id: `promo_${Date.now()}` } as PromotionRule;
    setState((prev) => ({
      ...prev,
      promotions: [newPromo, ...prev.promotions],
    }));
  };

  const addPrepaidTemplate = (tpl: Omit<PrepaidPackTemplate, 'id'>) => {
    setState((prev) => ({
      ...prev,
      prepaidTemplates: [{ ...tpl, id: `pack_${Date.now()}` }, ...prev.prepaidTemplates],
    }));
  };

  const sellPrepaidPack = (templateId: string, customerName: string, phone: string) => {
    const tpl = state.prepaidTemplates.find((t) => t.id === templateId);
    if (!tpl) return;
    const expiry = new Date(Date.now() + tpl.validDays * 86400000).toISOString().slice(0, 10);
    const code = Math.random().toString(36).substring(2, 10).toUpperCase();
    setState((prev) => {
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const packJe = buildPrepaidPackSaleJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        branchId: prev.activeBranchId,
        packCode: code,
        customerName,
        priceUsd: tpl.priceUsd,
        accounts: coa,
        exchangeRate: activeBranch.exchangeRate,
        postedBy: activeStaff.name,
      });
      return {
        ...prev,
        accounts: coa,
        journalEntries: packJe
          ? [packJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: packJe ? jeSeq + 1 : jeSeq,
        customerPacks: [
          {
            id: `cpack_${Date.now()}`,
            templateId,
            packName: tpl.name,
            customerName,
            phone: phone.replace(/\s+/g, ''),
            code,
            usesLeft: tpl.totalUses,
            totalUses: tpl.totalUses,
            validUntil: expiry,
            branchName: activeBranch.name,
            active: true,
          },
          ...prev.customerPacks,
        ],
      };
    });
  };

  const voidCustomerPack = (packId: string) => {
    setState((prev) => {
      const log = appendAudit(prev, 'Void prepaid pack', `Voided pack ${packId}`, 'warning');
      return {
        ...prev,
        customerPacks: prev.customerPacks.map((p) => (p.id === packId ? { ...p, active: false } : p)),
        auditLogs: [log, ...prev.auditLogs],
      };
    });
  };

  const isAdminUser = useMemo(
    () =>
      isSuperAdmin(activeStaff) ||
      isCloudAdmin ||
      Boolean(firebaseUser && firebaseUser.role === 'admin'),
    [activeStaff, isCloudAdmin, firebaseUser]
  );

  const hasCurrentPermission = useCallback(
    (perm: PermissionKey) => hasPermission(activeStaff, perm, state.ownerPermissions),
    [activeStaff, state.ownerPermissions]
  );

  const saveStaffMember: PosContextValue['saveStaffMember'] = (member, targetTenantId) => {
    const currentTid = state.tenantId || activeTenantId;
    const tid = targetTenantId || currentTid;
    if (!isSuperAdmin(activeStaff) && tid !== currentTid) return;
    const targetTenant = tid === currentTid ? state : rawTenantStates[tid];
    if (!targetTenant) return;

    const actor = activeStaff;
    const isExisting = Boolean(member.id && targetTenant.staff.some((s) => s.id === member.id));
    const existingMember = member.id ? targetTenant.staff.find((s) => s.id === member.id) : undefined;

    if (!isExisting && !canAssignRole(actor, member.role, state.ownerPermissions)) {
      return;
    }
    if (
      isExisting &&
      existingMember &&
      actor.role !== 'admin' &&
      (existingMember.role === 'admin' || existingMember.role === 'owner' || member.role === 'admin' || member.role === 'owner')
    ) {
      return;
    }

    const id = member.id || `staff_${Date.now()}`;
    const permissions =
      member.role === 'admin'
        ? [...ALL_PERMISSIONS]
        : member.role === 'owner'
          ? [...(targetTenant.ownerPermissions ?? DEFAULT_OWNER_TENANT_PERMISSIONS)]
          : normalizePermissions(
              member.permissions ?? existingMember?.permissions ?? DEFAULT_ROLE_PERMISSIONS[member.role],
              false
            );
    const full: StaffMember = {
      ...member,
      id,
      isDemo: member.isDemo ?? existingMember?.isDemo ?? false,
      permissions,
      lastSignIn:
        existingMember?.lastSignIn || new Date().toISOString().slice(0, 16).replace('T', ' '),
    };

    const applyUpdate = (prev: PosAppState): PosAppState => {
      const exists = prev.staff.some((s) => s.id === id);
      const staff = exists ? prev.staff.map((s) => (s.id === id ? full : s)) : [...prev.staff, full];
      return { ...prev, staff };
    };

    if (tid === currentTid) {
      setState(applyUpdate);
    } else {
      const nextRemote = applyUpdate(targetTenant);
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tid]: nextRemote,
      }));
      void saveTenantToSqlite(nextRemote, {
        staffRole: activeStaff.role,
        adminPin: activeStaff.pin,
      }).catch(() => {});
    }
  };

  const updateStaffPermissions: PosContextValue['updateStaffPermissions'] = (
    staffId,
    nextPermissions,
    targetTenantId
  ) => {
    const currentTid = state.tenantId || activeTenantId;
    const tid = targetTenantId || currentTid;
    if (!isSuperAdmin(activeStaff) && tid !== currentTid) return false;
    const targetTenant = tid === currentTid ? state : rawTenantStates[tid];
    if (!targetTenant) return false;
    const targetMember = targetTenant.staff.find((s) => s.id === staffId);
    if (!targetMember || targetMember.role === 'admin') return false;

    const actor = activeStaff;
    if (targetMember.role === 'owner') {
      if (!canManageOwnerGrants(actor)) return false;
      return updateTenantOwnerPermissions(tid, nextPermissions);
    }

    const currentEffective = getEffectivePermissions(targetMember, targetTenant.ownerPermissions);
    const normalizedNext = normalizePermissions(nextPermissions, false);

    // Check every added/removed permission against actor's grant authority
    const allChanged = new Set<PermissionKey>([...currentEffective, ...normalizedNext]);
    for (const perm of allChanged) {
      const was = currentEffective.includes(perm);
      const willBe = normalizedNext.includes(perm);
      if (was !== willBe && !canGrantPermission(actor, targetMember, perm, state.ownerPermissions)) {
        return false;
      }
    }

    const applyUpdate = (prev: PosAppState): PosAppState => {
      const log = appendAudit(
        prev,
        'Staff permissions updated',
        `${actor.name} updated ${targetMember.name} (${normalizedNext.length} permissions)`,
        'warning'
      );
      return {
        ...prev,
        staff: prev.staff.map((s) =>
          s.id === staffId ? { ...s, permissions: normalizedNext } : s
        ),
        auditLogs: [log, ...prev.auditLogs],
      };
    };

    if (tid === currentTid) {
      setState(applyUpdate);
    } else {
      const nextRemote = applyUpdate(targetTenant);
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tid]: nextRemote,
      }));
      void saveTenantToSqlite(nextRemote, {
        staffRole: activeStaff.role,
        adminPin: activeStaff.pin,
      }).catch(() => {});
    }

    return true;
  };

  const updateTenantOwnerPermissions: PosContextValue['updateTenantOwnerPermissions'] = (
    tenantId,
    ownerPermissions
  ) => {
    if (!canManageOwnerGrants(activeStaff)) return false;
    const currentTid = state.tenantId || activeTenantId;
    const targetTenant = tenantId === currentTid ? state : rawTenantStates[tenantId];
    if (!targetTenant) return false;

    const normalized = normalizePermissions(ownerPermissions, false);
    const applyUpdate = (prev: PosAppState): PosAppState => {
      const log = appendAudit(
        prev,
        'Tenant owner grants updated',
        `${activeStaff.name} set owner permissions for ${prev.shopName} (${normalized.length} granted)`,
        'warning'
      );
      return {
        ...prev,
        ownerPermissions: normalized,
        staff: prev.staff.map((s) =>
          s.role === 'owner' ? { ...s, permissions: normalized } : s
        ),
        auditLogs: [log, ...prev.auditLogs],
      };
    };

    if (tenantId === currentTid) {
      setState(applyUpdate);
    } else {
      const nextRemote = applyUpdate(targetTenant);
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tenantId]: nextRemote,
      }));
      void saveTenantToSqlite(nextRemote, {
        staffRole: activeStaff.role,
        adminPin: activeStaff.pin,
      }).catch(() => {});
    }

    return true;
  };

  const grantAllStaffInTenant: PosContextValue['grantAllStaffInTenant'] = (targetTenantId) => {
    const currentTid = state.tenantId || activeTenantId;
    const tid = targetTenantId || currentTid;
    if (!isSuperAdmin(activeStaff) && tid !== currentTid) return false;
    const targetTenant = tid === currentTid ? state : rawTenantStates[tid];
    if (!targetTenant) return false;
    if (activeStaff.role !== 'admin' && !hasPermission(activeStaff, 'permissions_grant', state.ownerPermissions)) {
      return false;
    }
    const maxPool =
      activeStaff.role === 'admin'
        ? [...DEFAULT_OWNER_TENANT_PERMISSIONS]
        : getEffectivePermissions(activeStaff, state.ownerPermissions).filter((p) => p !== 'full_admin');

    const applyUpdate = (prev: PosAppState): PosAppState => {
      const nextOwnerPerms =
        activeStaff.role === 'admin' ? [...DEFAULT_OWNER_TENANT_PERMISSIONS] : prev.ownerPermissions;
      const log = appendAudit(
        prev,
        'Bulk full grant',
        `${activeStaff.name} granted maximum available permissions to team in ${prev.shopName}`,
        'warning'
      );
      return {
        ...prev,
        ownerPermissions: nextOwnerPerms,
        staff: prev.staff.map((s) => {
          if (s.role === 'admin') return { ...s, permissions: [...ALL_PERMISSIONS] };
          if (s.role === 'owner') {
            return activeStaff.role === 'admin' ? { ...s, permissions: [...DEFAULT_OWNER_TENANT_PERMISSIONS] } : s;
          }
          return { ...s, permissions: [...maxPool] };
        }),
        auditLogs: [log, ...prev.auditLogs],
      };
    };

    if (tid === currentTid) {
      setState(applyUpdate);
    } else {
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tid]: prevMap[tid] ? applyUpdate(prevMap[tid]) : prevMap[tid],
      }));
    }
    return true;
  };

  const updateBranchSettingsForTenant: PosContextValue['updateBranchSettingsForTenant'] = (
    tenantId,
    branchId,
    partial
  ) => {
    const currentTid = state.tenantId || activeTenantId;
    if (
      !canEditTenantBranchSettings(
        activeStaff,
        tenantId,
        currentTid,
        state.ownerPermissions
      )
    ) {
      return false;
    }
    const targetTenant =
      tenantId === currentTid ? state : rawTenantStates[tenantId];
    if (!targetTenant) return false;
    const applyUpdate = (prev: PosAppState): PosAppState => {
      const branches = prev.branches.map((b) =>
        b.id === branchId ? { ...b, ...partial } : b
      );
      return { ...prev, branches };
    };
    if (tenantId === currentTid) {
      setState(applyUpdate);
    } else {
      const nextRemote = applyUpdate(targetTenant);
      setRawTenantStates((prevMap) => ({
        ...prevMap,
        [tenantId]: nextRemote,
      }));
      void saveTenantToSqlite(nextRemote, {
        staffRole: activeStaff.role,
        adminPin: activeStaff.pin,
      }).catch(() => {});
    }
    return true;
  };

  const switchActiveStaff = (staffId: string, pin: string): boolean => {
    const target = state.staff.find((s) => s.id === staffId && s.active);
    if (!target || target.pin !== pin) return false;
    const authCheck = canActorAuthenticateInTenant({
      member: target,
      tenant: state,
      platform: platformSettings,
    });
    if (!authCheck.ok) return false;
    setState((prev) => ({ ...prev, activeStaffId: staffId }));
    if (!canAccessNavSection(target, navSection, state.ownerPermissions)) {
      setNavSection(getFirstAllowedNavSection(target, state.ownerPermissions));
    }
    return true;
  };

  const issueTaxInvoice = (invoiceId: string, buyerName: string, buyerVattin: string) => {
    setState((prev) => {
      const orig = prev.invoices.find((i) => i.id === invoiceId);
      if (!orig) return prev;
      const seqStr = String(prev.nextInvoiceSeq).padStart(6, '0');
      const branch = prev.branches.find((b) => b.id === orig.branchId) || prev.branches[0];
      const replacement: VatInvoice = {
        ...orig,
        id: `inv_${Date.now()}`,
        invoiceNo: `${branch.code}XX-2026-${seqStr}`,
        invoiceType: 'tax',
        buyerName,
        buyerVattin,
        status: 'issued',
        replacesInvoiceNo: orig.invoiceNo,
      };
      return {
        ...prev,
        nextInvoiceSeq: prev.nextInvoiceSeq + 1,
        invoices: [
          replacement,
          ...prev.invoices.map((i) => (i.id === invoiceId ? { ...i, status: 'replaced' as const } : i)),
        ],
      };
    });
  };

  const createCreditNote = (invoiceId: string) => {
    setState((prev) => {
      const orig = prev.invoices.find((i) => i.id === invoiceId);
      if (!orig) return prev;
      const seqStr = String(prev.nextInvoiceSeq).padStart(6, '0');
      const branch = prev.branches.find((b) => b.id === orig.branchId) || prev.branches[0];
      const cn: VatInvoice = {
        ...orig,
        id: `inv_cn_${Date.now()}`,
        invoiceNo: `${branch.code}CN-2026-${seqStr}`,
        invoiceType: 'credit_note',
        status: 'issued',
        replacesInvoiceNo: orig.invoiceNo,
      };
      const log = appendAudit(prev, 'Credit note issued', `Credit note for ${orig.invoiceNo}`, 'warning');
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const refundJe = buildPosRefundJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        branchId: orig.branchId,
        invoiceNo: cn.invoiceNo,
        exclVatUsd: orig.exclVatUsd,
        vatUsd: orig.vatUsd,
        totalUsd: orig.totalUsd,
        accounts: coa,
        exchangeRate: branch?.exchangeRate || 4100,
        postedBy: activeStaff.name,
      });
      return {
        ...prev,
        nextInvoiceSeq: prev.nextInvoiceSeq + 1,
        invoices: [cn, ...prev.invoices],
        auditLogs: [log, ...prev.auditLogs],
        accounts: coa,
        journalEntries: refundJe
          ? [refundJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: refundJe ? jeSeq + 1 : jeSeq,
      };
    });
  };

  const updateBranchSettings = (partial: Partial<BranchConfig>) => {
    if (!canEditSettings(activeStaff, state.ownerPermissions)) return;
    setState((prev) => {
      const branches = prev.branches.map((b) =>
        b.id === prev.activeBranchId ? { ...b, ...partial } : b
      );
      return { ...prev, branches };
    });
  };

  const addBranch = (
    name: string,
    code: string,
    address?: string,
    cloneFromCurrent = true
  ) => {
    const cleanCode = code.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'BRN';
    const newBranchId = `branch_${cleanCode.toLowerCase()}_${Date.now().toString(36)}`;
    const newBranch: BranchConfig = {
      ...activeBranch,
      id: newBranchId,
      name: name.trim(),
      code: cleanCode,
      address: address?.trim() || activeBranch.address,
      invoiceTemplate: normalizeInvoiceTemplate(
        { ...activeBranch.invoiceTemplate, invoicePrefix: cleanCode },
        { shopName: name.trim(), branchCode: cleanCode, businessType: state.businessType }
      ),
    };
    setState((prev) => {
      const withBranch: PosAppState = {
        ...prev,
        branches: [...prev.branches, newBranch],
        activeBranchId: newBranchId,
      };
      return cloneFromCurrent
        ? cloneBranchResources(withBranch, prev.activeBranchId, newBranchId)
        : withBranch;
    });
    setSelectedTableId(null);
    setActiveOrderId(null);
    notify(`Created branch "${name.trim()}" (${cleanCode}) in SQLite!`, 'success');
  };

  const setPlan = (plan: SubscriptionPlan) => {
    setState((prev) => ({ ...prev, plan }));
  };

  const activateTenantSubscription: PosContextValue['activateTenantSubscription'] = (params) => {
    const tid = state.tenantId || activeTenantId;
    setState((prev) => {
      const nextDays = calculateExtendedDays(
        prev.planDaysLeft,
        prev.subscriptionStatus,
        params.days
      );
      const expiresAt = new Date(Date.now() + nextDays * 86400000).toISOString();
      const log = appendAudit(
        prev,
        'Subscription paid (Bakong KHQR)',
        `Plan ${params.plan.toUpperCase()} +${params.days}d ($${params.amountUsd.toFixed(2)}) · Ref ${params.paymentRef}`,
        'info'
      );
      return {
        ...prev,
        plan: params.plan,
        planDaysLeft: nextDays,
        subscriptionStatus: 'active',
        subscriptionRef: params.paymentRef,
        subscriptionPaidUsd: Number(((prev.subscriptionPaidUsd ?? 0) + params.amountUsd).toFixed(2)),
        subscriptionExpiresAt: expiresAt,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    if (tid && !state.offlineMode) {
      skipSqlitePushRef.current = true;
      void activateSubscriptionInSqlite({
        tenantId: tid,
        businessCode: state.businessCode,
        plan: params.plan,
        days: params.days,
        paymentRef: params.paymentRef,
        amountUsd: params.amountUsd,
        actorName: activeStaff.name,
      })
        .then((saved) => {
          skipSqlitePushRef.current = true;
          const normalized = normalizeTenantRbac(saved);
          setRawTenantStates((prev) => ({ ...prev, [tid]: normalized }));
          setState((prev) => ({ ...normalized, activeStaffId: prev.activeStaffId }));
          notify(`Subscription activated (${params.plan.toUpperCase()}) in SQLite!`, 'success');
        })
        .catch(() => {});
    }
  };

  const toggleOfflineMode = () => {
    setState((prev) => {
      const nextOffline = !prev.offlineMode;
      notify(
        nextOffline
          ? 'Switched to Offline Queue mode (local cache active)'
          : 'Back online — syncing queued bills to SQLite',
        nextOffline ? 'warning' : 'success'
      );
      return { ...prev, offlineMode: nextOffline };
    });
  };

  const syncOfflineBills = () => {
    setState((prev) => ({
      ...prev,
      offlineMode: false,
      orders: prev.orders.map((o) => ({ ...o, offlinePendingSync: false })),
    }));
    notify('All queued bills synced to SQLite!', 'success');
  };

  const setDisplayOrder = useCallback((orderId: string | null, showKhqr: boolean) => {
    setState((prev) => {
      if (prev.displayActiveOrderId === orderId && prev.displayShowKhqr === showKhqr) {
        return prev;
      }
      return { ...prev, displayActiveOrderId: orderId, displayShowKhqr: showKhqr };
    });
  }, []);

  const resetDemoData = () => {
    if (!canStartDemoMode(platformSettings)) return;
    if (isSuperAdmin(activeStaff)) {
      notify('Store operational data is disabled on Super Admin accounts.', 'warning');
      return;
    }
    if (!state.isDemoTenant) return;
    const fresh = createSeedState('restaurant');
    setState(fresh);
    setActiveTenantId(fresh.tenantId || 'tenant_lotus_bkk1');
    setSelectedTableId(null);
    setActiveOrderId(null);
    notify('Demo Store sandbox reset to clean sample data!', 'success');
  };

  // -------------------------------------------------------------------------
  // Procurement & Supplier Purchase Orders (PO) Actions
  // -------------------------------------------------------------------------
  const saveSupplier: PosContextValue['saveSupplier'] = (sup) => {
    if (isSuperAdmin(activeStaff)) return;
    setState((prev) => {
      const existingList = prev.suppliers || [];
      const id = sup.id || `sup_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
      const exists = existingList.find((s) => s.id === id);
      const record: Supplier = {
        ...sup,
        id,
        branchId: sup.branchId || 'all',
        name: sup.name.trim(),
        createdAt: exists?.createdAt || new Date().toISOString(),
      };
      return {
        ...prev,
        suppliers: exists
          ? existingList.map((s) => (s.id === id ? record : s))
          : [record, ...existingList],
      };
    });
    notify(`Saved supplier "${sup.name.trim()}".`, 'success');
  };

  const deleteSupplier = (supplierId: string) => {
    if (isSuperAdmin(activeStaff)) return;
    const hasOpenPo = (state.purchaseOrders || []).some(
      (po) => po.supplierId === supplierId && po.balanceDueUsd > 0.01
    );
    if (hasOpenPo) {
      notify('Cannot remove supplier with unpaid Accounts Payable balance.', 'warning');
      return;
    }
    setState((prev) => ({
      ...prev,
      suppliers: (prev.suppliers || []).filter((s) => s.id !== supplierId),
    }));
  };

  const createPurchaseOrder: PosContextValue['createPurchaseOrder'] = (params) => {
    if (isSuperAdmin(activeStaff)) return null;
    const sup = (state.suppliers || []).find((s) => s.id === params.supplierId);
    if (!sup || params.lines.length === 0) return null;

    const seq = state.nextPoSeq || (state.purchaseOrders?.length || 0) + 1;
    const poNumber = `PO-2026-${String(seq).padStart(4, '0')}`;
    const nowIso = new Date().toISOString();
    const cleanLines: PurchaseOrderLine[] = params.lines.map((l, idx) => {
      const lineTotalUsd = roundCurrency(Math.max(0.01, l.orderedQty) * Math.max(0, l.unitCostUsd));
      return {
        ...l,
        id: `pol_${Date.now()}_${idx}_${Math.random().toString(36).slice(2, 5)}`,
        receivedQty: 0,
        lineTotalUsd,
      };
    });

    const subtotalUsd = roundCurrency(cleanLines.reduce((s, l) => s + l.lineTotalUsd, 0));
    const inputVatUsd = params.applyInputVat ? roundCurrency(subtotalUsd * 0.1) : 0;
    const totalUsd = roundCurrency(subtotalUsd + inputVatUsd);
    const totalKhr = usdToKhr(totalUsd, activeBranch.exchangeRate, activeBranch.rielRounding);
    const dueDate = computeDueDateFromTerms(params.orderDate, params.paymentTerms);

    const newPo: PurchaseOrder = {
      id: `po_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      poNumber,
      branchId: activeBranch.id,
      supplierId: sup.id,
      supplierName: sup.name,
      supplierVattin: sup.vattin,
      status: params.status || 'sent',
      paymentStatus: 'unpaid',
      orderDate: params.orderDate,
      expectedDate: params.expectedDate || params.orderDate,
      dueDate,
      paymentTerms: params.paymentTerms,
      applyInputVat: params.applyInputVat,
      whtPercent: params.whtPercent || 0,
      lines: cleanLines,
      subtotalUsd,
      inputVatUsd,
      totalUsd,
      totalKhr,
      receivedSubtotalUsd: 0,
      receivedVatUsd: 0,
      receivedTotalUsd: 0,
      paidUsd: 0,
      whtWithheldUsd: 0,
      balanceDueUsd: 0,
      grnHistory: [],
      payments: [],
      note: params.note?.trim() || undefined,
      createdBy: activeStaff.name,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    setState((prev) => {
      const log = appendAudit(
        prev,
        'Purchase Order created',
        `${poNumber} to ${sup.name} ($${totalUsd.toFixed(2)})`
      );
      return {
        ...prev,
        nextPoSeq: seq + 1,
        purchaseOrders: [newPo, ...(prev.purchaseOrders || [])],
        auditLogs: [log, ...prev.auditLogs],
      };
    });
    notify(`Created ${poNumber} ($${totalUsd.toFixed(2)}) for ${sup.name}!`, 'success');
    return newPo;
  };

  const autoDraftLowStockPurchaseOrders = (): number => {
    if (isSuperAdmin(activeStaff)) return 0;
    const proposals = computeLowStockAutoDraftPos({
      branchId: activeBranch.id,
      ingredients: state.ingredients,
      suppliers: state.suppliers || [],
      existingPos: state.purchaseOrders || [],
    });
    if (proposals.length === 0) {
      notify('All low-stock ingredients are already covered or above minimum level!', 'info');
      return 0;
    }

    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
    const nowIso = new Date().toISOString();

    setState((prev) => {
      let seq = prev.nextPoSeq || (prev.purchaseOrders?.length || 0) + 1;
      const drafted: PurchaseOrder[] = proposals.map((prop) => {
        const poNumber = `PO-2026-${String(seq++).padStart(4, '0')}`;
        const applyVat = Boolean(prop.supplierVattin);
        const inputVatUsd = applyVat ? roundCurrency(prop.subtotalUsd * 0.1) : 0;
        const totalUsd = roundCurrency(prop.subtotalUsd + inputVatUsd);
        return {
          id: `po_auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          poNumber,
          branchId: activeBranch.id,
          supplierId: prop.supplierId,
          supplierName: prop.supplierName,
          supplierVattin: prop.supplierVattin,
          status: 'draft',
          paymentStatus: 'unpaid',
          orderDate: today,
          expectedDate: tomorrow,
          dueDate: computeDueDateFromTerms(today, prop.paymentTerms),
          paymentTerms: prop.paymentTerms,
          applyInputVat: applyVat,
          whtPercent: 0,
          lines: prop.lines,
          subtotalUsd: prop.subtotalUsd,
          inputVatUsd,
          totalUsd,
          totalKhr: usdToKhr(totalUsd, activeBranch.exchangeRate, activeBranch.rielRounding),
          receivedSubtotalUsd: 0,
          receivedVatUsd: 0,
          receivedTotalUsd: 0,
          paidUsd: 0,
          whtWithheldUsd: 0,
          balanceDueUsd: 0,
          grnHistory: [],
          payments: [],
          note: 'Auto-drafted from low-stock alert threshold',
          createdBy: activeStaff.name,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
      });

      const log = appendAudit(
        prev,
        'Auto-drafted Low-Stock POs',
        `Generated ${drafted.length} draft PO(s) for low-stock ingredients`
      );

      return {
        ...prev,
        nextPoSeq: seq,
        purchaseOrders: [...drafted, ...(prev.purchaseOrders || [])],
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    notify(`Auto-drafted ${proposals.length} restock Purchase Order(s)!`, 'success');
    return proposals.length;
  };

  const updatePurchaseOrderStatus: PosContextValue['updatePurchaseOrderStatus'] = (
    poId,
    status
  ) => {
    if (isSuperAdmin(activeStaff)) return;
    setState((prev) => ({
      ...prev,
      purchaseOrders: (prev.purchaseOrders || []).map((po) => {
        if (po.id !== poId) return po;
        if (status === 'cancelled' && po.receivedTotalUsd > 0) {
          return po;
        }
        return { ...po, status, updatedAt: new Date().toISOString() };
      }),
    }));
    notify(`Purchase Order updated to ${status.toUpperCase()}.`, 'info');
  };

  const receivePurchaseOrder: PosContextValue['receivePurchaseOrder'] = (params) => {
    if (isSuperAdmin(activeStaff)) return false;
    const targetPo = (state.purchaseOrders || []).find((p) => p.id === params.poId);
    if (!targetPo || targetPo.status === 'cancelled') return false;

    const validReceipts = params.lines.filter((l) => l.qtyReceivedNow > 0);
    if (validReceipts.length === 0) return false;

    const nowIso = new Date().toISOString();

    setState((prev) => {
      const po = (prev.purchaseOrders || []).find((p) => p.id === params.poId);
      if (!po) return prev;

      const updatedLines = po.lines.map((line) => {
        const rec = validReceipts.find((r) => r.lineId === line.id);
        if (!rec) return line;
        const nextReceived = roundCurrency(line.receivedQty + rec.qtyReceivedNow);
        const effectiveCost = rec.unitCostUsd > 0 ? rec.unitCostUsd : line.unitCostUsd;
        return {
          ...line,
          receivedQty: nextReceived,
          unitCostUsd: effectiveCost,
          lineTotalUsd: roundCurrency(line.orderedQty * effectiveCost),
        };
      });

      const grnLines = validReceipts.map((r) => {
        const origLine = po.lines.find((l) => l.id === r.lineId)!;
        const unitCost = r.unitCostUsd > 0 ? r.unitCostUsd : origLine.unitCostUsd;
        return {
          lineId: r.lineId,
          ingredientId: origLine.ingredientId,
          itemName: origLine.itemName,
          qtyReceivedNow: r.qtyReceivedNow,
          unitCostUsd: unitCost,
          lineSubtotalUsd: roundCurrency(r.qtyReceivedNow * unitCost),
        };
      });

      const grnSubtotal = roundCurrency(
        grnLines.reduce((s, l) => s + l.lineSubtotalUsd, 0)
      );
      const grnVat = po.applyInputVat ? roundCurrency(grnSubtotal * 0.1) : 0;
      const grnTotal = roundCurrency(grnSubtotal + grnVat);
      const grnNumber = `GRN-${String(po.grnHistory.length + 1).padStart(4, '0')}`;

      // Update kitchen ingredients stock & weighted moving-average cost
      const nextIngredients = prev.ingredients.map((ing) => ({ ...ing }));
      const nextStockHistory = [...prev.stockHistory];

      for (const gl of grnLines) {
        if (!gl.ingredientId) continue;
        const origLine = po.lines.find((l) => l.id === gl.lineId);
        const conv = Math.max(1, origLine?.conversionFactor || 1);
        const addedBaseUnits = roundCurrency(gl.qtyReceivedNow * conv);
        const targetIng = nextIngredients.find((i) => i.id === gl.ingredientId);
        if (targetIng && addedBaseUnits > 0) {
          const oldVal = Math.max(0, targetIng.onHand) * targetIng.avgCostUsd;
          const nextOnHand = roundCurrency(targetIng.onHand + addedBaseUnits);
          const nextAvg =
            nextOnHand > 0
              ? Number(((oldVal + gl.lineSubtotalUsd) / nextOnHand).toFixed(5))
              : targetIng.avgCostUsd;
          targetIng.onHand = nextOnHand;
          targetIng.avgCostUsd = nextAvg;
          nextStockHistory.unshift({
            id: `sh_grn_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
            ingredientId: targetIng.id,
            ingredientName: targetIng.nameEn,
            type: 'purchase',
            qtyDelta: addedBaseUnits,
            costUsd: gl.lineSubtotalUsd,
            note: `${po.poNumber} · ${grnNumber}`,
            createdAt: nowIso,
          });
        }
      }

      const allFullyReceived = updatedLines.every(
        (l) => l.receivedQty >= l.orderedQty - 0.0001
      );
      const nextStatus: PurchaseOrder['status'] = allFullyReceived ? 'received' : 'partial';
      const nextRecSub = roundCurrency(po.receivedSubtotalUsd + grnSubtotal);
      const nextRecVat = roundCurrency(po.receivedVatUsd + grnVat);
      const nextRecTot = roundCurrency(po.receivedTotalUsd + grnTotal);
      const nextBalanceDue = roundCurrency(
        Math.max(0, nextRecTot - po.paidUsd - po.whtWithheldUsd)
      );
      const nextPayStatus: PurchaseOrder['paymentStatus'] =
        nextBalanceDue <= 0.009
          ? 'paid'
          : po.paidUsd + po.whtWithheldUsd > 0
            ? 'partial'
            : 'unpaid';

      const updatedPo: PurchaseOrder = {
        ...po,
        status: nextStatus,
        paymentStatus: nextPayStatus,
        lines: updatedLines,
        receivedSubtotalUsd: nextRecSub,
        receivedVatUsd: nextRecVat,
        receivedTotalUsd: nextRecTot,
        balanceDueUsd: nextBalanceDue,
        grnHistory: [
          {
            id: `grn_${Date.now()}`,
            grnNumber,
            receivedAt: nowIso,
            receivedBy: activeStaff.name,
            supplierInvoiceRef: params.supplierInvoiceRef?.trim() || undefined,
            note: params.note?.trim() || undefined,
            lines: grnLines,
            subtotalUsd: grnSubtotal,
            inputVatUsd: grnVat,
            totalUsd: grnTotal,
          },
          ...po.grnHistory,
        ],
        updatedAt: nowIso,
      };

      // Automated Double-Entry Journal: Debit Inventory + Input VAT / Credit Accounts Payable
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const grnJe = buildPoGrnJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        branchId: po.branchId,
        poNumber: po.poNumber,
        grnNumber,
        supplierName: po.supplierName,
        subtotalUsd: grnSubtotal,
        inputVatUsd: grnVat,
        totalUsd: grnTotal,
        accounts: coa,
        exchangeRate: activeBranch.exchangeRate,
        postedBy: activeStaff.name,
        date: nowIso.slice(0, 10),
      });

      const log = appendAudit(
        prev,
        'Goods Received (GRN)',
        `${grnNumber} on ${po.poNumber} ($${grnTotal.toFixed(2)} posted to Inventory & AP)`
      );

      return {
        ...prev,
        ingredients: nextIngredients,
        stockHistory: nextStockHistory.slice(0, 80),
        purchaseOrders: (prev.purchaseOrders || []).map((p) =>
          p.id === po.id ? updatedPo : p
        ),
        accounts: coa,
        journalEntries: grnJe
          ? [grnJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: grnJe ? jeSeq + 1 : jeSeq,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    notify('Goods Receipt (GRN) recorded — stock, moving-avg cost & AP ledger updated!', 'success');
    return true;
  };

  const payPurchaseOrder: PosContextValue['payPurchaseOrder'] = (params) => {
    if (isSuperAdmin(activeStaff)) return false;
    const targetPo = (state.purchaseOrders || []).find((p) => p.id === params.poId);
    if (!targetPo || params.grossSettledUsd <= 0) return false;

    const nowIso = new Date().toISOString();
    const whtPct = Math.max(0, Math.min(30, params.whtPercent ?? targetPo.whtPercent ?? 0));
    const grossSettled = roundCurrency(
      Math.min(targetPo.balanceDueUsd, params.grossSettledUsd)
    );
    if (grossSettled <= 0) return false;

    const whtDeductedUsd = roundCurrency((grossSettled * whtPct) / 100);
    const cashPaidUsd = roundCurrency(grossSettled - whtDeductedUsd);
    const cleanRef =
      params.paymentRef.trim() || `${params.method.toUpperCase()}-${Date.now().toString().slice(-6)}`;

    setState((prev) => {
      const po = (prev.purchaseOrders || []).find((p) => p.id === params.poId);
      if (!po) return prev;

      const nextPaid = roundCurrency(po.paidUsd + cashPaidUsd);
      const nextWht = roundCurrency(po.whtWithheldUsd + whtDeductedUsd);
      const nextBalance = roundCurrency(
        Math.max(0, po.receivedTotalUsd - nextPaid - nextWht)
      );
      const nextPayStatus: PurchaseOrder['paymentStatus'] =
        nextBalance <= 0.009 ? 'paid' : 'partial';

      const payRec: PurchaseOrderPaymentRecord = {
        id: `popay_${Date.now()}`,
        paidAt: nowIso,
        paidBy: activeStaff.name,
        method: params.method,
        grossSettledUsd: grossSettled,
        whtDeductedUsd,
        cashPaidUsd,
        paymentRef: cleanRef,
        note: params.note?.trim() || undefined,
      };

      const updatedPo: PurchaseOrder = {
        ...po,
        paidUsd: nextPaid,
        whtWithheldUsd: nextWht,
        balanceDueUsd: nextBalance,
        paymentStatus: nextPayStatus,
        payments: [payRec, ...po.payments],
        updatedAt: nowIso,
      };

      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const payJe = buildPoPaymentJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        branchId: po.branchId,
        poNumber: po.poNumber,
        supplierName: po.supplierName,
        grossSettledUsd: grossSettled,
        whtDeductedUsd,
        cashPaidUsd,
        method: params.method,
        paymentRef: cleanRef,
        accounts: coa,
        exchangeRate: activeBranch.exchangeRate,
        postedBy: activeStaff.name,
        date: nowIso.slice(0, 10),
      });

      const log = appendAudit(
        prev,
        'Vendor AP Payment',
        `Paid $${cashPaidUsd.toFixed(2)} to ${po.supplierName} (${po.poNumber})`
      );

      return {
        ...prev,
        purchaseOrders: (prev.purchaseOrders || []).map((p) =>
          p.id === po.id ? updatedPo : p
        ),
        accounts: coa,
        journalEntries: payJe
          ? [payJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: payJe ? jeSeq + 1 : jeSeq,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    notify(`Settled $${grossSettled.toFixed(2)} AP on ${targetPo.poNumber}!`, 'success');
    return true;
  };

  // -------------------------------------------------------------------------
  // Double-Entry Accounting & General Ledger Actions
  // -------------------------------------------------------------------------
  const saveLedgerAccount: PosContextValue['saveLedgerAccount'] = (acc) => {
    if (isSuperAdmin(activeStaff)) return;
    setState((prev) => {
      const coa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const cleanCode = acc.code.trim();
      const existing = coa.find((a) => a.code === cleanCode || a.id === acc.id);
      const record: LedgerAccount = {
        ...acc,
        id: existing?.id || `coa_${cleanCode}_${Date.now().toString(36)}`,
        code: cleanCode,
        systemAccount: existing?.systemAccount ?? false,
      };
      const nextAccounts = existing
        ? coa.map((a) => (a.code === existing.code ? record : a))
        : [...coa, record].sort((a, b) => a.code.localeCompare(b.code));
      return { ...prev, accounts: nextAccounts };
    });
    notify(`Saved account ${acc.code} — ${acc.nameEn}.`, 'success');
  };

  const recordOperatingExpense: PosContextValue['recordOperatingExpense'] = (params) => {
    if (isSuperAdmin(activeStaff)) return null;
    if (params.subtotalUsd <= 0 || !params.vendorName.trim()) return null;

    const coa =
      state.accounts && state.accounts.length > 0
        ? state.accounts
        : createDefaultChartOfAccounts();
    const accountName = resolveAccountName(coa, params.expenseAccountCode);
    const subtotalUsd = roundCurrency(params.subtotalUsd);
    const inputVatUsd = params.applyInputVat ? roundCurrency(subtotalUsd * 0.1) : 0;
    const totalUsd = roundCurrency(subtotalUsd + inputVatUsd);
    const whtPct = Math.max(0, Math.min(30, params.whtPercent || 0));
    const whtAmountUsd = roundCurrency((subtotalUsd * whtPct) / 100);
    const cashPaidUsd =
      params.paymentStatus === 'paid'
        ? roundCurrency(totalUsd - whtAmountUsd)
        : 0;
    const expSeq = (state.expenses?.length || 0) + 1;
    const voucherNo = `EXP-${String(expSeq).padStart(4, '0')}`;
    const nowIso = new Date().toISOString();

    const expense: OperatingExpense = {
      id: `exp_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      voucherNo,
      branchId: activeBranch.id,
      date: params.date,
      expenseAccountCode: params.expenseAccountCode,
      expenseAccountName: accountName,
      vendorName: params.vendorName.trim(),
      vendorVattin: params.vendorVattin?.trim() || undefined,
      description: params.description.trim() || accountName,
      subtotalUsd,
      applyInputVat: params.applyInputVat,
      inputVatUsd,
      whtPercent: whtPct,
      whtAmountUsd,
      totalUsd,
      cashPaidUsd,
      paymentStatus: params.paymentStatus,
      paymentMethod: params.paymentMethod || 'Cash',
      paymentRef: params.paymentRef?.trim() || undefined,
      createdBy: activeStaff.name,
      createdAt: nowIso,
    };

    setState((prev) => {
      const activeCoa =
        prev.accounts && prev.accounts.length > 0
          ? prev.accounts
          : createDefaultChartOfAccounts();
      const jeSeq = prev.nextJournalSeq || (prev.journalEntries?.length || 0) + 1;
      const expJe = buildOperatingExpenseJournal({
        entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
        expense,
        accounts: activeCoa,
        exchangeRate: activeBranch.exchangeRate,
        postedBy: activeStaff.name,
      });
      const log = appendAudit(
        prev,
        'Expense voucher posted',
        `${voucherNo}: ${accountName} ($${totalUsd.toFixed(2)})`
      );
      return {
        ...prev,
        accounts: activeCoa,
        expenses: [expense, ...(prev.expenses || [])],
        journalEntries: expJe
          ? [expJe, ...(prev.journalEntries || [])]
          : (prev.journalEntries || []),
        nextJournalSeq: expJe ? jeSeq + 1 : jeSeq,
        auditLogs: [log, ...prev.auditLogs],
      };
    });

    notify(`Posted expense ${voucherNo} ($${totalUsd.toFixed(2)}) to General Ledger!`, 'success');
    return expense;
  };

  const postManualJournalEntry: PosContextValue['postManualJournalEntry'] = (params) => {
    if (isSuperAdmin(activeStaff)) return false;
    const coa =
      state.accounts && state.accounts.length > 0
        ? state.accounts
        : createDefaultChartOfAccounts();
    const jeSeq = state.nextJournalSeq || (state.journalEntries?.length || 0) + 1;
    const entryNo = `JE-2026-${String(jeSeq).padStart(4, '0')}`;

    try {
      const built = finalizeBalancedJournal({
        entryNo,
        branchId: activeBranch.id,
        date: params.date,
        sourceType: 'manual',
        sourceRef: params.sourceRef?.trim() || 'MANUAL',
        description: params.description.trim(),
        rawLines: params.lines.map((l, idx) =>
          l.debitUsd > 0 || l.creditUsd > 0
            ? {
                id: `jl_man_${Date.now()}_${idx}`,
                accountCode: l.accountCode,
                accountName: resolveAccountName(coa, l.accountCode),
                debitUsd: roundCurrency(Math.max(0, l.debitUsd)),
                creditUsd: roundCurrency(Math.max(0, l.creditUsd)),
                memo: l.memo?.trim() || undefined,
              }
            : null
        ),
        exchangeRate: activeBranch.exchangeRate,
        postedBy: activeStaff.name,
      });
      if (!built) {
        notify('Manual journal requires at least 2 balanced lines.', 'warning');
        return false;
      }

      setState((prev) => {
        const log = appendAudit(
          prev,
          'Manual journal posted',
          `${entryNo}: ${params.description.trim()} ($${built.totalDebitUsd.toFixed(2)})`
        );
        return {
          ...prev,
          accounts: coa,
          journalEntries: [built, ...(prev.journalEntries || [])],
          nextJournalSeq: jeSeq + 1,
          auditLogs: [log, ...prev.auditLogs],
        };
      });
      notify(`Posted balanced journal ${entryNo} ($${built.totalDebitUsd.toFixed(2)})!`, 'success');
      return true;
    } catch (err) {
      notify(err instanceof Error ? err.message : 'Journal entry is not balanced.', 'error');
      return false;
    }
  };

  const reverseJournalEntry: PosContextValue['reverseJournalEntry'] = (entryId, reason) => {
    if (isSuperAdmin(activeStaff)) return false;
    const orig = (state.journalEntries || []).find((e) => e.id === entryId);
    if (!orig || orig.reversed) {
      notify('This journal entry has already been reversed.', 'warning');
      return false;
    }

    const coa =
      state.accounts && state.accounts.length > 0
        ? state.accounts
        : createDefaultChartOfAccounts();
    const jeSeq = state.nextJournalSeq || (state.journalEntries?.length || 0) + 1;
    const revJe = buildReversalJournal({
      entryNo: `JE-2026-${String(jeSeq).padStart(4, '0')}`,
      original: orig,
      accounts: coa,
      postedBy: activeStaff.name,
      reason,
    });
    if (!revJe) return false;

    setState((prev) => {
      const log = appendAudit(
        prev,
        'Journal entry reversed',
        `Reversed ${orig.entryNo} via ${revJe.entryNo}`,
        'warning'
      );
      return {
        ...prev,
        accounts: coa,
        journalEntries: [
          revJe,
          ...(prev.journalEntries || []).map((e) =>
            e.id === entryId ? { ...e, reversed: true } : e
          ),
        ],
        nextJournalSeq: jeSeq + 1,
        auditLogs: [log, ...prev.auditLogs],
      };
    });
    notify(`Reversed ${orig.entryNo} via ${revJe.entryNo}.`, 'info');
    return true;
  };

  const value: PosContextValue = {
    state,
    activeBranch,
    activeStaff,
    language,
    setLanguage,
    navSection,
    setNavSection,
    externalMode,
    setExternalMode,
    isEnteredPos,
    platformSettings,
    demoUsersCount,
    setDemoUsersDisabled,
    setTenantStatus,
    deleteTenantWorkspace,
    startDemoPreset,
    staffSignIn,
    staffSignInRemote,
    exitToWelcome,
    firebaseUser,
    saasUser: firebaseUser,
    shopId,
    authLoading,
    cloudStatus,
    sseConnected,
    loginWithEmailPassword,
    registerWithEmailPassword,
    resetSaasPassword,
    signInWithGoogle,
    signOutGoogle,
    toasts,
    notify,
    dismissToast,
    setOrderGuests,
    cancelEmptyOrder,
    voidOrder,
    addLoyaltyMember,
    toggleTenantFeatureFlag,
    reloadTenantsFromSqlite,
    selectedTableId,
    setSelectedTableId,
    activeOrderId,
    setActiveOrderId,
    receiptOrder,
    setReceiptOrder,
    tenants,
    activeTenantId,
    registerTenant,
    switchTenant,
    switchBranch,
    openTableOrder,
    createTakeAwayOrder,
    addItemToOrder,
    updateOrderItemQty,
    updateOrderItemNote,
    clearDraftItems,
    sendOrderToKitchen,
    advanceKdsOrder,
    voidOrderItem,
    moveOrderToTable,
    splitOrderItems,
    applyOrderDiscount,
    setOrderPromoCode,
    attachMemberToOrder,
    applyPrepaidPack,
    settleOrderPayment,
    submitGuestQrOrder,
    acceptQrOrder,
    rejectQrOrder,
    createGroupSession,
    addGroupSessionItem,
    submitGroupSessionToPos,
    createReservation,
    confirmReservation,
    payReservationDeposit,
    seatReservation,
    cancelReservation,
    openShift,
    addPettyCash,
    closeShift,
    addIngredient,
    recordIngredientPurchase,
    recordIngredientWaste,
    recordStockCount,
    saveRecipe,
    saveMenuItem,
    deleteMenuItem,
    importMenuItems,
    saveTable,
    deleteTable,
    togglePromotion,
    addPromotion,
    addPrepaidTemplate,
    sellPrepaidPack,
    voidCustomerPack,
    saveStaffMember,
    switchActiveStaff,
    tenantStates,
    isAdminUser,
    hasCurrentPermission,
    updateStaffPermissions,
    updateTenantOwnerPermissions,
    grantAllStaffInTenant,
    updateBranchSettingsForTenant,
    issueTaxInvoice,
    createCreditNote,
    updateBranchSettings,
    addBranch,
    setPlan,
    activateTenantSubscription,
    toggleOfflineMode,
    syncOfflineBills,
    setDisplayOrder,
    resetDemoData,
    saveSupplier,
    deleteSupplier,
    createPurchaseOrder,
    autoDraftLowStockPurchaseOrders,
    updatePurchaseOrderStatus,
    receivePurchaseOrder,
    payPurchaseOrder,
    saveLedgerAccount,
    recordOperatingExpense,
    postManualJournalEntry,
    reverseJournalEntry,
  };

  return <PosContext.Provider value={value}>{children}</PosContext.Provider>;
}

export function usePos() {
  const ctx = useContext(PosContext);
  if (!ctx) throw new Error('usePos must be used within PosProvider');
  return ctx;
}
